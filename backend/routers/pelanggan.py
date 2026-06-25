from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from utils import fmt_float, fmt_date
from typing import Optional
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner
from models import PelangganIn
from utils import imgbb_upload
import uuid

router = APIRouter(prefix="/pelanggan", tags=["Pelanggan"])
@router.get("", tags=["👥 Pelanggan"])
async def list_pelanggan(user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    await cur.execute(
        "SELECT id_pelanggan AS id, nama_lengkap AS nama, email, no_telepon AS telepon, alamat, "
        "foto_ktp_url AS foto_ktp, is_verified, created_at FROM PELANGGAN ORDER BY created_at DESC"
    )
    rows = await cur.fetchall()
    for r in rows: r["created_at"] = fmt_date(r["created_at"])
    return rows


@router.get("/{pid}", tags=["👥 Pelanggan"])
async def detail_pelanggan(pid: str, user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    await cur.execute(
        "SELECT id_pelanggan AS id, nama_lengkap AS nama, email, no_telepon AS telepon, alamat, "
        "no_ktp, foto_ktp_url AS foto_ktp, foto_sim_url AS foto_sim, is_verified, created_at "
        "FROM PELANGGAN WHERE id_pelanggan = %(id)s",
        {"id": pid},
    )
    r = await cur.fetchone()
    if not r: raise HTTPException(404, "Pelanggan tidak ditemukan.")
    r["created_at"] = fmt_date(r["created_at"])

    # Riwayat 5 transaksi terakhir
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
    return r


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
    return {"message": "Pelanggan berhasil ditambahkan.", "id_pelanggan": pid}

