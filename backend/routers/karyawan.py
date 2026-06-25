from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
import aiomysql
from database import get_db
from dependencies import req_owner, hash_pwd
from models import KaryawanIn, KaryawanUpd
import uuid

router = APIRouter(prefix="/karyawan", tags=["Karyawan"])
@router.get("", tags=["👤 Karyawan"])
async def list_karyawan(user=Depends(req_owner), cur=Depends(get_db)):
    await cur.execute(
        "SELECT id_karyawan AS id, nama_lengkap AS nama, email, no_telepon AS telepon, role, is_aktif, "
        "gaji_per_bulan AS gaji, tanggal_masuk, created_at FROM KARYAWAN ORDER BY tanggal_masuk DESC"
    )
    rows = await cur.fetchall()
    
    # Format datanya secara elegan jika dibutuhkan (karena TiDB sudah berbentuk Dict)
    for r in rows:
        r["gaji"] = fmt_float(r["gaji"])
        r["tanggal_masuk"] = fmt_date(r["tanggal_masuk"])
        r["created_at"] = fmt_date(r["created_at"])
        
    return rows


@router.post("", status_code=201, tags=["👤 Karyawan"])
async def tambah_karyawan(body: KaryawanIn, user=Depends(req_owner), cur=Depends(get_db)):
    # 1. Cek apakah email sudah ada (Dialek MySQL)
    await cur.execute("SELECT COUNT(*) AS total FROM KARYAWAN WHERE email = %(e)s", {"e": body.email})
    cek = await cur.fetchone()
    if cek["total"] > 0:
        raise HTTPException(409, f"Email '{body.email}' sudah terdaftar.")

    # 2. Masukkan data ke pangkalan data
    kid = f"k-{uuid.uuid4()}"
    await cur.execute(
        "INSERT INTO KARYAWAN (id_karyawan, nama_lengkap, email, no_telepon, "
        "password_hash, role, gaji_per_bulan) VALUES (%(id)s, %(n)s, %(e)s, %(t)s, %(h)s, %(r)s, %(g)s)",
        {"id": kid, "n": body.nama_lengkap, "e": body.email, "t": body.no_telepon,
         "h": hash_pwd(body.password), "r": body.role, "g": body.gaji_per_bulan},
    )
    # Tidak perlu "await conn.commit()" lagi karena sudah otomatis!
    
    log.info(f"[Karyawan] Baru: {body.email} (role={body.role})")
    return {"message": "Karyawan berhasil ditambahkan.", "id_karyawan": kid}


@router.put("/{kid}", tags=["👤 Karyawan"])
async def update_karyawan(kid: str, body: KaryawanUpd, user=Depends(req_owner), cur=Depends(get_db)):
    await cur.execute("SELECT id_karyawan FROM KARYAWAN WHERE id_karyawan = %(id)s", {"id": kid})
    if not await cur.fetchone():
        raise HTTPException(404, "Karyawan tidak ditemukan.")

    if body.is_aktif == 0 and kid == user["id"]:
        raise HTTPException(400, "Anda tidak dapat menonaktifkan akun sendiri.")

    sets, params = [], {"id": kid}
    if body.nama_lengkap   is not None: sets.append("nama_lengkap   = %(n)s"); params["n"] = body.nama_lengkap
    if body.no_telepon     is not None: sets.append("no_telepon     = %(t)s"); params["t"] = body.no_telepon
    if body.is_aktif       is not None: sets.append("is_aktif       = %(a)s"); params["a"] = body.is_aktif
    if body.gaji_per_bulan is not None: sets.append("gaji_per_bulan = %(g)s"); params["g"] = body.gaji_per_bulan

    if not sets:
        raise HTTPException(400, "Tidak ada field yang diupdate.")

    await cur.execute(f"UPDATE KARYAWAN SET {', '.join(sets)} WHERE id_karyawan = %(id)s", params)
    return {"message": "Karyawan berhasil diperbarui."}

