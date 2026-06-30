from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from utils import fmt_float, fmt_date, imgbb_upload, traccar_posisi
from typing import Optional
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner, req_owner, get_current_user
from models import KendaraanIn, KendaraanUpd
import uuid

router = APIRouter(prefix="/kendaraan", tags=["Kendaraan"])
@router.get("", tags=["🚗 Kendaraan"])
async def list_kendaraan(
    tipe:     Optional[str]  = None,
    status:   Optional[str]  = None,
    featured: Optional[bool] = None,
    sort_by:  Optional[str]  = None,
    order:    Optional[str]  = "asc",
    cur=Depends(get_db), # <-- cur
):
    q = ("SELECT k.id_kendaraan, k.nama_kendaraan, k.merk, k.model, k.tahun, k.nomor_plat, "
         "k.tipe_kendaraan, k.transmisi, k.bahan_bakar, k.kapasitas_penumpang, "
         "k.harga_sewa_harian, k.harga_supir_harian, k.status, k.foto_url, "
         "k.is_featured, k.traccar_device_id, k.odometer_km, k.created_at, "
         "k.id_karyawan, kar.nama_lengkap AS nama_karyawan "
         "FROM KENDARAAN k "
         "LEFT JOIN KARYAWAN kar ON k.id_karyawan = kar.id_karyawan WHERE 1=1")
    p = {}
    if tipe:     q += " AND k.tipe_kendaraan = %(tipe)s"; p["tipe"] = tipe.upper()
    if status:   q += " AND k.status = %(st)s";           p["st"]   = status.upper()
    if featured is not None:
        q += " AND k.is_featured = %(ft)s"; p["ft"] = 1 if featured else 0

    order_dir = "DESC" if order and order.lower() == "desc" else "ASC"
    if sort_by == "harga":
        q += f" ORDER BY k.harga_sewa_harian {order_dir}, k.nama_kendaraan ASC"
    elif sort_by == "tipe":
        q += f" ORDER BY k.tipe_kendaraan {order_dir}, k.nama_kendaraan ASC"
    elif sort_by == "karyawan":
        q += f" ORDER BY kar.nama_lengkap {order_dir}, k.nama_kendaraan ASC"
    else:
        q += " ORDER BY k.is_featured DESC, k.nama_kendaraan ASC"

    await cur.execute(q, p)
    rows = await cur.fetchall()
    
    # Format Dict MySQL
    for r in rows:
        r["harga_sewa_harian"] = fmt_float(r["harga_sewa_harian"])
        r["harga_supir_harian"] = fmt_float(r["harga_supir_harian"])
        r["created_at"] = fmt_date(r["created_at"])
    return rows


@router.get("/{kid}", tags=["🚗 Kendaraan"])
async def detail_kendaraan(kid: str, cur=Depends(get_db)):
    await cur.execute(
        "SELECT id_kendaraan, nama_kendaraan, merk, model, tahun, nomor_plat, "
        "tipe_kendaraan, transmisi, bahan_bakar, kapasitas_penumpang, "
        "harga_sewa_harian, harga_supir_harian, status, foto_url, deskripsi, "
        "is_featured, traccar_device_id, odometer_km, created_at "
        "FROM KENDARAAN WHERE id_kendaraan = %(id)s",
        {"id": kid},
    )
    r = await cur.fetchone()
    if not r: raise HTTPException(404, "Kendaraan tidak ditemukan.")
    
    r["harga_sewa_harian"] = fmt_float(r["harga_sewa_harian"])
    r["harga_supir_harian"] = fmt_float(r["harga_supir_harian"])
    r["created_at"] = fmt_date(r["created_at"])
    return r


@router.post("", status_code=201, tags=["🚗 Kendaraan"])
async def tambah_kendaraan(body: KendaraanIn, user=Depends(req_owner), cur=Depends(get_db)):
    await cur.execute("SELECT COUNT(*) AS total FROM KENDARAAN WHERE nomor_plat = %(p)s", {"p": body.nomor_plat.upper()})
    cek = await cur.fetchone()
    if cek["total"] > 0:
        raise HTTPException(409, f"Nomor plat '{body.nomor_plat}' sudah terdaftar.")

    kid = f"kend-{uuid.uuid4()}"
    await cur.execute(
        "INSERT INTO KENDARAAN (id_kendaraan, nama_kendaraan, merk, model, tahun, nomor_plat, "
        "tipe_kendaraan, transmisi, bahan_bakar, kapasitas_penumpang, harga_sewa_harian, "
        "harga_supir_harian, is_featured, traccar_device_id, deskripsi, id_karyawan) "
        "VALUES (%(id)s, %(n)s, %(m)s, %(mo)s, %(t)s, %(p)s, %(tp)s, %(tr)s, %(b)s, %(k)s, %(h)s, %(hs)s, %(f)s, %(tid)s, %(d)s, %(idk)s)",
        {"id": kid, "n": body.nama_kendaraan, "m": body.merk, "mo": body.model,
         "t": body.tahun, "p": body.nomor_plat.upper(), "tp": body.tipe_kendaraan,
         "tr": body.transmisi, "b": body.bahan_bakar, "k": body.kapasitas_penumpang,
         "h": body.harga_sewa_harian, "hs": body.harga_supir_harian,
         "f": body.is_featured, "tid": body.traccar_device_id, "d": body.deskripsi, "idk": user["id"]},
    )
    return {"message": "Kendaraan berhasil ditambahkan.", "id_kendaraan": kid}


@router.put("/{kid}", tags=["🚗 Kendaraan"])
async def update_kendaraan(kid: str, body: KendaraanUpd, user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    await cur.execute("SELECT id_kendaraan FROM KENDARAAN WHERE id_kendaraan = %(id)s", {"id": kid})
    if not await cur.fetchone(): raise HTTPException(404, "Kendaraan tidak ditemukan.")

    sets, params = [], {"id": kid}
    if user["role"] == "KASIR":
        if body.status is None: raise HTTPException(403, "Kasir hanya diizinkan mengubah field 'status' kendaraan.")
        sets.append("status = %(st)s"); params["st"] = body.status.upper()
    else:
        if body.nama_kendaraan     is not None: sets.append("nama_kendaraan     = %(n)s");  params["n"]   = body.nama_kendaraan
        if body.harga_sewa_harian  is not None: sets.append("harga_sewa_harian  = %(h)s");  params["h"]   = body.harga_sewa_harian
        if body.harga_supir_harian is not None: sets.append("harga_supir_harian = %(hs)s"); params["hs"]  = body.harga_supir_harian
        if body.status             is not None: sets.append("status             = %(st)s"); params["st"]  = body.status.upper()
        if body.is_featured        is not None: sets.append("is_featured        = %(ft)s"); params["ft"]  = body.is_featured
        if body.traccar_device_id  is not None: sets.append("traccar_device_id  = %(tid)s");params["tid"] = body.traccar_device_id
        if body.foto_url           is not None: sets.append("foto_url           = %(fu)s"); params["fu"]  = body.foto_url
        if body.deskripsi          is not None: sets.append("deskripsi          = %(d)s");  params["d"]   = body.deskripsi

    if not sets: raise HTTPException(400, "Tidak ada field untuk diperbarui.")
    await cur.execute(f"UPDATE KENDARAAN SET {', '.join(sets)} WHERE id_kendaraan = %(id)s", params)
    return {"message": "Kendaraan berhasil diperbarui."}


@router.post("/{kid}/foto", tags=["🚗 Kendaraan"])
async def upload_foto_kendaraan(kid: str, file: UploadFile = File(...), user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Format file harus JPEG, PNG, atau WebP.")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024: raise HTTPException(400, "Ukuran file maksimal 5MB.")

    url = await imgbb_upload(data, f"kendaraan_{kid[:8]}_{file.filename}")
    await cur.execute("UPDATE KENDARAAN SET foto_url = %(u)s WHERE id_kendaraan = %(id)s", {"u": url, "id": kid})
    return {"message": "Foto kendaraan diperbarui.", "foto_url": url}


@router.get("/{kid}/gps", tags=["🚗 Kendaraan"])
async def gps_kendaraan(kid: str, user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    await cur.execute("SELECT traccar_device_id, nama_kendaraan FROM KENDARAAN WHERE id_kendaraan = %(id)s", {"id": kid})
    row = await cur.fetchone()
    if not row: raise HTTPException(404, "Kendaraan tidak ditemukan.")
    if not row["traccar_device_id"]: raise HTTPException(404, f"Kendaraan '{row['nama_kendaraan']}' belum terhubung ke GPS Traccar.")

    posisi = await traccar_posisi(row["traccar_device_id"])
    if not posisi: raise HTTPException(503, "Data GPS tidak tersedia. Pastikan perangkat Traccar aktif.")
    return {"kendaraan": row["nama_kendaraan"], **posisi}


@router.delete("/{kid}", tags=["🚗 Kendaraan"])
async def hapus_kendaraan(kid: str, user=Depends(req_owner), cur=Depends(get_db)):
    await cur.execute("SELECT id_kendaraan, nama_kendaraan FROM KENDARAAN WHERE id_kendaraan = %(id)s", {"id": kid})
    row = await cur.fetchone()
    if not row: raise HTTPException(404, "Kendaraan tidak ditemukan.")

    # Cek apakah ada transaksi aktif
    await cur.execute(
        "SELECT COUNT(*) AS jml FROM TRANSAKSI_SEWA WHERE id_kendaraan = %(id)s AND status IN ('MENUNGGU','DIKONFIRMASI','AKTIF')",
        {"id": kid}
    )
    aktif = await cur.fetchone()
    if aktif["jml"] > 0:
        raise HTTPException(409, f"Kendaraan '{row['nama_kendaraan']}' masih memiliki {aktif['jml']} transaksi aktif. Selesaikan atau batalkan dulu.")

    await cur.execute("DELETE FROM KENDARAAN WHERE id_kendaraan = %(id)s", {"id": kid})
    return {"message": f"Kendaraan '{row['nama_kendaraan']}' berhasil dihapus."}
