import httpx
import json
import base64
import os
import aiosmtplib
import aiomysql
from typing import Optional
from contextlib import asynccontextmanager
from datetime import date, timedelta
import datetime
from database import get_db, _pool
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from fastapi import HTTPException, BackgroundTasks
from config import cfg, log
import io
from PIL import Image

async def compress_image(image_bytes: bytes, quality: int = 80, max_size: tuple = (1200, 1200)) -> bytes:
    """
    Mengkompresi gambar menggunakan Pillow agar ukurannya lebih kecil (untuk menghemat bandwidth dan biaya OCR/ImgBB).
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        
        # Konversi ke RGB jika format RGBA/P
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
            
        # Resize jika terlalu besar
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=quality, optimize=True)
        return output.getvalue()
    except Exception as e:
        log.error(f"[ImageCompress] Gagal mengkompresi gambar: {e}")
        return image_bytes  # Fallback ke bytes asli jika gagal


async def imgbb_upload(file_bytes: bytes, filename: str) -> str:
    """
    Upload foto ke Cloudinary → kembalikan URL permanen.
    Tetap menggunakan nama fungsi 'imgbb_upload' agar tidak perlu refactor massal H-1.
    """
    if not cfg.CLOUDINARY_CLOUD_NAME or not cfg.CLOUDINARY_UPLOAD_PRESET:
        import os
        os.makedirs("uploads", exist_ok=True)
        local_path = os.path.join("uploads", filename)
        with open(local_path, "wb") as f:
            f.write(file_bytes)
        log.warning(f"[Cloudinary] API Key kosong, foto disimpan lokal: {local_path}")
        return f"http://localhost:8000/uploads/{filename}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://api.cloudinary.com/v1_1/{cfg.CLOUDINARY_CLOUD_NAME}/image/upload",
            data={"upload_preset": cfg.CLOUDINARY_UPLOAD_PRESET},
            files={"file": (filename, file_bytes, "image/jpeg")},
        )

    if resp.status_code != 200:
        err = resp.json().get("error", {}).get("message", "unknown")
        log.error(f"[Cloudinary] Upload gagal ({filename}): {err}")
        raise HTTPException(502, f"Upload foto ke Cloudinary gagal: {err}")

    # Kembalikan URL https dari Cloudinary
    url = resp.json().get("secure_url", "")
    log.info(f"[Cloudinary] Upload OK: {url}")
    return url


async def midtrans_snap(order_id: str, amount: float, nama: str, email: str) -> dict:
    """
    Buat transaksi Midtrans Snap — kembalikan snap_token & redirect_url.
    Endpoint Sandbox: api.sandbox.midtrans.com
    """
    if not cfg.MIDTRANS_SERVER_KEY:
        raise HTTPException(503, "MIDTRANS_SERVER_KEY belum dikonfigurasi di .env")

    base = "https://app.midtrans.com" if cfg.MIDTRANS_IS_PROD else "https://app.sandbox.midtrans.com"
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


async def fonnte_send_file(nomor: str, pesan: str, file_bytes: bytes, filename: str, mime: str = "application/pdf") -> bool:
    """
    Kirim file/dokumen via WhatsApp Fonnte API (multipart file upload).
    Digunakan untuk: kirim invoice PDF ke pelanggan.
    """
    if not cfg.FONNTE_TOKEN:
        log.warning("[Fonnte] Token belum dikonfigurasi. Pengiriman file WA dilewati.")
        return False

    nomor_bersih = nomor.replace("+", "").replace("-", "").replace(" ", "")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.fonnte.com/send",
                headers={"Authorization": cfg.FONNTE_TOKEN},
                data={
                    "target": nomor_bersih,
                    "message": pesan,
                    "filename": filename,
                    "countryCode": "62",
                },
                files={
                    "file": (filename, file_bytes, mime),
                },
            )
        result = resp.json()
        ok = result.get("status", False)
        if ok:
            log.info(f"[Fonnte] File WA '{filename}' terkirim ke {nomor}")
        else:
            log.warning(f"[Fonnte] Gagal kirim file ke {nomor}: {resp.text[:200]}")
        return ok
    except Exception as exc:
        log.error(f"[Fonnte] Exception saat kirim file: {exc}")
        return False


def generate_invoice_pdf(data: dict) -> bytes:
    """
    Generate invoice PDF menggunakan ReportLab. Return raw bytes.
    data harus berisi: booking, pelanggan, kendaraan, mulai, selesai, durasi, total, status, biaya_sewa, biaya_supir, dll.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=25*mm, bottomMargin=20*mm, leftMargin=20*mm, rightMargin=20*mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('InvTitle', parent=styles['Title'], fontSize=20, textColor=colors.HexColor("#1a1a2e"), spaceAfter=4)
    subtitle_style = ParagraphStyle('InvSub', parent=styles['Normal'], fontSize=9, textColor=colors.grey, spaceAfter=12, alignment=TA_CENTER)
    heading_style = ParagraphStyle('InvH', parent=styles['Heading3'], fontSize=11, textColor=colors.HexColor("#1a1a2e"), spaceBefore=14, spaceAfter=6)
    normal_style = ParagraphStyle('InvN', parent=styles['Normal'], fontSize=10, leading=14)
    right_style = ParagraphStyle('InvR', parent=styles['Normal'], fontSize=10, alignment=TA_RIGHT)
    total_style = ParagraphStyle('InvTotal', parent=styles['Normal'], fontSize=13, alignment=TA_RIGHT, textColor=colors.HexColor("#d4a017"), leading=18)

    def rp(val):
        try:
            return f"Rp {int(float(val)):,}".replace(",", ".")
        except:
            return f"Rp {val}"

    elements = []

    # Header
    elements.append(Paragraph("AERORENT", title_style))
    elements.append(Paragraph("Jl. Diponegoro No.123, Salatiga  |  Telp: +62 812-3456-7890", subtitle_style))

    # Garis pemisah
    line_data = [["" ]]
    line_tbl = Table(line_data, colWidths=[170*mm])
    line_tbl.setStyle(TableStyle([('LINEBELOW', (0,0), (-1,0), 1.5, colors.HexColor("#d4a017"))]))
    elements.append(line_tbl)
    elements.append(Spacer(1, 8))

    # Info booking
    elements.append(Paragraph("DETAIL INVOICE", heading_style))
    info_data = [
        ["No. Booking", f": {data.get('booking', '-')}"],
        ["Status", f": {data.get('status', '-')}"],
        ["Pelanggan", f": {data.get('pelanggan', '-')}"],
        ["Kendaraan", f": {data.get('kendaraan', '-')}"],
        ["Periode Sewa", f": {data.get('mulai', '-')}  s/d  {data.get('selesai', '-')}"],
        ["Durasi", f": {data.get('durasi', '-')} hari"],
    ]
    info_tbl = Table(info_data, colWidths=[40*mm, 130*mm])
    info_tbl.setStyle(TableStyle([
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('TEXTCOLOR', (0,0), (0,-1), colors.grey),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    elements.append(info_tbl)

    # Rincian biaya
    elements.append(Paragraph("RINCIAN BIAYA", heading_style))
    cost_data = [["Komponen", "Jumlah"]]
    cost_data.append(["Biaya Sewa", rp(data.get('biaya_sewa', 0))])
    if float(data.get('biaya_supir', 0)) > 0:
        cost_data.append(["Biaya Supir", rp(data.get('biaya_supir', 0))])
    if float(data.get('denda_terlambat', 0)) > 0:
        cost_data.append(["Denda Keterlambatan", rp(data.get('denda_terlambat', 0))])
    if float(data.get('denda_kerusakan', 0)) > 0:
        cost_data.append(["Denda Kerusakan", rp(data.get('denda_kerusakan', 0))])
    if float(data.get('biaya_tambahan', 0)) > 0:
        cost_data.append(["Biaya Tambahan Lain", rp(data.get('biaya_tambahan', 0))])

    cost_tbl = Table(cost_data, colWidths=[110*mm, 60*mm])
    cost_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1a1a2e")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e0e0e0")),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(cost_tbl)
    elements.append(Spacer(1, 6))

    # Total
    total_data = [["TOTAL PEMBAYARAN", rp(data.get('total', 0))]]
    total_tbl = Table(total_data, colWidths=[110*mm, 60*mm])
    total_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#d4a017")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTSIZE', (0,0), (-1,-1), 12),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
    ]))
    elements.append(total_tbl)
    elements.append(Spacer(1, 20))

    # Footer
    elements.append(Paragraph("Terima kasih telah menggunakan layanan AeroRent!", ParagraphStyle('footer', parent=styles['Normal'], fontSize=9, textColor=colors.grey, alignment=TA_CENTER)))
    elements.append(Paragraph("Invoice ini digenerate secara otomatis oleh sistem AeroRent.", ParagraphStyle('footer2', parent=styles['Normal'], fontSize=8, textColor=colors.lightgrey, alignment=TA_CENTER, spaceBefore=4)))

    doc.build(elements)
    return buf.getvalue()


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

def generate_ics(nomor_booking: str, nama_kendaraan: str, dt_mulai: datetime.datetime, dt_selesai_rencana: datetime.datetime) -> bytes:
    """Generate ICS file bytes for booking rental dates."""
    dtstart = dt_mulai.strftime('%Y%m%dT%H%M%S')
    dtend = dt_selesai_rencana.strftime('%Y%m%dT%H%M%S')
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    
    ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AeroRent Salatiga//ID
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:{nomor_booking}@aerorent.id
DTSTAMP:{now}
DTSTART:{dtstart}
DTEND:{dtend}
SUMMARY:Sewa {nama_kendaraan} - AeroRent
DESCRIPTION:Nomor Booking: {nomor_booking}\\nKendaraan: {nama_kendaraan}\\nHarap kembalikan kendaraan sesuai tanggal selesai yang dijanjikan.
END:VEVENT
END:VCALENDAR"""
    return ics_content.encode('utf-8')


async def smtp_booking_notification(email_tujuan: str, nama: str, booking: str, tgl_mulai: datetime.datetime, tgl_selesai: datetime.datetime, nama_kendaraan: str) -> bool:
    """Kirim email notifikasi booking sukses beserta attachment kalender ICS."""
    if not cfg.SMTP_USER:
        log.warning("[SMTP] Belum dikonfigurasi. Pengiriman email dilewati.")
        return False
    try:
        msg = MIMEMultipart("mixed")
        msg["From"]    = cfg.SMTP_FROM
        msg["To"]      = email_tujuan
        msg["Subject"] = f"Booking Berhasil: {nama_kendaraan} — {booking}"
        
        body_text = (
            f"Yth. {nama},\n\nTerima kasih telah melakukan pemesanan di AeroRent!\n\n"
            f"Berikut adalah ringkasan pesanan Anda:\n"
            f"Nomor Booking: {booking}\n"
            f"Kendaraan: {nama_kendaraan}\n"
            f"Tanggal Sewa: {tgl_mulai.strftime('%d %B %Y %H:%M')} - {tgl_selesai.strftime('%d %B %Y %H:%M')}\n\n"
            f"Terlampir file kalender (.ics) agar Anda dapat menambahkan jadwal sewa ini langsung ke Google Calendar atau Apple Calendar di ponsel Anda.\n\n"
            f"Salam hangat,\nTim AeroRent Salatiga"
        )
        msg.attach(MIMEText(body_text, "plain"))
        
        # Buat attachment ICS
        ics_bytes = generate_ics(booking, nama_kendaraan, tgl_mulai, tgl_selesai)
        att = MIMEBase("text", "calendar", method="REQUEST")
        att.set_payload(ics_bytes)
        encoders.encode_base64(att)
        att.add_header("Content-Disposition", "attachment", filename=f"AeroRent_{booking}.ics")
        msg.attach(att)

        await aiosmtplib.send(
            msg, hostname=cfg.SMTP_HOST, port=cfg.SMTP_PORT,
            username=cfg.SMTP_USER, password=cfg.SMTP_PASSWORD, start_tls=True
        )
        log.info(f"[SMTP] Email Booking {booking} terkirim ke {email_tujuan}")
        return True
    except Exception as exc:
        log.error(f"[SMTP] Gagal kirim email booking ke {email_tujuan}: {exc}")
        return False


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

def generate_laporan_keuangan_pdf(data: dict) -> bytes:
    """
    Generate PDF Laporan Keuangan menggunakan ReportLab. Return raw bytes.
    data = hasil response JSON dari /laporan/keuangan
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    import io
    
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=25*mm, bottomMargin=20*mm, leftMargin=20*mm, rightMargin=20*mm)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('RptTitle', parent=styles['Title'], fontSize=18, textColor=colors.HexColor("#1a1a2e"), spaceAfter=6, fontName='Helvetica-Bold')
    subtitle_style = ParagraphStyle('RptSub', parent=styles['Normal'], fontSize=10, textColor=colors.grey, spaceAfter=15, alignment=TA_CENTER)
    heading_style = ParagraphStyle('RptH', parent=styles['Heading3'], fontSize=12, textColor=colors.HexColor("#1a1a2e"), spaceBefore=20, spaceAfter=10, fontName='Helvetica-Bold')
    
    def rp(val):
        return f"Rp {float(val):,.0f}".replace(",", ".")
        
    elements = []
    
    # 1. Header
    elements.append(Paragraph("LAPORAN KEUANGAN AERORENT", title_style))
    periode = data.get("periode", {})
    tgl_teks = f"Periode: {periode.get('dari', '-')} s/d {periode.get('sampai', '-')}"
    elements.append(Paragraph(tgl_teks, subtitle_style))
    
    line_tbl = Table([[""]], colWidths=[170*mm])
    line_tbl.setStyle(TableStyle([('LINEBELOW', (0,0), (-1,0), 1.5, colors.HexColor("#d4a017"))]))
    elements.append(line_tbl)
    elements.append(Spacer(1, 15))
    
    # 2. Ringkasan Finansial
    elements.append(Paragraph("RINGKASAN FINANSIAL", heading_style))
    ringkasan = data.get("ringkasan", {})
    
    ringkasan_data = [
        ["Total Pendapatan Kotor", rp(ringkasan.get("total_pendapatan_kotor", 0))],
        ["Total Biaya Operasional", rp(ringkasan.get("total_biaya_operasional", 0))],
        ["Profit Bersih", rp(ringkasan.get("profit_bersih", 0))],
        ["Margin Keuntungan", f"{ringkasan.get('margin_persen', 0)} %"],
        ["Transaksi Selesai", f"{ringkasan.get('jumlah_transaksi_selesai', 0)} transaksi"],
    ]
    
    ring_tbl = Table(ringkasan_data, colWidths=[90*mm, 80*mm])
    ring_tbl.setStyle(TableStyle([
        ('FONTSIZE', (0,0), (-1,-1), 11),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.lightgrey),
        ('FONTNAME', (0,2), (1,2), 'Helvetica-Bold'), # Bold profit
        ('TEXTCOLOR', (1,2), (1,2), colors.HexColor("#10B981") if float(ringkasan.get("profit_bersih", 0)) >= 0 else colors.HexColor("#EF4444")),
    ]))
    elements.append(ring_tbl)
    
    # 3. Distribusi Pengeluaran (Tabel Kategori)
    elements.append(Paragraph("RINCIAN PENGELUARAN (BERDASARKAN KATEGORI)", heading_style))
    dist_peng = data.get("distribusi_pengeluaran", {})
    
    if dist_peng:
        peng_data = [["Kategori", "Jumlah (Rp)"]]
        for k, v in dist_peng.items():
            peng_data.append([str(k).upper(), rp(v)])
            
        peng_tbl = Table(peng_data, colWidths=[110*mm, 60*mm])
        peng_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#374151")),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,0), 8),
            ('TOPPADDING', (0,0), (-1,0), 8),
            ('ALIGN', (1,0), (1,-1), 'RIGHT'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
            ('FONTSIZE', (0,0), (-1,-1), 10),
        ]))
        elements.append(peng_tbl)
    else:
        elements.append(Paragraph("<i>Tidak ada pengeluaran pada periode ini.</i>", ParagraphStyle('i', parent=styles['Normal'], textColor=colors.grey)))
        
    # 4. Top Kendaraan
    elements.append(Paragraph("TOP 5 KENDARAAN (KONTRIBUSI PENDAPATAN TERBESAR)", heading_style))
    top_kend = data.get("top_5_kendaraan", [])
    
    if top_kend:
        kend_data = [["No", "Nama Kendaraan", "Jml Sewa", "Total Pendapatan"]]
        for idx, k in enumerate(top_kend, start=1):
            kend_data.append([str(idx), k.get("nama", "-"), str(k.get("jumlah_sewa", 0)), rp(k.get("total", 0))])
            
        kend_tbl = Table(kend_data, colWidths=[15*mm, 85*mm, 30*mm, 40*mm])
        kend_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#374151")),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,0), 8),
            ('TOPPADDING', (0,0), (-1,0), 8),
            ('ALIGN', (0,0), (0,-1), 'CENTER'),
            ('ALIGN', (2,0), (-1,-1), 'RIGHT'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
            ('FONTSIZE', (0,0), (-1,-1), 10),
        ]))
        elements.append(kend_tbl)
    else:
        elements.append(Paragraph("<i>Tidak ada transaksi selesai pada periode ini.</i>", ParagraphStyle('i', parent=styles['Normal'], textColor=colors.grey)))
        
    doc.build(elements)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes
