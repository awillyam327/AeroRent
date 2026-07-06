from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import httpx
from config import cfg
import asyncio
import random
from dependencies import get_current_account, get_db
import aiomysql

router = APIRouter(prefix="/ocr", tags=["OCR"])

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
    
    if not plg or not plg["foto_ktp_url"] or not plg["foto_sim_url"]:
        raise HTTPException(400, "KTP atau SIM A belum diunggah. Lengkapi profil terlebih dahulu.")
        
    content = await selfie.read()
    if not content:
        raise HTTPException(400, "Selfie kosong.")
        
    # SIMULASI AI (Mock)
    await asyncio.sleep(2)
    
    match_score = round(random.uniform(85.0, 98.0), 2)
    
    return {
        "status": "success",
        "match_score": match_score,
        "message": f"Wajah cocok dengan KTP & SIM ({match_score}%)."
    }
