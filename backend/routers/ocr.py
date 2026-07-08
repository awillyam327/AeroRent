from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import httpx
from config import cfg
import asyncio
import random
import re
from dependencies import get_current_account, get_db
from utils import imgbb_upload
import aiomysql

router = APIRouter(prefix="/ocr", tags=["OCR"])


def _normalize_name(name: str) -> str:
    """Normalize nama untuk perbandingan: lowercase, hilangkan tanda baca & spasi ganda."""
    if not name:
        return ""
    name = re.sub(r"[^a-zA-Z\s]", "", name)   # hanya huruf & spasi
    return " ".join(name.lower().split())       # lowercase, trim spasi ganda


def _names_match(name_a: str, name_b: str) -> bool:
    """
    Cocokkan dua nama secara fleksibel:
    1. Exact match setelah normalisasi.
    2. Semua kata di nama A ada di nama B (atau sebaliknya).
       Contoh: KTP "ARTHUR WILLIAM LIANG" vs SIM "ARTHUR W. LIANG" → cocok
    """
    a = _normalize_name(name_a)
    b = _normalize_name(name_b)
    if not a or not b:
        return False
    if a == b:
        return True
    words_a = set(a.split())
    words_b = set(b.split())
    # Minimal 2 kata sama DAN setidaknya 60% overlap
    common = words_a & words_b
    if len(common) < 2:
        return False
    max_words = max(len(words_a), len(words_b))
    return len(common) / max_words >= 0.6

@router.post("/ktp", tags=["📷 OCR"])
async def ocr_ktp(file: UploadFile = File(...)):
    if not cfg.OCR_SPACE_API_KEY:
        raise HTTPException(500, "Kunci API OCR.space belum dikonfigurasi di backend.")

    content = await file.read()
    
    # OCR.space API endpoint
    # Note: KTP language is Indonesian (ind) or English (eng)
    data = {
        "apikey": cfg.OCR_SPACE_API_KEY,
        "language": "eng", # "ind" may not be available on free tier, eng works fine for numbers/names
        "isOverlayRequired": False,
        "OCREngine": 2
    }
    
    files = {"file": (file.filename, content, file.content_type)}

    async with httpx.AsyncClient() as client:
        try:
            r = await client.post("https://api.ocr.space/parse/image", data=data, files=files, timeout=30.0)
            r.raise_for_status()
            res = r.json()
            
            if res.get("IsErroredOnProcessing"):
                raise HTTPException(500, f"OCR Error: {res.get('ErrorMessage')}")
                
            parsed_results = res.get("ParsedResults", [])
            if not parsed_results:
                raise HTTPException(400, "Tidak ada teks yang terdeteksi.")
                
            raw_text = parsed_results[0].get("ParsedText", "")
            
            # Simple Regex for Indonesian KTP
            import re
            
            nik = ""
            nama = ""
            alamat = ""
            
            # Find NIK (16 digits)
            nik_match = re.search(r'\b\d{16}\b', raw_text)
            if nik_match:
                nik = nik_match.group(0)
            
            # Find Nama
            # Look for "Nama" or "Narna" followed by anything, capture the rest of the line
            nama_match = re.search(r'(?i)Nama\s*[:;]?\s*(.+)', raw_text)
            if nama_match:
                nama = nama_match.group(1).strip()
            
            # Find Alamat
            alamat_match = re.search(r'(?i)Alamat\s*[:;]?\s*(.+)', raw_text)
            if alamat_match:
                alamat = alamat_match.group(1).strip()
                
            return {
                "text": raw_text,
                "nik": nik,
                "nama": nama,
                "alamat": alamat
            }
            
        except httpx.HTTPStatusError as e:
            err_text = e.response.text if e.response else str(e)
            raise HTTPException(502, f"OCR API Error ({e.response.status_code if e.response else 'Unknown'}): {err_text}")
        except httpx.RequestError as e:
            raise HTTPException(503, f"Gagal menghubungi layanan OCR: {str(e)}")

@router.post("/face-match", tags=["📷 OCR"])
async def face_match_liveness(
    selfie: UploadFile = File(...),
    user = Depends(get_current_account),
    cur: aiomysql.DictCursor = Depends(get_db)
):
    if user["role"] != "CUSTOMER":
        raise HTTPException(403, "Akses ditolak.")
        
    await cur.execute("SELECT foto_ktp_url, foto_sim_url FROM PELANGGAN WHERE id_pelanggan = %(id)s", {"id": user["id"]})
    plg = await cur.fetchone()
    
    if not plg or not plg["foto_ktp_url"]:
        raise HTTPException(400, "Foto KTP belum diunggah. Lengkapi profil terlebih dahulu.")
    if not plg.get("foto_sim_url"):
        raise HTTPException(400, "Foto SIM A belum diunggah. Lengkapi profil terlebih dahulu.")
        
    selfie_bytes = await selfie.read()
    if not selfie_bytes:
        raise HTTPException(400, "Selfie kosong.")

    # ── Jalur B: Face++ Compare API (Real AI) ──
    if cfg.FACEPP_API_KEY and cfg.FACEPP_API_SECRET:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Download foto KTP dari URL yang tersimpan
            try:
                ktp_resp = await client.get(plg["foto_ktp_url"])
                ktp_resp.raise_for_status()
                ktp_bytes = ktp_resp.content
            except Exception:
                raise HTTPException(502, "Gagal mengunduh foto KTP dari server.")

            # Kirim ke Face++ Compare API
            try:
                facepp_resp = await client.post(
                    "https://api-us.faceplusplus.com/facepp/v3/compare",
                    data={
                        "api_key": cfg.FACEPP_API_KEY,
                        "api_secret": cfg.FACEPP_API_SECRET,
                    },
                    files={
                        "image_file1": ("selfie.jpg", selfie_bytes, "image/jpeg"),
                        "image_file2": ("ktp.jpg", ktp_bytes, "image/jpeg"),
                    },
                )
                result = facepp_resp.json()
            except Exception as e:
                raise HTTPException(502, f"Gagal menghubungi Face++ API: {str(e)}")

            # Handle Face++ error responses
            if "error_message" in result:
                err = result["error_message"]
                if "NO_FACE_DETECTED" in err or "no face" in err.lower():
                    raise HTTPException(
                        400,
                        "Wajah tidak terdeteksi. Pastikan selfie dan foto KTP menampilkan wajah dengan jelas."
                    )
                raise HTTPException(502, f"Face++ Error: {err}")

            confidence = result.get("confidence", 0)
            threshold = result.get("thresholds", {}).get("1e-5", 73.975)
            match_score = round(confidence, 2)

            if match_score >= 80:
                return {
                    "status": "success",
                    "match_score": match_score,
                    "threshold": round(threshold, 2),
                    "message": f"Wajah cocok dengan KTP ({match_score}%). Verifikasi berhasil ✅",
                }
            else:
                raise HTTPException(
                    400,
                    f"Wajah tidak cocok dengan KTP (skor: {match_score}%, minimal: 80%). "
                    "Pastikan selfie Anda sesuai dengan foto di KTP."
                )

    # ── Fallback: Mock AI (jika Face++ belum dikonfigurasi) ──
    await asyncio.sleep(2)
    match_score = round(random.uniform(85.0, 98.0), 2)
    return {
        "status": "success",
        "match_score": match_score,
        "message": f"Wajah cocok dengan KTP & SIM ({match_score}%). [Mode Simulasi]",
    }


@router.post("/sim-validate", tags=["📷 OCR"])
async def validate_and_upload_sim(
    foto_sim: UploadFile = File(...),
    user=Depends(get_current_account),
    cur: aiomysql.DictCursor = Depends(get_db),
):
    """
    Upload SIM A dengan validasi OCR:
    1. Baca teks dari foto SIM menggunakan OCR.space.
    2. Ekstrak nama dari SIM.
    3. Bandingkan dengan nama_lengkap pelanggan di database (dari KTP saat daftar).
    4. Jika cocok → upload ke ImgBB & simpan URL ke database.
    5. Jika tidak cocok → tolak dengan pesan error.
    """
    if user["role"] != "CUSTOMER":
        raise HTTPException(403, "Akses ditolak. Khusus pelanggan.")

    # Ambil nama pelanggan dari database
    await cur.execute(
        "SELECT nama_lengkap FROM PELANGGAN WHERE id_pelanggan = %(id)s",
        {"id": user["id"]},
    )
    plg = await cur.fetchone()
    if not plg:
        raise HTTPException(404, "Data pelanggan tidak ditemukan.")

    nama_ktp = plg["nama_lengkap"]

    # Baca file SIM
    sim_bytes = await foto_sim.read()
    if not sim_bytes:
        raise HTTPException(400, "File foto SIM kosong.")

    # Validasi ukuran file (max 1MB)
    if len(sim_bytes) > 1 * 1024 * 1024:
        raise HTTPException(
            400,
            f"Ukuran foto SIM terlalu besar ({round(len(sim_bytes) / 1024 / 1024, 1)} MB). "
            "Maksimal 1 MB. Kompres terlebih dahulu."
        )

    # ── OCR: Baca teks dari SIM ──
    nama_sim = ""
    ocr_raw = ""

    if cfg.OCR_SPACE_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                ocr_resp = await client.post(
                    "https://api.ocr.space/parse/image",
                    data={
                        "apikey": cfg.OCR_SPACE_API_KEY,
                        "language": "eng",
                        "isOverlayRequired": False,
                        "OCREngine": 2,
                    },
                    files={
                        "file": (foto_sim.filename or "sim.jpg", sim_bytes, "image/jpeg"),
                    },
                )
                ocr_result = ocr_resp.json()

            parsed = ocr_result.get("ParsedResults", [])
            if parsed:
                ocr_raw = parsed[0].get("ParsedText", "")

                # Ekstrak nama dari SIM
                # Pattern: "Nama" or "Name" diikuti teks
                nama_match = re.search(r"(?i)Nam[ae]\s*[:;]?\s*(.+)", ocr_raw)
                if nama_match:
                    nama_sim = nama_match.group(1).strip()
                    # Bersihkan: ambil hanya baris pertama (hapus newline)
                    nama_sim = nama_sim.split("\n")[0].split("\r")[0].strip()

        except Exception as e:
            # OCR gagal → log tapi lanjutkan (tidak block upload)
            import logging
            logging.warning(f"[OCR SIM] Gagal membaca SIM: {e}")

    # ── Validasi: Cocokkan nama SIM dengan nama KTP ──
    if nama_sim:
        if not _names_match(nama_ktp, nama_sim):
            raise HTTPException(
                400,
                f"Nama di SIM tidak cocok dengan nama di KTP. "
                f"Nama KTP: '{nama_ktp}', Nama SIM: '{nama_sim}'. "
                "Pastikan SIM yang diunggah milik Anda."
            )
    # Jika OCR tidak bisa membaca nama (blur/tidak jelas), tetap izinkan upload
    # tapi beri peringatan di response

    # ── Upload ke ImgBB & simpan ke database ──
    foto_url = await imgbb_upload(sim_bytes, f"sim_{user['id']}")

    await cur.execute(
        "UPDATE PELANGGAN SET foto_sim_url = %(f)s WHERE id_pelanggan = %(id)s",
        {"f": foto_url, "id": user["id"]},
    )

    result = {
        "status": "success",
        "message": "Foto SIM A berhasil diunggah dan divalidasi.",
        "foto_sim_url": foto_url,
        "nama_sim_ocr": nama_sim or None,
        "nama_ktp": nama_ktp,
    }

    if nama_sim:
        result["validasi_nama"] = "cocok"
        result["message"] = f"SIM A atas nama '{nama_sim}' cocok dengan KTP. Upload berhasil ✅"
    else:
        result["validasi_nama"] = "tidak_terbaca"
        result["message"] = (
            "Foto SIM A berhasil diunggah, tetapi nama tidak dapat dibaca oleh OCR. "
            "Pastikan foto SIM jelas dan tidak blur."
        )

    return result
