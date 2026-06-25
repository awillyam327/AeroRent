from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from utils import fmt_float, fmt_date
from typing import Optional
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner, req_owner
import uuid
from datetime import date

router = APIRouter(prefix="/pengeluaran", tags=["Pengeluaran"])
@router.get("", tags=["💸 Pengeluaran"])
async def list_pengeluaran(
    dari:     Optional[date] = None,
    sampai:   Optional[date] = None,
    kategori: Optional[str]  = None,
    user=Depends(req_owner),
    cur=Depends(get_db),
):
    q = (
        "SELECT po.id_pengeluaran AS id, po.nomor_pengeluaran AS nomor, ka.nama_lengkap AS dicatat_oleh, "
        "ke.nama_kendaraan AS kendaraan, po.kategori, po.deskripsi, po.jumlah, "
        "po.tanggal_pengeluaran AS tanggal, po.bukti_url, po.created_at "
        "FROM PENGELUARAN_OPERASIONAL po "
        "JOIN KARYAWAN ka ON po.id_karyawan = ka.id_karyawan "
        "LEFT JOIN KENDARAAN ke ON po.id_kendaraan = ke.id_kendaraan WHERE 1=1"
    )
    p: dict = {}
    if dari:     q += " AND po.tanggal_pengeluaran >= %(d)s"; p["d"] = dari
    if sampai:   q += " AND po.tanggal_pengeluaran <= %(s)s"; p["s"] = sampai
    if kategori: q += " AND po.kategori = %(k)s";             p["k"] = kategori.upper()
    q += " ORDER BY po.tanggal_pengeluaran DESC"

    await cur.execute(q, p)
    rows = await cur.fetchall()
    for r in rows:
        r["jumlah"] = fmt_float(r["jumlah"])
        r["tanggal"] = fmt_date(r["tanggal"])
        r["created_at"] = fmt_date(r["created_at"])
    return rows


@router.post("", status_code=201, tags=["💸 Pengeluaran"])
async def tambah_pengeluaran(
    deskripsi:            str             = Form(...),
    kategori:             str             = Form(...),
    jumlah:               float           = Form(...),
    tanggal_pengeluaran:  date            = Form(...),
    id_kendaraan:         Optional[str]   = Form(None),
    catatan:              Optional[str]   = Form(None),
    bukti:                Optional[UploadFile] = File(None),
    user=Depends(req_owner),
    cur=Depends(get_db),
):
    bukti_url = None
    if bukti and bukti.filename:
        bukti_url = await imgbb_upload(await bukti.read(), f"pengeluaran_{tanggal_pengeluaran}_{deskripsi[:15]}")
        
    pid = f"po-{uuid.uuid4()}"
    await cur.execute(
        "INSERT INTO PENGELUARAN_OPERASIONAL (id_pengeluaran, id_karyawan, id_kendaraan, "
        "kategori, deskripsi, jumlah, tanggal_pengeluaran, bukti_url, catatan) "
        "VALUES (%(id)s, %(kid)s, %(kend)s, %(kat)s, %(d)s, %(j)s, %(tgl)s, %(b)s, %(c)s)",
        {"id": pid, "kid": user["id"], "kend": id_kendaraan, "kat": kategori.upper(),
         "d": deskripsi, "j": jumlah, "tgl": tanggal_pengeluaran,
         "b": bukti_url, "c": catatan},
    )
    return {"message": "Pengeluaran berhasil dicatat.", "id_pengeluaran": pid}


@router.delete("/{pid}", tags=["💸 Pengeluaran"])
async def hapus_pengeluaran(pid: str, user=Depends(req_owner), cur=Depends(get_db)):
    await cur.execute("SELECT id_pengeluaran FROM PENGELUARAN_OPERASIONAL WHERE id_pengeluaran = %(id)s", {"id": pid})
    if not await cur.fetchone(): raise HTTPException(404, "Data pengeluaran tidak ditemukan.")
    
    await cur.execute("DELETE FROM PENGELUARAN_OPERASIONAL WHERE id_pengeluaran = %(id)s", {"id": pid})
    return {"message": "Pengeluaran berhasil dihapus."}

