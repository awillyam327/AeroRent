from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from utils import fmt_float, fmt_date
from typing import Optional
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner, get_current_account
from models import PelangganIn
from pydantic import BaseModel
from utils import imgbb_upload
import uuid
from config import log

class PelangganUpdateSaya(BaseModel):
    nama: str
    telp: str
    alamat: Optional[str] = None
    nik: Optional[str] = None

router = APIRouter(prefix="/pelanggan", tags=["Pelanggan"])
@router.get("", tags=["👥 Pelanggan"])
async def list_pelanggan(user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    try:
        await cur.execute(
            "SELECT id_pelanggan AS id, nama_lengkap AS nama, email, no_telepon AS telepon, alamat, "
            "foto_ktp_url AS foto_ktp, is_verified, created_at FROM PELANGGAN ORDER BY created_at DESC"
        )
        rows = await cur.fetchall()
        for r in rows: r["created_at"] = fmt_date(r["created_at"])
        return rows
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Pelanggan] Gagal memuat daftar pelanggan: {e}")
        raise HTTPException(500, "Gagal memuat daftar pelanggan.")

@router.put("/saya", tags=["Pelanggan"])
async def update_pelanggan_saya(
    body: PelangganUpdateSaya,
    user=Depends(get_current_account),
    cur=Depends(get_db)
):
    try:
        if user["role"] != "CUSTOMER":
            raise HTTPException(403, "Akses ditolak. Khusus pelanggan.")

        if body.nik and body.nik.strip():
            await cur.execute("SELECT id_pelanggan FROM PELANGGAN WHERE no_ktp = %(ktp)s AND id_pelanggan != %(id)s", {"ktp": body.nik, "id": user["id"]})
            if await cur.fetchone():
                raise HTTPException(400, "Nomor KTP ini sudah terdaftar pada akun lain.")

        await cur.execute(
            "UPDATE PELANGGAN SET nama_lengkap = %(n)s, no_telepon = %(t)s, alamat = %(a)s, no_ktp = COALESCE(%(nik)s, no_ktp) "
            "WHERE id_pelanggan = %(id)s",
            {"n": body.nama, "t": body.telp, "a": body.alamat, "nik": body.nik, "id": user["id"]}
        )
        return {"message": "Profil berhasil diperbarui."}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Pelanggan] Gagal update profil pelanggan {user.get('id')}: {e}")
        raise HTTPException(500, "Gagal memperbarui profil.")

@router.post("/saya/avatar", tags=["Pelanggan"])
async def upload_avatar_saya(
    foto: UploadFile = File(...),
    user=Depends(get_current_account),
    cur=Depends(get_db)
):
    try:
        if user["role"] != "CUSTOMER":
            raise HTTPException(403, "Akses ditolak. Khusus pelanggan.")

        img_bytes = await foto.read()
        if not img_bytes:
            raise HTTPException(400, "File foto kosong.")
        if len(img_bytes) > 5 * 1024 * 1024:
            raise HTTPException(400, "Ukuran file maksimal 5MB.")

        foto_url = await imgbb_upload(img_bytes, f"avatar_{user['id']}")

        await cur.execute(
            "UPDATE PELANGGAN SET foto_profil_url = %(f)s WHERE id_pelanggan = %(id)s",
            {"f": foto_url, "id": user["id"]}
        )
        return {"message": "Foto profil berhasil diperbarui.", "foto_profil_url": foto_url}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Pelanggan] Gagal upload avatar pelanggan {user.get('id')}: {e}")
        raise HTTPException(500, "Gagal mengunggah foto profil.")

@router.post("/saya/sim", tags=["Pelanggan"])
async def upload_sim_saya(
    foto_sim: UploadFile = File(...),
    user=Depends(get_current_account),
    cur=Depends(get_db)
):
    try:
        if user["role"] != "CUSTOMER":
            raise HTTPException(403, "Akses ditolak. Khusus pelanggan.")

        img_bytes = await foto_sim.read()
        if not img_bytes:
            raise HTTPException(400, "File foto SIM kosong.")
        if len(img_bytes) > 5 * 1024 * 1024:
            raise HTTPException(400, "Ukuran file maksimal 5MB.")

        foto_url = await imgbb_upload(img_bytes, f"sim_{user['id']}")

        await cur.execute(
            "UPDATE PELANGGAN SET foto_sim_url = %(f)s WHERE id_pelanggan = %(id)s",
            {"f": foto_url, "id": user["id"]}
        )
        return {"message": "Foto SIM A berhasil diunggah.", "foto_sim_url": foto_url}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Pelanggan] Gagal upload SIM pelanggan {user.get('id')}: {e}")
        raise HTTPException(500, "Gagal mengunggah foto SIM.")

@router.post("/{pid}/sim", tags=["👥 Pelanggan"])
async def upload_sim_pelanggan(
    pid: str,
    foto_sim: UploadFile = File(...),
    user=Depends(req_kasir_or_owner),
    cur=Depends(get_db)
):

    try:
        await cur.execute("SELECT id_pelanggan FROM PELANGGAN WHERE id_pelanggan = %(pid)s", {"pid": pid})
        if not await cur.fetchone():
            raise HTTPException(404, "Pelanggan tidak ditemukan.")

        img_bytes = await foto_sim.read()
        if not img_bytes:
            raise HTTPException(400, "File foto SIM kosong.")
        if len(img_bytes) > 5 * 1024 * 1024:
            raise HTTPException(400, "Ukuran file maksimal 5MB.")

        foto_url = await imgbb_upload(img_bytes, f"sim_{pid}")

        await cur.execute(
            "UPDATE PELANGGAN SET foto_sim_url = %(f)s WHERE id_pelanggan = %(id)s",
            {"f": foto_url, "id": pid}
        )
        log.info(f"[Pelanggan] SIM uploaded for {pid} by kasir {user.get('id')}")
        return {"message": "Foto SIM A berhasil diunggah.", "foto_sim_url": foto_url}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Pelanggan] Gagal upload SIM pelanggan {pid}: {e}")
        raise HTTPException(500, "Gagal mengunggah foto SIM.")

@router.get("/{pid}", tags=["👥 Pelanggan"])
async def detail_pelanggan(pid: str, user=Depends(get_current_account), cur=Depends(get_db)):
    try:
        if user["role"] == "CUSTOMER" and user["id"] != pid:
            raise HTTPException(403, "Akses ditolak.")

        await cur.execute(
            "SELECT id_pelanggan AS id, nama_lengkap AS nama, email, no_telepon AS telepon, alamat, "
            "no_ktp, foto_ktp_url AS foto_ktp, foto_sim_url AS foto_sim, is_verified, created_at "
            "FROM PELANGGAN WHERE id_pelanggan = %(pid)s",
            {"pid": pid}
        )
        r = await cur.fetchone()
        if not r: raise HTTPException(404, "Pelanggan tidak ditemukan.")
        r["created_at"] = fmt_date(r["created_at"])
        await cur.execute(
            "SELECT ts.nomor_booking AS booking, ts.tanggal_mulai AS tanggal, ts.total_biaya AS total, ts.status, k.nama_kendaraan AS kendaraan "
            "FROM TRANSAKSI_SEWA ts JOIN KENDARAAN k ON ts.id_kendaraan = k.id_kendaraan "
            "WHERE ts.id_pelanggan = %(id)s ORDER BY ts.created_at DESC LIMIT 5",
            {"id": pid},
        )
        txs = await cur.fetchall()
        for t in txs:
            t["tanggal"] = fmt_date(t["tanggal"])
            t["total"] = fmt_float(t["total"])

        r["riwayat_transaksi"] = txs
        await cur.execute(
            "SELECT COUNT(*) AS count_valid FROM TRANSAKSI_SEWA "
            "WHERE id_pelanggan = %(pid)s AND status IN ('SELESAI', 'DIKONFIRMASI', 'AKTIF')",
            {"pid": pid}
        )
        loyal = await cur.fetchone()
        count_valid = loyal["count_valid"] if loyal else 0
        r["stats"] = {
            "valid_count": count_valid,
            "next_is_promo": (count_valid % 3 == 2)
        }

        return r
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Pelanggan] Gagal memuat detail pelanggan {pid}: {e}")
        raise HTTPException(500, "Gagal memuat detail pelanggan.")

@router.post("", status_code=201, tags=["👥 Pelanggan"])
async def tambah_pelanggan(
    nama_lengkap: str             = Form(...),
    no_telepon:   str             = Form(...),
    email:        Optional[str]   = Form(None),
    alamat:       Optional[str]   = Form(None),
    no_ktp:       Optional[str]   = Form(None),
    foto_ktp:     Optional[UploadFile] = File(None),
    foto_sim:     Optional[UploadFile] = File(None),
    user=Depends(req_kasir_or_owner),
    cur=Depends(get_db),
):
    try:
        if not nama_lengkap or not nama_lengkap.strip():
            raise HTTPException(400, "Nama wajib diisi.")
        if not no_ktp or not no_ktp.strip():
            raise HTTPException(400, "NIK / Nomor KTP wajib diisi.")
        if not no_telepon or not no_telepon.strip():
            raise HTTPException(400, "Nomor telepon wajib diisi.")

        ktp_url = sim_url = None
        if foto_ktp and foto_ktp.filename: ktp_url = await imgbb_upload(await foto_ktp.read(), f"ktp_{no_telepon}")
        if foto_sim and foto_sim.filename: sim_url = await imgbb_upload(await foto_sim.read(), f"sim_{no_telepon}")

        pid = f"plg-{uuid.uuid4()}"
        await cur.execute(
            "INSERT INTO PELANGGAN (id_pelanggan, nama_lengkap, email, no_telepon, "
            "alamat, no_ktp, foto_ktp_url, foto_sim_url, is_verified) "
            "VALUES (%(id)s, %(n)s, %(e)s, %(t)s, %(a)s, %(kno)s, %(ku)s, %(su)s, %(v)s)",
            {"id": pid, "n": nama_lengkap, "e": email, "t": no_telepon,
             "a": alamat, "kno": no_ktp, "ku": ktp_url, "su": sim_url,
             "v": 1 if ktp_url else 0},
        )
        log.info(f"[Pelanggan] Baru: {nama_lengkap} ({no_telepon})")
        return {"message": "Pelanggan berhasil ditambahkan.", "id_pelanggan": pid}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Pelanggan] Gagal menambahkan pelanggan: {e}")
        raise HTTPException(500, "Gagal menambahkan pelanggan.")
