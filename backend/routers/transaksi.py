from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, BackgroundTasks
from utils import fmt_float, fmt_date
from typing import Optional
import aiomysql
from datetime import date, datetime, timezone
from database import get_db, get_db_transaction
from dependencies import req_kasir_or_owner, req_owner, get_current_account
from models import TransaksiIn, StatusUpd, PerpanjanganIn
from utils import fonnte_send, imgbb_upload, midtrans_snap, smtp_booking_notification
import uuid
import asyncio
import json
import math
from config import log

router = APIRouter(prefix="/transaksi", tags=["Transaksi"])
@router.get("", tags=["📋 Transaksi"])
async def list_transaksi(
    status: Optional[str] = None,
    dari:   Optional[date] = None,
    sampai: Optional[date] = None,
    limit:  int = 100,
    user=Depends(get_current_account),
    cur=Depends(get_db),
):
    try:
        q = (
            "SELECT ts.id_transaksi AS id, ts.nomor_booking AS booking, p.nama_lengkap AS pelanggan, k.nama_kendaraan AS kendaraan, "
            "ts.tanggal_mulai AS mulai, ts.tanggal_selesai_rencana AS selesai_rencana, ts.durasi_hari_rencana AS durasi, "
            "ts.total_biaya AS total, ts.status, ts.status_pembayaran AS status_bayar, ts.created_at, "
            "ts.gunakan_supir, ts.metode_pembayaran AS metode, k.foto_url AS foto_kendaraan "
            "FROM TRANSAKSI_SEWA ts "
            "JOIN PELANGGAN p ON ts.id_pelanggan = p.id_pelanggan "
            "JOIN KENDARAAN k ON ts.id_kendaraan = k.id_kendaraan WHERE 1=1"
        )
        params: dict = {}
        if user["role"] == "CUSTOMER":
            q += " AND ts.id_pelanggan = %(uid)s"
            params["uid"] = user["id"]
            
        if status: q += " AND ts.status = %(st)s";       params["st"] = status.upper()
        if dari:   q += " AND ts.tanggal_mulai >= %(d)s"; params["d"]  = dari
        if sampai: q += " AND ts.tanggal_mulai <= %(s)s"; params["s"]  = sampai
        q += f" ORDER BY ts.created_at DESC LIMIT {min(limit, 500)}"

        await cur.execute(q, params)
        rows = await cur.fetchall()
        for r in rows:
            r["mulai"]           = fmt_date(r["mulai"])
            r["selesai_rencana"] = fmt_date(r["selesai_rencana"])
            r["total"]           = fmt_float(r["total"])
            r["created_at"]      = fmt_date(r["created_at"])
        return rows
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Transaksi] Gagal memuat daftar transaksi: {e}")
        raise HTTPException(500, "Gagal memuat daftar transaksi.")

@router.get("/saya", tags=["Transaksi"])
async def list_transaksi_saya(
    status: Optional[str] = None,
    dari:   Optional[date] = None,
    sampai: Optional[date] = None,
    limit:  int = 100,
    user=Depends(get_current_account),
    cur=Depends(get_db),
):
    if user["role"] != "CUSTOMER":
        raise HTTPException(403, "Endpoint ini khusus untuk Customer.")
        
    return await list_transaksi(status, dari, sampai, limit, user, cur)



@router.get("/{tid}", tags=["📋 Transaksi"])
async def detail_transaksi(tid: str, user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    try:
        await cur.execute(
            "SELECT ts.id_transaksi, ts.nomor_booking, ts.id_pelanggan, ts.id_kendaraan, "
            "p.nama_lengkap, p.no_telepon, p.email, p.foto_ktp_url, p.alamat, "
            "k.nama_kendaraan, k.nomor_plat, k.tipe_kendaraan, k.foto_url, "
            "k.harga_sewa_harian, k.harga_supir_harian, "
            "ts.tanggal_mulai, ts.tanggal_selesai_rencana, ts.tanggal_selesai_aktual, "
            "ts.durasi_hari_rencana, ts.gunakan_supir, "
            "ts.biaya_sewa, ts.biaya_supir, ts.biaya_denda_terlambat, "
            "ts.biaya_denda_kerusakan, ts.biaya_tambahan_lain, ts.total_biaya, "
            "ts.metode_pembayaran, ts.status_pembayaran, ts.status, "
            "ts.foto_kondisi_sebelum, ts.foto_kondisi_sesudah, "
            "ts.catatan_kerusakan, ts.catatan_kasir, ts.created_at "
            "FROM TRANSAKSI_SEWA ts "
            "JOIN PELANGGAN p ON ts.id_pelanggan = p.id_pelanggan "
            "JOIN KENDARAAN k ON ts.id_kendaraan = k.id_kendaraan "
            "WHERE ts.id_transaksi = %(id)s OR ts.nomor_booking = %(nb)s",
            {"id": tid, "nb": tid.upper()},
        )
        r = await cur.fetchone()
        if not r:
            raise HTTPException(404, f"Transaksi '{tid}' tidak ditemukan.")

        return {
            "id_transaksi": r["id_transaksi"], "nomor_booking": r["nomor_booking"],
            "id_pelanggan": r["id_pelanggan"], "id_kendaraan": r["id_kendaraan"],
            "pelanggan": {
                "nama": r["nama_lengkap"], "telepon": r["no_telepon"], "email": r["email"],
                "foto_ktp": r["foto_ktp_url"], "alamat": r["alamat"],
            },
            "kendaraan": {
                "nama": r["nama_kendaraan"], "plat": r["nomor_plat"], "tipe": r["tipe_kendaraan"],
                "foto": r["foto_url"], "harga_harian": fmt_float(r["harga_sewa_harian"]), "harga_supir": fmt_float(r["harga_supir_harian"]),
            },
            "tanggal_mulai":           fmt_date(r["tanggal_mulai"]),
            "tanggal_selesai_rencana": fmt_date(r["tanggal_selesai_rencana"]),
            "tanggal_selesai_aktual":  fmt_date(r["tanggal_selesai_aktual"]),
            "durasi_hari":   r["durasi_hari_rencana"],
            "gunakan_supir": r["gunakan_supir"],
            "biaya_sewa":    fmt_float(r["biaya_sewa"]),
            "biaya_supir":   fmt_float(r["biaya_supir"]),
            "denda_terlambat": fmt_float(r["biaya_denda_terlambat"]),
            "denda_kerusakan": fmt_float(r["biaya_denda_kerusakan"]),
            "biaya_tambahan":  fmt_float(r["biaya_tambahan_lain"]),
            "total_biaya":     fmt_float(r["total_biaya"]),
            "metode_bayar":  r["metode_pembayaran"],
            "status_bayar":  r["status_pembayaran"],
            "status":        r["status"],
            "foto_sebelum":  json.loads(r["foto_kondisi_sebelum"]) if r["foto_kondisi_sebelum"] else [],
            "foto_sesudah":  json.loads(r["foto_kondisi_sesudah"]) if r["foto_kondisi_sesudah"] else [],
            "catatan_kerusakan": r["catatan_kerusakan"],
            "catatan_kasir": r["catatan_kasir"],
            "created_at":    fmt_date(r["created_at"]),
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Transaksi] Gagal memuat detail transaksi {tid}: {e}")
        raise HTTPException(500, "Gagal memuat detail transaksi.")


@router.post("", status_code=201, tags=["🛒 Transaksi"])
async def buat_transaksi(body: TransaksiIn, bt: BackgroundTasks, user=Depends(get_current_account), cur=Depends(get_db)):
    try:
        await cur.execute("SELECT nama_kendaraan, status, harga_sewa_harian, harga_supir_harian FROM KENDARAAN WHERE id_kendaraan = %(id)s", {"id": body.id_kendaraan})
        kend = await cur.fetchone()
        if not kend: raise HTTPException(404, "Kendaraan tidak ditemukan.")
        if kend["status"] == "PERAWATAN": raise HTTPException(409, "Kendaraan sedang dalam perawatan.")

        await cur.execute(
            "SELECT COUNT(*) AS jml FROM TRANSAKSI_SEWA "
            "WHERE id_kendaraan = %(id)s AND status IN ('DIKONFIRMASI', 'AKTIF') "
            "AND tanggal_mulai <= %(tse)s AND tanggal_selesai_rencana >= %(tmu)s",
            {"id": body.id_kendaraan, "tse": body.tanggal_selesai_rencana, "tmu": body.tanggal_mulai}
        )
        overlap = await cur.fetchone()
        if overlap["jml"] > 0:
            raise HTTPException(409, "Kendaraan sudah terpesan/disewa pada rentang tanggal tersebut.")

        await cur.execute("SELECT nama_lengkap, no_telepon, email, no_ktp, foto_sim_url FROM PELANGGAN WHERE id_pelanggan = %(id)s", {"id": body.id_pelanggan})
        plg = await cur.fetchone()
        if not plg: raise HTTPException(404, "Pelanggan tidak ditemukan.")
        
        if not plg["no_ktp"]:
            raise HTTPException(400, "Profil belum lengkap. NIK (KTP) wajib diisi.")

        if body.gunakan_supir == 0 and not plg["foto_sim_url"]:
            raise HTTPException(400, "Untuk sewa lepas kunci, wajib mengunggah foto SIM A aktif.")

        if body.paket_sewa == "BULANAN" and body.gunakan_supir == 1:
            raise HTTPException(400, "Sewa bulanan tidak dapat dipesan beserta jasa supir secara langsung.")

        durasi  = max(math.ceil((body.tanggal_selesai_rencana - body.tanggal_mulai).total_seconds() / 86400.0), 1)
        
        # Penghitungan Sewa Bulanan
        catatan_final = body.catatan_kasir or ""
        if body.paket_sewa == "BULANAN":
            durasi_bulan = round(durasi / 30)
            if durasi_bulan < 1: durasi_bulan = 1
            b_sewa = float(kend["harga_sewa_harian"]) * durasi_bulan * 22
            catatan_final = (f"Paket Sewa Bulanan ({durasi_bulan} Bulan)\n" + catatan_final).strip()
        else:
            b_sewa = float(kend["harga_sewa_harian"]) * durasi

        # Pengecekan Loyalitas (Setiap 3 kali sewa dapat diskon 20%)
        await cur.execute(
            "SELECT COUNT(*) AS count_valid FROM TRANSAKSI_SEWA "
            "WHERE id_pelanggan = %(id)s AND status IN ('SELESAI', 'DIKONFIRMASI', 'AKTIF')",
            {"id": body.id_pelanggan}
        )
        loyal = await cur.fetchone()
        count_valid = loyal["count_valid"] if loyal else 0

        if count_valid % 3 == 2:
            b_sewa = b_sewa * 0.8
            catatan_final = ("Sewa ke-3 (Promo Loyalitas Diskon 20%)\n" + catatan_final).strip()

        b_supir = float(kend["harga_supir_harian"]) * durasi if body.gunakan_supir else 0.0
        total   = b_sewa + b_supir
        
        tahun_ini     = datetime.now().strftime("%Y")
        unique_suffix = uuid.uuid4().hex[:8].upper()
        nomor_booking = f"AR-{tahun_ini}-{unique_suffix}" 

        tid = f"trx-{uuid.uuid4()}"
        kid_kasir = user["id"] if user["role"] in ("KASIR", "OWNER") else None

        initial_status = 'DIKONFIRMASI' if kid_kasir else 'MENUNGGU'

        await cur.execute(
            "INSERT INTO TRANSAKSI_SEWA (id_transaksi, nomor_booking, id_pelanggan, id_kendaraan, "
            "id_karyawan_kasir, tanggal_mulai, tanggal_selesai_rencana, durasi_hari_rencana, "
            "gunakan_supir, biaya_sewa, biaya_supir, total_biaya, "
            "metode_pembayaran, catatan_kasir, status) "
            "VALUES (%(id)s, %(nb)s, %(pid)s, %(kid)s, %(kid_kasir)s, %(tmu)s, %(tse)s, %(dur)s, %(sup)s, %(bs)s, %(bsu)s, %(tot)s, %(met)s, %(cat)s, %(stat)s)",
            {"id": tid, "nb": nomor_booking, "pid": body.id_pelanggan, "kid": body.id_kendaraan,
             "kid_kasir": kid_kasir,
             "tmu": body.tanggal_mulai, "tse": body.tanggal_selesai_rencana, "dur": durasi,
             "sup": body.gunakan_supir, "bs": b_sewa, "bsu": b_supir, "tot": total,
             "met": body.metode_pembayaran, "cat": catatan_final, "stat": initial_status},
        )

        if initial_status == 'DIKONFIRMASI':
            pesan = (
                f"✅ *Booking AeroRent Berhasil!*\n\nHalo {plg['nama_lengkap']},\n📋 No. Booking: *{nomor_booking}*\n"
                f"📅 {body.tanggal_mulai} s/d {body.tanggal_selesai_rencana} ({durasi} hari)\n💰 Total: Rp {total:,.0f}\n"
            )
            bt.add_task(fonnte_send, plg["no_telepon"], pesan)
            
            if plg.get("email"):
                bt.add_task(smtp_booking_notification, plg["email"], plg["nama_lengkap"], nomor_booking, body.tanggal_mulai, body.tanggal_selesai_rencana, kend["nama_kendaraan"])
            
        return {"message": "Pemesanan berhasil.", "id_transaksi": tid, "nomor_booking": nomor_booking, "total_biaya": total}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Transaksi] Gagal membuat transaksi: {e}")
        raise HTTPException(500, "Gagal membuat pemesanan. Silakan coba lagi.")


@router.post("/{tid}/remind-wa", tags=["📋 Transaksi"])
async def send_wa_reminder(tid: str, bt: BackgroundTasks, user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    try:
        await cur.execute(
            "SELECT ts.nomor_booking, ts.tanggal_selesai_rencana, p.nama_lengkap, p.no_telepon, k.nama_kendaraan "
            "FROM TRANSAKSI_SEWA ts "
            "JOIN PELANGGAN p ON ts.id_pelanggan = p.id_pelanggan "
            "JOIN KENDARAAN k ON ts.id_kendaraan = k.id_kendaraan "
            "WHERE ts.id_transaksi = %(id)s OR ts.nomor_booking = %(nb)s",
            {"id": tid, "nb": tid.upper()}
        )
        trx = await cur.fetchone()
        if not trx: raise HTTPException(404, "Transaksi tidak ditemukan.")
        
        tgl_selesai = fmt_date(trx["tanggal_selesai_rencana"])
        pesan = (
            f"Halo {trx['nama_lengkap']},\n\n"
            f"Mengingatkan bahwa batas waktu pengembalian kendaraan sewa AeroRent ({trx['nama_kendaraan']}) "
            f"dengan No. Booking *{trx['nomor_booking']}* adalah pada *{tgl_selesai}*.\n\n"
            f"Mohon untuk dapat melakukan pengembalian tepat waktu agar terhindar dari denda keterlambatan.\n\n"
            f"Terima kasih telah mempercayakan perjalanan Anda kepada kami!"
        )
        bt.add_task(fonnte_send, trx["no_telepon"], pesan)
        return {"message": "Reminder WA sedang diproses dan akan segera dikirim."}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Transaksi] Gagal kirim reminder WA transaksi {tid}: {e}")
        raise HTTPException(500, "Gagal mengirim reminder.")


@router.put("/{tid}/status", tags=["📋 Transaksi"])
async def update_status(tid: str, body: StatusUpd, bt: BackgroundTasks, user=Depends(req_kasir_or_owner), db_txn=Depends(get_db_transaction)):
    """Update status transaksi dengan rollback jika multi-UPDATE gagal."""
    conn, cur = db_txn
    try:
        await cur.execute(
            "SELECT ts.status, ts.id_kendaraan, ts.tanggal_selesai_rencana, "
            "ts.biaya_sewa, ts.biaya_supir, k.harga_sewa_harian, "
            "p.no_telepon, p.nama_lengkap, ts.nomor_booking, ts.id_transaksi, "
            "p.email, ts.tanggal_mulai, ts.durasi_hari_rencana, ts.total_biaya, k.nama_kendaraan "
            "FROM TRANSAKSI_SEWA ts "
            "JOIN KENDARAAN k ON ts.id_kendaraan = k.id_kendaraan "
            "JOIN PELANGGAN  p ON ts.id_pelanggan = p.id_pelanggan "
            "WHERE ts.id_transaksi = %(id)s OR ts.nomor_booking = %(nb)s",
            {"id": tid, "nb": tid.upper()},
        )
        trx = await cur.fetchone()
        if not trx: raise HTTPException(404, "Transaksi tidak ditemukan.")

        st_lama, kid, tgl_rencana = trx["status"], trx["id_kendaraan"], trx["tanggal_selesai_rencana"]
        harga_harian, tel_plg, nama_plg = fmt_float(trx["harga_sewa_harian"]), trx["no_telepon"], trx["nama_lengkap"]
        nb, actual_tid = trx["nomor_booking"], trx["id_transaksi"]
        st_baru = body.status.upper()

        TRANSISI: dict = {
            "MENUNGGU":     ["DIKONFIRMASI", "DIBATALKAN"],
            "DIKONFIRMASI": ["AKTIF",        "DIBATALKAN"],
            "AKTIF":        ["SELESAI",      "DIBATALKAN"],
        }
        if st_lama not in TRANSISI or st_baru not in TRANSISI.get(st_lama, []):
            raise HTTPException(400, f"Transisi '{st_lama}' → '{st_baru}' tidak diizinkan.")

        upd_sets:  list = ["status = %(st)s", "id_karyawan_kasir = %(kid_kasir)s"]
        upd_params: dict = {"st": st_baru, "kid_kasir": user["id"], "actual_id": actual_tid}

        if body.catatan_kasir:
            upd_sets.append("catatan_kasir = %(cat)s"); upd_params["cat"] = body.catatan_kasir

        if st_baru == "AKTIF":
            await cur.execute("UPDATE KENDARAAN SET status = 'DISEWA' WHERE id_kendaraan = %(id)s", {"id": kid})

        elif st_baru == "SELESAI":
            now = datetime.now(timezone.utc)
            upd_sets.append("tanggal_selesai_aktual = %(ta)s"); upd_params["ta"] = now

            today = now.date()
            denda_tlbt = 0.0
            if today > tgl_rencana:
                hari_tlbt   = (today - tgl_rencana).days
                denda_tlbt  = hari_tlbt * harga_harian * 1.5
                upd_sets.append("biaya_denda_terlambat = %(dt)s"); upd_params["dt"] = denda_tlbt

            d_kerus = body.biaya_denda_kerusakan or 0.0
            b_tamb  = body.biaya_tambahan_lain   or 0.0
            if d_kerus > 0: upd_sets.append("biaya_denda_kerusakan = %(dk)s"); upd_params["dk"] = d_kerus
            if b_tamb > 0:  upd_sets.append("biaya_tambahan_lain = %(bt)s");   upd_params["bt"] = b_tamb

            total_final = (fmt_float(trx["biaya_sewa"]) + fmt_float(trx["biaya_supir"]) + denda_tlbt + d_kerus + b_tamb)
            upd_sets.append("total_biaya = %(tf)s"); upd_params["tf"] = total_final

            await cur.execute("UPDATE KENDARAAN SET status = 'TERSEDIA' WHERE id_kendaraan = %(id)s", {"id": kid})
            bt.add_task(fonnte_send, tel_plg,
                f"✅ *Pengembalian Selesai!*\n\nHalo {nama_plg},\nTransaksi {nb} telah selesai diproses.\n"
                f"💰 Total akhir: Rp {total_final:,.0f}" + (f"\n⚠️ Denda keterlambatan: Rp {denda_tlbt:,.0f}" if denda_tlbt > 0 else "") + "\n\nTerima kasih 🚗 AeroRent")

        elif st_baru == "DIBATALKAN" and st_lama == "AKTIF":
            await cur.execute("UPDATE KENDARAAN SET status = 'TERSEDIA' WHERE id_kendaraan = %(id)s", {"id": kid})

        elif st_baru == "DIKONFIRMASI" and st_lama == "MENUNGGU":
            pesan = (
                f"✅ *Booking AeroRent Berhasil!*\n\nHalo {nama_plg},\n📋 No. Booking: *{nb}*\n"
                f"📅 {trx['tanggal_mulai']} s/d {tgl_rencana} ({trx['durasi_hari_rencana']} hari)\n💰 Total: Rp {trx['total_biaya']:,.0f}\n"
            )
            bt.add_task(fonnte_send, tel_plg, pesan)
            if trx.get("email"):
                bt.add_task(smtp_booking_notification, trx["email"], nama_plg, nb, trx["tanggal_mulai"], tgl_rencana, trx["nama_kendaraan"])

        await cur.execute(f"UPDATE TRANSAKSI_SEWA SET {', '.join(upd_sets)} WHERE id_transaksi = %(actual_id)s", upd_params)
        
        # Commit transaksi atomik (UPDATE KENDARAAN + UPDATE TRANSAKSI_SEWA)
        await conn.commit()
        
        return {"message": f"Status berhasil diubah ke '{st_baru}'.", "nomor_booking": nb, "status_baru": st_baru}
    except HTTPException:
        await conn.rollback()
        raise
    except Exception as e:
        await conn.rollback()
        log.error(f"[Transaksi] Gagal update status transaksi {tid}: {e}")
        raise HTTPException(500, "Gagal memperbarui status transaksi.")


@router.post("/{tid}/foto-kondisi", tags=["📋 Transaksi"])
async def upload_foto_kondisi(
    tid:           str,
    jenis:         str         = Form(..., description="'sebelum' atau 'sesudah'"),
    file_depan:    UploadFile  = File(...),
    file_samping_kanan: UploadFile = File(...),
    file_samping_kiri:  UploadFile = File(...),
    file_belakang: UploadFile  = File(...),
    file_dalam:    UploadFile  = File(...),
    files_tambahan: list[UploadFile] = File([]),
    user=Depends(req_kasir_or_owner),
    cur=Depends(get_db),
):
    try:
        if jenis not in ("sebelum", "sesudah"): raise HTTPException(400, "Parameter 'jenis' harus 'sebelum' atau 'sesudah'.")

        pfx = f"trx_{tid[:8]}_{jenis}"
        
        tasks = [
            imgbb_upload(await file_depan.read(), f"{pfx}_depan"),
            imgbb_upload(await file_samping_kanan.read(), f"{pfx}_samping_kanan"),
            imgbb_upload(await file_samping_kiri.read(), f"{pfx}_samping_kiri"),
            imgbb_upload(await file_belakang.read(), f"{pfx}_belakang"),
            imgbb_upload(await file_dalam.read(), f"{pfx}_dalam")
        ]
        
        if files_tambahan:
            for i, f in enumerate(files_tambahan):
                tasks.append(imgbb_upload(await f.read(), f"{pfx}_tambahan_{i+1}"))

        urls = await asyncio.gather(*tasks)

        foto_json_list = [
            {"posisi": "depan", "url": urls[0]},
            {"posisi": "samping kanan", "url": urls[1]},
            {"posisi": "samping kiri", "url": urls[2]},
            {"posisi": "belakang", "url": urls[3]},
            {"posisi": "dalam", "url": urls[4]}
        ]
        
        if files_tambahan:
            for i in range(len(files_tambahan)):
                foto_json_list.append({"posisi": f"tambahan {i+1}", "url": urls[5+i]})

        foto_json = json.dumps(foto_json_list)
        kolom = "foto_kondisi_sebelum" if jenis == "sebelum" else "foto_kondisi_sesudah"

        await cur.execute(
            f"UPDATE TRANSAKSI_SEWA SET {kolom} = %(foto)s WHERE id_transaksi = %(id)s OR nomor_booking = %(nb)s",
            {"foto": foto_json, "id": tid, "nb": tid.upper()},
        )
        return {"message": f"Foto kondisi '{jenis}' berhasil diupload.", "urls": foto_json_list}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Transaksi] Gagal upload foto kondisi {tid}: {e}")
        raise HTTPException(500, "Gagal mengunggah foto kondisi kendaraan.")


@router.post("/{tid}/midtrans-snap", tags=["📋 Transaksi"])
async def buat_snap(tid: str, user=Depends(get_current_account), cur=Depends(get_db)):
    try:
        await cur.execute(
            "SELECT ts.nomor_booking, ts.total_biaya, p.nama_lengkap, p.email, ts.id_pelanggan "
            "FROM TRANSAKSI_SEWA ts JOIN PELANGGAN p ON ts.id_pelanggan = p.id_pelanggan "
            "WHERE (ts.id_transaksi = %(id)s OR ts.nomor_booking = %(nb)s) AND ts.status IN ('MENUNGGU','DIKONFIRMASI')",
            {"id": tid, "nb": tid.upper()},
        )
        r = await cur.fetchone()
        if not r: raise HTTPException(404, "Transaksi tidak ditemukan atau tidak dapat dibayar online.")

        if user["role"] == "CUSTOMER" and r["id_pelanggan"] != user["id"]:
            raise HTTPException(403, "Anda tidak memiliki akses ke transaksi ini.")

        result = await midtrans_snap(r["nomor_booking"], fmt_float(r["total_biaya"]), r["nama_lengkap"], r["email"] or "")
        await cur.execute(
            "UPDATE TRANSAKSI_SEWA SET midtrans_order_id = %(oid)s, midtrans_status = 'pending' "
            "WHERE id_transaksi = %(id)s OR nomor_booking = %(nb)s",
            {"oid": r["nomor_booking"], "id": tid, "nb": tid.upper()},
        )
        return {"snap_token": result.get("token"), "redirect_url": result.get("redirect_url"), "order_id": r["nomor_booking"]}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Transaksi] Gagal membuat Midtrans Snap untuk {tid}: {e}")
        raise HTTPException(500, "Gagal memproses pembayaran online.")


@router.put("/{tid}/cancel", tags=["📋 Transaksi"])
async def cancel_transaksi_by_customer(tid: str, user=Depends(get_current_account), cur=Depends(get_db)):
    try:
        if user["role"] != "CUSTOMER":
            raise HTTPException(403, "Akses ditolak. Fitur ini khusus untuk pelanggan.")
            
        await cur.execute("SELECT id_pelanggan, status, nomor_booking FROM TRANSAKSI_SEWA WHERE id_transaksi = %(id)s OR nomor_booking = %(nb)s", {"id": tid, "nb": tid.upper()})
        trx = await cur.fetchone()
        if not trx: raise HTTPException(404, "Transaksi tidak ditemukan.")
        
        if trx["id_pelanggan"] != user["id"]:
            raise HTTPException(403, "Anda tidak memiliki akses untuk membatalkan pesanan ini.")
            
        if trx["status"] != "MENUNGGU":
            raise HTTPException(400, "Hanya pesanan yang masih MENUNGGU pembayaran yang dapat dibatalkan melalui Dashboard.")
            
        await cur.execute("UPDATE TRANSAKSI_SEWA SET status = 'DIBATALKAN' WHERE id_transaksi = %(id)s OR nomor_booking = %(nb)s", {"id": tid, "nb": tid.upper()})
        
        log.info(f"[Transaksi] Dibatalkan oleh pelanggan: {trx['nomor_booking']}")
        return {"message": "Pemesanan berhasil dibatalkan."}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Transaksi] Gagal membatalkan transaksi {tid}: {e}")
        raise HTTPException(500, "Gagal membatalkan pemesanan.")

@router.post("/{tid}/perpanjang", tags=["📋 Transaksi"])
async def perpanjang_transaksi(tid: str, body: PerpanjanganIn, user=Depends(get_current_account), cur=Depends(get_db)):
    try:
        if user["role"] != "CUSTOMER":
            raise HTTPException(403, "Hanya pelanggan yang dapat memperpanjang sewa dari portal.")

        await cur.execute(
            "SELECT t.id_transaksi, t.id_pelanggan, t.nomor_booking, t.tanggal_selesai_rencana, t.durasi_hari_rencana, "
            "t.biaya_sewa, t.total_biaya, t.catatan_kasir, t.status, "
            "k.harga_sewa_harian "
            "FROM TRANSAKSI_SEWA t JOIN KENDARAAN k ON t.id_kendaraan = k.id_kendaraan "
            "WHERE (t.id_transaksi = %(id)s OR t.nomor_booking = %(nb)s)",
            {"id": tid, "nb": tid.upper()}
        )
        trx = await cur.fetchone()
        if not trx: raise HTTPException(404, "Transaksi tidak ditemukan.")
        if trx["id_pelanggan"] != user["id"]: raise HTTPException(403, "Akses ditolak.")
        if trx["status"] not in ("DIKONFIRMASI", "AKTIF"):
            raise HTTPException(400, "Hanya sewa yang sedang aktif atau telah dikonfirmasi yang dapat diperpanjang.")

        durasi_tambahan = body.tambahan_hari
        if durasi_tambahan <= 0: raise HTTPException(400, "Durasi perpanjangan harus lebih dari 0 hari.")

        b_sewa_tambahan = 0
        catatan_promo = ""
        durasi_bulan = 0
        if body.paket_sewa == "BULANAN":
            durasi_bulan = max(1, round(durasi_tambahan / 30))
            b_sewa_tambahan = float(trx["harga_sewa_harian"]) * durasi_bulan * 22
            durasi_tambahan = durasi_bulan * 30
        else:
            b_sewa_tambahan = float(trx["harga_sewa_harian"]) * durasi_tambahan

        # Cek loyalitas
        await cur.execute(
            "SELECT COUNT(*) AS count_valid FROM TRANSAKSI_SEWA "
            "WHERE id_pelanggan = %(pid)s AND status IN ('SELESAI', 'DIKONFIRMASI', 'AKTIF')",
            {"pid": user["id"]}
        )
        loyal = await cur.fetchone()
        count_valid = loyal["count_valid"] if loyal else 0

        if count_valid % 3 == 2:
            b_sewa_tambahan = b_sewa_tambahan * 0.8
            catatan_promo = " (Promo Loyalitas 20% khusus perpanjangan)"

        new_catatan = trx["catatan_kasir"] or ""
        ket_paket = f"Paket Bulanan ({durasi_bulan} Bulan)" if body.paket_sewa == "BULANAN" else f"Paket Harian ({durasi_tambahan} Hari)"
        new_catatan = (new_catatan + f"\n[EXT] Perpanjangan {ket_paket}{catatan_promo}").strip()

        ext_suffix = uuid.uuid4().hex[:4].upper()
        new_midtrans_oid = f"{trx['nomor_booking']}-EX{ext_suffix}"

        await cur.execute(
            "UPDATE TRANSAKSI_SEWA SET "
            "durasi_hari_rencana = durasi_hari_rencana + %(dur)s, "
            "tanggal_selesai_rencana = DATE_ADD(tanggal_selesai_rencana, INTERVAL %(dur)s DAY), "
            "biaya_sewa = biaya_sewa + %(bs)s, "
            "total_biaya = total_biaya + %(bs)s, "
            "status_pembayaran = 'BELUM_LUNAS', "
            "midtrans_order_id = %(oid)s, "
            "catatan_kasir = %(cat)s "
            "WHERE id_transaksi = %(tid)s",
            {
                "dur": durasi_tambahan, "bs": b_sewa_tambahan,
                "oid": new_midtrans_oid, "cat": new_catatan, "tid": trx["id_transaksi"]
            }
        )

        log.info(f"[Transaksi] Perpanjangan: {trx['nomor_booking']} +{durasi_tambahan} hari")
        return {"message": "Sewa berhasil diperpanjang. Silakan lakukan pembayaran tambahan.", "new_order_id": new_midtrans_oid}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Transaksi] Gagal memperpanjang transaksi {tid}: {e}")
        raise HTTPException(500, "Gagal memperpanjang masa sewa.")

from models import TambahSupirIn

@router.post("/{tid}/tambah-supir", tags=["📋 Transaksi"])
async def tambah_supir_transaksi(tid: str, body: TambahSupirIn, user=Depends(get_current_account), cur=Depends(get_db)):
    try:
        if user["role"] != "CUSTOMER":
            raise HTTPException(403, "Hanya pelanggan yang dapat menambah supir dari portal.")

        await cur.execute(
            "SELECT t.id_transaksi, t.id_pelanggan, t.nomor_booking, t.durasi_hari_rencana, "
            "t.biaya_supir, t.total_biaya, t.catatan_kasir, t.status, t.gunakan_supir, "
            "k.harga_supir_harian "
            "FROM TRANSAKSI_SEWA t JOIN KENDARAAN k ON t.id_kendaraan = k.id_kendaraan "
            "WHERE (t.id_transaksi = %(id)s OR t.nomor_booking = %(nb)s)",
            {"id": tid, "nb": tid.upper()}
        )
        trx = await cur.fetchone()
        if not trx: raise HTTPException(404, "Transaksi tidak ditemukan.")
        if trx["id_pelanggan"] != user["id"]: raise HTTPException(403, "Akses ditolak.")
        if trx["status"] not in ("DIKONFIRMASI", "AKTIF"):
            raise HTTPException(400, "Hanya sewa yang sedang aktif atau telah dikonfirmasi yang dapat ditambah jasa supir.")

        if trx["gunakan_supir"]:
            raise HTTPException(400, "Sewa ini sudah menggunakan jasa supir. Jika butuh lebih lama, silakan gunakan fitur perpanjang sewa.")

        durasi_supir = body.durasi_hari
        if durasi_supir <= 0: raise HTTPException(400, "Durasi supir harus lebih dari 0 hari.")
        if durasi_supir > trx["durasi_hari_rencana"]:
            raise HTTPException(400, "Durasi supir tidak boleh melebihi total durasi sewa rencana.")

        b_supir_tambahan = float(trx["harga_supir_harian"]) * durasi_supir
        new_catatan = trx["catatan_kasir"] or ""
        new_catatan = (new_catatan + f"\n[SUPIR] Tambah supir ({durasi_supir} Hari)").strip()

        import uuid
        ext_suffix = uuid.uuid4().hex[:4].upper()
        new_midtrans_oid = f"{trx['nomor_booking']}-SP{ext_suffix}"

        await cur.execute(
            "UPDATE TRANSAKSI_SEWA SET "
            "biaya_supir = biaya_supir + %(bsu)s, "
            "total_biaya = total_biaya + %(bsu)s, "
            "status_pembayaran = 'BELUM_LUNAS', "
            "midtrans_order_id = %(oid)s, "
            "catatan_kasir = %(cat)s "
            "WHERE id_transaksi = %(tid)s",
            {
                "bsu": b_supir_tambahan,
                "oid": new_midtrans_oid, "cat": new_catatan, "tid": trx["id_transaksi"]
            }
        )

        log.info(f"[Transaksi] Tambah Supir: {trx['nomor_booking']} +{durasi_supir} hari")
        return {"message": "Sewa supir berhasil ditambahkan. Silakan lakukan pembayaran tambahan.", "new_order_id": new_midtrans_oid}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Transaksi] Gagal menambah supir {tid}: {e}")
        raise HTTPException(500, "Gagal menambahkan jasa supir.")
