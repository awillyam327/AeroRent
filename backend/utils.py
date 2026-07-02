import httpx
import json
import base64
import os
import aiosmtplib
import aiomysql
from typing import Optional
from contextlib import asynccontextmanager
from datetime import date, timedelta
from database import get_db, _pool
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from fastapi import HTTPException, BackgroundTasks
from config import cfg, log

async def imgbb_upload(file_bytes: bytes, filename: str) -> str:
    """
    Upload foto ke ImgBB → kembalikan URL permanen.
    Digunakan untuk: foto KTP/SIM pelanggan, foto kondisi kendaraan (FR-07).
    """
    if not cfg.IMGBB_API_KEY:
        import os
        os.makedirs("uploads", exist_ok=True)
        local_path = os.path.join("uploads", filename)
        with open(local_path, "wb") as f:
            f.write(file_bytes)
        log.warning(f"[ImgBB] API Key kosong, foto disimpan lokal: {local_path}")
        return f"http://localhost:8000/uploads/{filename}"

    b64 = base64.b64encode(file_bytes).decode()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.imgbb.com/1/upload",
            params={"key": cfg.IMGBB_API_KEY},
            data={"image": b64, "name": filename},
        )

    if resp.status_code != 200:
        err = resp.json().get("error", {}).get("message", "unknown")
        log.error(f"[ImgBB] Upload gagal ({filename}): {err}")
        raise HTTPException(502, f"Upload foto ke ImgBB gagal: {err}")

    url = resp.json()["data"]["url"]
    log.info(f"[ImgBB] Upload OK: {url}")
    return url


async def midtrans_snap(order_id: str, amount: float, nama: str, email: str) -> dict:
    """
    Buat transaksi Midtrans Snap — kembalikan snap_token & redirect_url.
    Endpoint Sandbox: api.sandbox.midtrans.com
    """
    if not cfg.MIDTRANS_SERVER_KEY:
        raise HTTPException(503, "MIDTRANS_SERVER_KEY belum dikonfigurasi di .env")

    base = "https://api.midtrans.com" if cfg.MIDTRANS_IS_PROD else "https://api.sandbox.midtrans.com"
    auth = base64.b64encode(f"{cfg.MIDTRANS_SERVER_KEY}:".encode()).decode()

    payload = {
        "transaction_details": {"order_id": order_id, "gross_amount": int(amount)},
        "customer_details":    {"first_name": nama, "email": email or "noreply@aerorent.id"},
        "expiry":              {"unit": "hours", "duration": 24},
        "credit_card":         {"secure": True},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{base}/snap/v1/transactions",
            json=payload,
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
        )

    if resp.status_code not in (200, 201):
        log.error(f"[Midtrans] Error: {resp.text[:300]}")
        raise HTTPException(502, "Gagal membuat transaksi Midtrans.")

    log.info(f"[Midtrans] Snap token dibuat untuk order: {order_id}")
    return resp.json()


async def fonnte_send(nomor: str, pesan: str) -> bool:
    """
    Kirim pesan WhatsApp via Fonnte API.
    Digunakan untuk: konfirmasi booking, reminder pengembalian H-1.
    """
    if not cfg.FONNTE_TOKEN:
        log.warning("[Fonnte] Token belum dikonfigurasi. Notifikasi WA dilewati.")
        return False

    nomor_bersih = nomor.replace("+", "").replace("-", "").replace(" ", "")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.fonnte.com/send",
                headers={"Authorization": cfg.FONNTE_TOKEN},
                data={"target": nomor_bersih, "message": pesan, "delay": "2", "countryCode": "62"},
            )
        ok = resp.json().get("status", False)
        if ok:
            log.info(f"[Fonnte] WA terkirim ke {nomor}")
        else:
            log.warning(f"[Fonnte] Gagal kirim ke {nomor}: {resp.text[:150]}")
        return ok
    except Exception as exc:
        log.error(f"[Fonnte] Exception: {exc}")
        return False


async def traccar_posisi(device_id: str) -> Optional[dict]:
    """
    Ambil posisi GPS terakhir kendaraan dari server Traccar (NFR-07).
    """
    if not device_id:
        return None
    auth = base64.b64encode(f"{cfg.TRACCAR_USER}:{cfg.TRACCAR_PASSWORD}".encode()).decode()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{cfg.TRACCAR_BASE_URL}/api/positions",
                params={"deviceId": device_id, "limit": 1},
                headers={"Authorization": f"Basic {auth}"},
            )
        if resp.status_code != 200:
            return None
        positions = resp.json()
        if not positions:
            return None
        p = positions[0]
        return {
            "latitude":   p.get("latitude"),
            "longitude":  p.get("longitude"),
            "speed_kmh":  round(p.get("speed", 0) * 1.852, 1),  # knots → km/h
            "altitude_m": p.get("altitude"),
            "fix_time":   p.get("fixTime"),
            "address":    p.get("address"),
            "device_id":  device_id,
        }
    except httpx.RequestError as exc:
        log.error(f"[Traccar] Request error (device={device_id}): {exc}")
        return None


async def smtp_invoice(email_tujuan: str, nama: str, booking: str, pdf_bytes: bytes) -> bool:
    """Kirim invoice PDF ke email pelanggan via aiosmtplib (async SMTP)."""
    if not cfg.SMTP_USER:
        log.warning("[SMTP] Belum dikonfigurasi. Pengiriman email dilewati.")
        return False
    try:
        msg = MIMEMultipart("mixed")
        msg["From"]    = cfg.SMTP_FROM
        msg["To"]      = email_tujuan
        msg["Subject"] = f"Invoice Sewa AeroRent — {booking}"
        msg.attach(MIMEText(
            f"Yth. {nama},\n\nTerlampir invoice untuk transaksi {booking}.\n\n"
            "Terima kasih telah menggunakan layanan AeroRent!\n\nSalam,\nTim AeroRent Salatiga",
            "plain"
        ))
        att = MIMEBase("application", "pdf")
        att.set_payload(pdf_bytes)
        encoders.encode_base64(att)
        att.add_header("Content-Disposition", "attachment", filename=f"Invoice_{booking}.pdf")
        msg.attach(att)

        await aiosmtplib.send(
            msg, hostname=cfg.SMTP_HOST, port=cfg.SMTP_PORT,
            username=cfg.SMTP_USER, password=cfg.SMTP_PASSWORD, start_tls=True
        )
        log.info(f"[SMTP] Invoice {booking} terkirim ke {email_tujuan}")
        return True
    except Exception as exc:
        log.error(f"[SMTP] Gagal kirim invoice ke {email_tujuan}: {exc}")
        return False


# ==============================================================================
# EMAIL VERIFIKASI
# ==============================================================================

async def send_verification_email(email_tujuan: str, token: str) -> bool:
    """Kirim email verifikasi saat registrasi."""
    try:
        verify_url = f"{cfg.FRONTEND_URL}/login.html?verify={token}"
        msg = MIMEMultipart("alternative")
        msg["From"] = cfg.SMTP_FROM
        msg["To"] = email_tujuan
        msg["Subject"] = "Verifikasi Akun AeroRent Anda"

        html = f"""
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f4f4f5; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <h2 style="color: #7c3aed; text-align: center; margin-bottom: 20px;">AeroRent Salatiga</h2>
              <p style="color: #3f3f46; font-size: 16px;">Halo,</p>
              <p style="color: #3f3f46; font-size: 16px;">Terima kasih telah mendaftar di AeroRent. Silakan klik tombol di bawah ini untuk memverifikasi alamat email Anda dan mengaktifkan akun Anda.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{verify_url}" style="background-color: #7c3aed; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Verifikasi Email Saya</a>
              </div>
              <p style="color: #71717a; font-size: 14px; text-align: center;">Tautan ini akan kedaluwarsa dalam 24 jam.</p>
              <p style="color: #71717a; font-size: 12px; text-align: center; margin-top: 30px;">
                Jika Anda tidak merasa mendaftar di AeroRent, abaikan email ini.
              </p>
            </div>
          </body>
        </html>
        """
        
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg, hostname=cfg.SMTP_HOST, port=cfg.SMTP_PORT,
            username=cfg.SMTP_USER, password=cfg.SMTP_PASSWORD, start_tls=True
        )
        log.info(f"[SMTP] Email verifikasi terkirim ke {email_tujuan}")
        return True
    except Exception as exc:
        log.error(f"[SMTP] Gagal kirim email verifikasi ke {email_tujuan}: {exc}")
        return False

# ==============================================================================
# SCHEDULER — Reminder WA H-1 Pengembalian (APScheduler)
# ==============================================================================


async def job_reminder_pengembalian() -> None:
    """
    Scheduled job harian 09:00 WIB:
    Kirim WA reminder ke pelanggan yang jadwal pengembaliannya BESOK.
    ✅ DIPERBAIKI:
      - Pakai async with _pool.acquire() (bukan acquire/release manual)
      - Pakai DictCursor (bukan cursor() polos yang return tuple)
      - Pakai %(besok)s (bukan :besok syntax Oracle)
      - Akses data via r["kolom"] (bukan r[0], r[1], r[2])
    """
    if not _pool:
        return
    besok = date.today() + timedelta(days=1)

    async with _pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:          # ← DictCursor
            await cur.execute(
                """
                SELECT ts.nomor_booking, p.nama_lengkap, p.no_telepon, k.nama_kendaraan
                FROM TRANSAKSI_SEWA ts
                JOIN PELANGGAN  p ON ts.id_pelanggan = p.id_pelanggan
                JOIN KENDARAAN  k ON ts.id_kendaraan = k.id_kendaraan
                WHERE ts.status = 'AKTIF'
                  AND ts.tanggal_selesai_rencana = %(besok)s
                """,                                                   # ← %(besok)s
                {"besok": besok},
            )
            rows = await cur.fetchall()

    for r in rows:
        await fonnte_send(
            r["no_telepon"],                                           # ← dict access
            f"⏰ *Reminder Pengembalian — AeroRent*\n\n"
            f"Halo {r['nama_lengkap']},\n"
            f"Kendaraan *{r['nama_kendaraan']}* (Booking: *{r['nomor_booking']}*) "
            f"dijadwalkan dikembalikan *besok, {besok.strftime('%d %B %Y')}*.\n\n"
            f"Pastikan kondisi kendaraan baik.\nInfo: +62 812-3456-7890\n\n"
            f"Terima kasih 🚗 AeroRent",
        )
    log.info(f"[Scheduler] Reminder WA terkirim untuk {len(rows)} transaksi.")


# ==============================================================================
# HELPER: Format respons row Oracle → dict
# ==============================================================================
def fmt_date(val) -> Optional[str]:
    return val.isoformat() if val else None


def fmt_float(val) -> float:
    return float(val) if val is not None else 0.0

