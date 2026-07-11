from fastapi import APIRouter, Depends, HTTPException
from utils import fmt_float, fmt_date
from typing import Optional
import aiomysql
from database import get_db
from dependencies import req_owner, get_current_user, hash_pwd
from models import KaryawanIn, KaryawanUpd
import uuid
from config import log

router = APIRouter(prefix="/karyawan", tags=["Karyawan"])

@router.get("/supir-aktif", tags=["👤 Karyawan"])
async def list_supir_aktif(user=Depends(get_current_user), cur=Depends(get_db)):
    try:
        await cur.execute(
            "SELECT id_karyawan AS id, nama_lengkap AS nama FROM KARYAWAN "
            "WHERE role = 'SUPIR' AND is_aktif = 1 ORDER BY nama_lengkap ASC"
        )
        return await cur.fetchall()
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Karyawan] Gagal memuat daftar supir aktif: {e}")
        raise HTTPException(500, "Gagal memuat daftar supir.")

@router.get("", tags=["👤 Karyawan"])
async def list_karyawan(user=Depends(req_owner), cur=Depends(get_db)):
    try:
        await cur.execute(
            "SELECT id_karyawan AS id, nama_lengkap AS nama, email, no_telepon AS telepon, role, is_aktif, "
            "gaji_per_bulan AS gaji, tanggal_masuk, created_at FROM KARYAWAN ORDER BY tanggal_masuk DESC"
        )
        rows = await cur.fetchall()
        
        for r in rows:
            r["gaji"] = fmt_float(r["gaji"])
            r["tanggal_masuk"] = fmt_date(r["tanggal_masuk"])
            r["created_at"] = fmt_date(r["created_at"])
            
        return rows
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Karyawan] Gagal memuat daftar karyawan: {e}")
        raise HTTPException(500, "Gagal memuat daftar karyawan.")


@router.post("", status_code=201, tags=["👤 Karyawan"])
async def tambah_karyawan(body: KaryawanIn, user=Depends(req_owner), cur=Depends(get_db)):
    try:
        # 1. Cek apakah email sudah ada, jika diberikan
        if body.email:
            await cur.execute("SELECT COUNT(*) AS total FROM KARYAWAN WHERE email = %(e)s", {"e": body.email})
            cek = await cur.fetchone()
            if cek["total"] > 0:
                raise HTTPException(409, f"Email '{body.email}' sudah terdaftar.")
        else:
            # Auto-generate dummy email based on phone number if email is not provided
            body.email = f"{body.no_telepon or uuid.uuid4().hex[:6]}@supir.aerorent.id"
            
        # Default password if not provided (e.g. for Supir)
        if not body.password:
            body.password = "AeroRent123!"

        # 2. Masukkan data ke database
        kid = f"EMP-{uuid.uuid4().hex[:6].upper()}"
        await cur.execute(
            "INSERT INTO KARYAWAN (id_karyawan, nama_lengkap, email, no_telepon, "
            "password_hash, role, gaji_per_bulan) VALUES (%(id)s, %(n)s, %(e)s, %(t)s, %(h)s, %(r)s, %(g)s)",
            {"id": kid, "n": body.nama_lengkap, "e": body.email, "t": body.no_telepon,
             "h": hash_pwd(body.password), "r": body.role, "g": body.gaji_per_bulan},
        )
        
        log.info(f"[Karyawan] Baru: {body.email} (role={body.role})")
        return {"message": "Karyawan berhasil ditambahkan.", "id_karyawan": kid}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Karyawan] Gagal menambahkan karyawan {body.email}: {e}")
        raise HTTPException(500, "Gagal menambahkan karyawan. Silakan coba lagi.")


@router.put("/{kid}", tags=["👤 Karyawan"])
async def update_karyawan(kid: str, body: KaryawanUpd, user=Depends(req_owner), cur=Depends(get_db)):
    try:
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
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Karyawan] Gagal update karyawan {kid}: {e}")
        raise HTTPException(500, "Gagal memperbarui data karyawan.")

@router.delete("/{kid}", tags=["👤 Karyawan"])
async def hapus_karyawan(kid: str, user=Depends(req_owner), cur=Depends(get_db)):
    try:
        if kid == user["id"]:
            raise HTTPException(400, "Anda tidak dapat menghapus akun Anda sendiri.")
            
        await cur.execute("SELECT id_karyawan FROM KARYAWAN WHERE id_karyawan = %(id)s", {"id": kid})
        if not await cur.fetchone():
            raise HTTPException(404, "Karyawan tidak ditemukan.")
            
        await cur.execute("DELETE FROM KARYAWAN WHERE id_karyawan = %(id)s", {"id": kid})
        log.info(f"[Karyawan] Dihapus: {kid} oleh {user['email']}")
        return {"message": "Karyawan berhasil dihapus."}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Karyawan] Gagal menghapus karyawan {kid}: {e}")
        raise HTTPException(400, "Gagal menghapus karyawan. Pastikan karyawan tidak memiliki transaksi atau data yang terikat.")
