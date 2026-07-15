from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from typing import Optional
import aiomysql
import hashlib
from database import get_db
from config import cfg, log
from utils import fonnte_send, smtp_booking_notification

router = APIRouter(prefix="/webhook", tags=["Webhook"])
@router.post("/midtrans", tags=["🔔 Webhook"])
async def webhook_midtrans(request: Request, bt: BackgroundTasks, cur=Depends(get_db)):
    try:
        try:
            payload = await request.json()
        except Exception:
            log.warning("[Midtrans Webhook] Body request bukan JSON valid.")
            raise HTTPException(400, "Request body bukan JSON yang valid.")

        order_id     = payload.get("order_id", "")
        trx_status   = payload.get("transaction_status", "")
        status_code  = payload.get("status_code", "")
        gross_amount = payload.get("gross_amount", "0.00")
        recv_sig     = payload.get("signature_key", "")

        if not order_id:
            raise HTTPException(400, "order_id tidak ditemukan dalam payload.")

        raw = f"{order_id}{status_code}{gross_amount}{cfg.MIDTRANS_SERVER_KEY}"
        expected = hashlib.sha512(raw.encode()).hexdigest()
        if recv_sig != expected:
            log.warning(f"[Midtrans Webhook] Signature TIDAK VALID: order={order_id}")
            raise HTTPException(403, "Signature Midtrans tidak valid.")

        STATUS_MAP = {
            "settlement": "LUNAS", "capture": "LUNAS",
            "pending": "BELUM_LUNAS", "deny": "BELUM_LUNAS",
            "cancel": "BELUM_LUNAS", "expire": "BELUM_LUNAS",
        }
        status_pembayaran = STATUS_MAP.get(trx_status, "BELUM_LUNAS")

        await cur.execute(
            "SELECT ts.status, p.nama_lengkap, p.no_telepon, p.email, ts.nomor_booking, "
            "ts.tanggal_mulai, ts.tanggal_selesai_rencana, ts.durasi_hari_rencana, ts.total_biaya, k.nama_kendaraan "
            "FROM TRANSAKSI_SEWA ts "
            "JOIN PELANGGAN p ON ts.id_pelanggan = p.id_pelanggan "
            "JOIN KENDARAAN k ON ts.id_kendaraan = k.id_kendaraan "
            "WHERE ts.midtrans_order_id = %(oid)s",
            {"oid": order_id}
        )
        trx = await cur.fetchone()
        set_status = ""
        if status_pembayaran == "LUNAS":
            set_status = ", status = IF(status = 'MENUNGGU', 'DIKONFIRMASI', status)"

        await cur.execute(
            f"UPDATE TRANSAKSI_SEWA "
            f"SET midtrans_status = %(ms)s, midtrans_transaction_id = %(mti)s, status_pembayaran = %(sp)s {set_status} "
            f"WHERE midtrans_order_id = %(oid)s",
            {"ms": trx_status, "mti": payload.get("transaction_id"),
             "sp": status_pembayaran, "oid": order_id},
        )
        if trx and trx["status"] == "MENUNGGU" and status_pembayaran == "LUNAS":
            pesan = (
                f"✅ *Booking AeroRent Berhasil!*\n\nHalo {trx['nama_lengkap']},\n📋 No. Booking: *{trx['nomor_booking']}*\n"
                f"📅 {trx['tanggal_mulai']} s/d {trx['tanggal_selesai_rencana']} ({trx['durasi_hari_rencana']} hari)\n💰 Total: Rp {trx['total_biaya']:,.0f}\n"
            )
            bt.add_task(fonnte_send, trx["no_telepon"], pesan)
            if trx.get("email"):
                bt.add_task(smtp_booking_notification, trx["email"], trx["nama_lengkap"], trx["nomor_booking"], trx["tanggal_mulai"], trx["tanggal_selesai_rencana"], trx["nama_kendaraan"])

        log.info(f"[Midtrans Webhook] order={order_id}, status={trx_status}, status_pembayaran={status_pembayaran}")
        return {"status": "OK"}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"[Midtrans Webhook] Error processing webhook: {e}")
        raise HTTPException(500, "Terjadi kesalahan saat memproses webhook Midtrans.")
