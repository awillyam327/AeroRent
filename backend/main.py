"""
==============================================================================
AeroRent Fleet Management & POS System — Backend API
==============================================================================
Stack  : FastAPI + TiDB + jwt + passlib[bcrypt]
Integ. : ImgBB | Midtrans Sandbox | Fonnte WhatsApp | Traccar GPS | SMTP
Penulis: Tim Backend AeroRent
==============================================================================
"""
import random
import os
import uuid
import json
import base64
import hashlib
import asyncio
import logging
from datetime    import datetime, date, timedelta, timezone
from typing      import Optional, AsyncGenerator
from contextlib  import asynccontextmanager
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from email.mime.base      import MIMEBase
from email                import encoders

import aiomysql
import httpx
import jwt
import aiosmtplib
from fastapi                 import (FastAPI, Depends, HTTPException, status,
                                      UploadFile, File, Form,
                                      BackgroundTasks, Request)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security        import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses       import StreamingResponse
from pydantic                import BaseModel, field_validator
from pydantic_settings       import BaseSettings, SettingsConfigDict
from passlib.context         import CryptContext
from dotenv                  import load_dotenv
from apscheduler.schedulers.asyncio import AsyncIOScheduler

load_dotenv()

# ==============================================================================
# KONFIGURASI — Pydantic BaseSettings (baca dari .env)
# ==============================================================================
class Settings(BaseSettings):
    # Database Oracle 19c
    DB_HOST:     str = "gateway01.ap-southeast-1.prod.aws.tidbcloud.com"
    DB_PORT:     int = 4000
    DB_USER:     str = "2QN6TiyQC2GrnuN.root"
    DB_PASSWORD: str = ""
    DB_NAME:     str = "NwUQIsMUGSVQ2Whj"

    # JWT
    JWT_SECRET:         str   = "GANTI_DENGAN_STRING_PANJANG_DAN_ACAK_DI_PRODUCTION"
    JWT_ALGORITHM:      str   = "HS256"
    ACCESS_EXPIRE_MIN:  int   = 60
    REFRESH_EXPIRE_DAYS:int   = 7

    # ImgBB
    IMGBB_API_KEY:      str   = ""

    # Midtrans (Sandbox)
    MIDTRANS_SERVER_KEY:str   = ""
    MIDTRANS_CLIENT_KEY:str   = ""
    MIDTRANS_IS_PROD:   bool  = False

    # Fonnte WhatsApp Gateway
    FONNTE_TOKEN:       str   = ""

    # Traccar GPS Server
    TRACCAR_BASE_URL:   str   = "http://localhost:8082"
    TRACCAR_USER:       str   = "admin"
    TRACCAR_PASSWORD:   str   = "admin"

    # SMTP Email (untuk invoice PDF)
    SMTP_HOST:          str   = "smtp.gmail.com"
    SMTP_PORT:          int   = 587
    SMTP_USER:          str   = ""
    SMTP_PASSWORD:      str   = ""
    SMTP_FROM:          str   = "noreply@aerorent.id"

    APP_DEBUG:          bool  = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


cfg = Settings()
logging.basicConfig(
    level   = logging.DEBUG if cfg.APP_DEBUG else logging.INFO,
    format  = "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt = "%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("aerorent")

# ==============================================================================
# DATABASE CONNECTION POOL (Oracle 19c Async)
# ==============================================================================
_pool: Optional[aiomysql.Pool] = None


async def init_pool() -> None:
    global _pool
    _pool = await aiomysql.create_pool(
        host=cfg.DB_HOST,
        port=cfg.DB_PORT,
        user=cfg.DB_USER,
        password=cfg.DB_PASSWORD,
        db=cfg.DB_NAME,
        autocommit=True,
        ssl=True, # Wajib untuk TiDB Cloud
        minsize=2,
        maxsize=10
    )
    log.info(f"✅ TiDB pool siap (Host={cfg.DB_HOST})")

async def close_pool() -> None:
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        log.info("🛑 TiDB pool ditutup.")

async def get_db():
    """FastAPI Dependency: Pinjamkan langsung DictCursor ke setiap endpoint."""
    async with _pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            yield cur


# ==============================================================================
# KEAMANAN: JWT + bcrypt
# ==============================================================================
pwd_ctx       = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_pwd(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_pwd(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def make_token(payload: dict, expire_delta: timedelta) -> str:
    data = {
        **payload,
        "exp": datetime.now(timezone.utc) + expire_delta,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(data, cfg.JWT_SECRET, algorithm=cfg.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, cfg.JWT_SECRET, algorithms=[cfg.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token kadaluarsa. Silakan login kembali.",
                            headers={"WWW-Authenticate": "Bearer"})
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token tidak valid.",
                            headers={"WWW-Authenticate": "Bearer"})


# ==============================================================================
# DEPENDENCY: Autentikasi & RBAC
# ==============================================================================
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    cur: aiomysql.DictCursor = Depends(get_db), # SEKARANG LANGSUNG TERIMA CURSOR
) -> dict:
    payload = decode_token(token)
    uid: str = payload.get("sub", "")
    if not uid:
        raise HTTPException(401, "Token tidak memiliki subject yang valid.")

    # PERHATIKAN: :uid diganti menjadi %(uid)s
    await cur.execute(
        "SELECT id_karyawan, nama_lengkap, email, role, is_aktif "
        "FROM KARYAWAN WHERE id_karyawan = %(uid)s",
        {"uid": uid},
    )
    row = await cur.fetchone()
    if not row:
        raise HTTPException(401, "User tidak ditemukan.")
    
    # PERHATIKAN: row[4] diganti menjadi row["is_aktif"]
    if row["is_aktif"] == 0:
        raise HTTPException(403, "Akun telah dinonaktifkan oleh Owner.")

    return {"id": row["id_karyawan"], "nama": row["nama_lengkap"], "email": row["email"], "role": row["role"]}


async def req_owner(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "OWNER":
        raise HTTPException(403, "Endpoint ini hanya dapat diakses oleh OWNER.")
    return user


async def req_kasir_or_owner(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("KASIR", "OWNER"):
        raise HTTPException(403, "Diperlukan role KASIR atau OWNER.")
    return user


# ==============================================================================
# PYDANTIC MODELS (Request / Response)
# ==============================================================================
class TokenPair(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str  = "bearer"
    user:          dict


class KaryawanIn(BaseModel):
    nama_lengkap:   str
    email:          str
    no_telepon:     Optional[str]   = None
    password:       str
    role:           str
    gaji_per_bulan: Optional[float] = 0

    @field_validator("role")
    @classmethod
    def cek_role(cls, v: str) -> str:
        if v not in ("OWNER", "KASIR"):
            raise ValueError("role harus 'OWNER' atau 'KASIR'")
        return v


class KaryawanUpd(BaseModel):
    nama_lengkap:   Optional[str]   = None
    no_telepon:     Optional[str]   = None
    is_aktif:       Optional[int]   = None
    gaji_per_bulan: Optional[float] = None


class KendaraanIn(BaseModel):
    nama_kendaraan:       str
    merk:                 str
    model:                Optional[str]   = None
    tahun:                int
    nomor_plat:           str
    tipe_kendaraan:       str             # '5_SEATER'|'7_SEATER'|'MICROBUS'
    transmisi:            str             = "AT"
    bahan_bakar:          str             = "Bensin"
    kapasitas_penumpang:  Optional[int]   = None
    harga_sewa_harian:    float
    harga_supir_harian:   float           = 150_000
    is_featured:          int             = 0
    traccar_device_id:    Optional[str]   = None
    deskripsi:            Optional[str]   = None

    @field_validator("tipe_kendaraan")
    @classmethod
    def cek_tipe(cls, v: str) -> str:
        if v not in ("5_SEATER", "7_SEATER", "MICROBUS"):
            raise ValueError("tipe_kendaraan harus: 5_SEATER | 7_SEATER | MICROBUS")
        return v


class KendaraanUpd(BaseModel):
    nama_kendaraan:     Optional[str]   = None
    harga_sewa_harian:  Optional[float] = None
    harga_supir_harian: Optional[float] = None
    status:             Optional[str]   = None
    is_featured:        Optional[int]   = None
    traccar_device_id:  Optional[str]   = None
    foto_url:           Optional[str]   = None
    deskripsi:          Optional[str]   = None


class PelangganIn(BaseModel):
    nama_lengkap: str
    no_telepon:   str
    email:        Optional[str] = None
    alamat:       Optional[str] = None
    no_ktp:       Optional[str] = None


class TransaksiIn(BaseModel):
    id_pelanggan:           str
    id_kendaraan:           str
    tanggal_mulai:          date
    tanggal_selesai_rencana: date
    gunakan_supir:          int             = 0
    metode_pembayaran:      Optional[str]   = None
    catatan_kasir:          Optional[str]   = None

    @field_validator("tanggal_selesai_rencana")
    @classmethod
    def cek_tgl(cls, v: date, info) -> date:
        if "tanggal_mulai" in (info.data or {}) and v < info.data["tanggal_mulai"]:
            raise ValueError("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.")
        return v


class StatusUpd(BaseModel):
    status:                 str
    catatan_kasir:          Optional[str]   = None
    biaya_denda_kerusakan:  Optional[float] = None
    biaya_tambahan_lain:    Optional[float] = None


class PengeluaranIn(BaseModel):
    id_kendaraan:       Optional[str]   = None
    kategori:           str
    deskripsi:          str
    jumlah:             float
    tanggal_pengeluaran: date
    catatan:            Optional[str]   = None


# ==============================================================================
# INTEGRASI API EKSTERNAL (semua async via httpx)
# ==============================================================================

async def imgbb_upload(file_bytes: bytes, filename: str) -> str:
    """
    Upload foto ke ImgBB → kembalikan URL permanen.
    Digunakan untuk: foto KTP/SIM pelanggan, foto kondisi kendaraan (FR-07).
    """
    if not cfg.IMGBB_API_KEY:
        raise HTTPException(503, "IMGBB_API_KEY belum dikonfigurasi di .env")

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
# SCHEDULER — Reminder WA H-1 Pengembalian (APScheduler)
# ==============================================================================
scheduler = AsyncIOScheduler()


async def job_reminder_pengembalian() -> None:
    """
    Scheduled job: kirim WA reminder ke pelanggan dengan pengembalian BESOK.
    Dijadwalkan setiap hari pukul 09:00 WIB.
    """
    if not _pool:
        return
    besok = date.today() + timedelta(days=1)
    conn  = await _pool.acquire()
    try:
        cur = conn.cursor()
        await cur.execute(
            """
            SELECT ts.nomor_booking, p.nama_lengkap, p.no_telepon, k.nama_kendaraan
            FROM TRANSAKSI_SEWA ts
            JOIN PELANGGAN  p ON ts.id_pelanggan = p.id_pelanggan
            JOIN KENDARAAN  k ON ts.id_kendaraan = k.id_kendaraan
            WHERE ts.status = 'AKTIF' AND ts.tanggal_selesai_rencana = :besok
            """,
            {"besok": besok},
        )
        rows = await cur.fetchall()
        for r in rows:
            await fonnte_send(
                r[2],
                f"⏰ *Reminder Pengembalian — AeroRent*\n\n"
                f"Halo {r[1]},\nKendaraan *{r[3]}* (Booking: *{r[0]}*) "
                f"dijadwalkan dikembalikan *besok, {besok.strftime('%d %B %Y')}*.\n\n"
                f"Pastikan kondisi kendaraan baik.\nInfo: +62 812-3456-7890\n\n"
                f"Terima kasih 🚗 AeroRent",
            )
        log.info(f"[Scheduler] Reminder WA terkirim untuk {len(rows)} transaksi.")
    finally:
        await _pool.release(conn)


# ==============================================================================
# LIFESPAN & FASTAPI APPLICATION
# ==============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🚀 AeroRent API starting up...")
    await init_pool()
    scheduler.add_job(job_reminder_pengembalian, "cron", hour=9, minute=0, id="reminder_wa")
    scheduler.start()
    yield
    scheduler.shutdown()
    await close_pool()
    log.info("🛑 AeroRent API shutdown selesai.")


app = FastAPI(
    title       = "AeroRent Fleet & POS API",
    description = "Backend API — Sistem Manajemen Armada & POS AeroRent Salatiga",
    version     = "1.0.0",
    lifespan    = lifespan,
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],   # BATASI ke domain frontend di production!
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ==============================================================================
# HELPER: Format respons row Oracle → dict
# ==============================================================================
def fmt_date(val) -> Optional[str]:
    return val.isoformat() if val else None


def fmt_float(val) -> float:
    return float(val) if val is not None else 0.0


# ==============================================================================
# ROUTER: AUTENTIKASI
# ==============================================================================
@app.post("/auth/login", response_model=TokenPair, tags=["🔐 Auth"])
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    cur: aiomysql.DictCursor = Depends(get_db), # LANGSUNG TERIMA CURSOR
):
    # Parameter query diganti menjadi %(e)s
    await cur.execute(
        "SELECT id_karyawan, nama_lengkap, email, password_hash, role, is_aktif "
        "FROM KARYAWAN WHERE email = %(e)s",
        {"e": form.username},
    )
    row = await cur.fetchone()

    # Index array diganti jadi Index dictionary
    if not row or not verify_pwd(form.password, row["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email atau password salah.",
                            headers={"WWW-Authenticate": "Bearer"})
    if row["is_aktif"] == 0:
        raise HTTPException(403, "Akun telah dinonaktifkan. Hubungi Owner.")

    token_data = {"sub": row["id_karyawan"], "nama": row["nama_lengkap"], "email": row["email"], "role": row["role"]}
    access_tok  = make_token(token_data, timedelta(minutes=cfg.ACCESS_EXPIRE_MIN))
    refresh_tok = make_token({"sub": row["id_karyawan"], "type": "refresh"},
                             timedelta(days=cfg.REFRESH_EXPIRE_DAYS))

    log.info(f"[Auth] Login: {row['email']} (role={row['role']})")
    return TokenPair(
        access_token  = access_tok,
        refresh_token = refresh_tok,
        user          = {"id": row["id_karyawan"], "nama": row["nama_lengkap"], "email": row["email"], "role": row["role"]},
    )


@app.post("/auth/refresh", tags=["🔐 Auth"])
async def refresh(body: dict, cur=Depends(get_db)): # <-- oracledb dihapus, langsung pakai cur
    """Perbarui access token menggunakan refresh token yang masih valid."""
    tok = body.get("refresh_token")
    if not tok:
        raise HTTPException(400, "'refresh_token' wajib diisi.")
    payload = decode_token(tok)
    if payload.get("type") != "refresh":
        raise HTTPException(400, "Bukan token refresh yang valid.")

    # Dialek MySQL: %(id)s
    await cur.execute(
        "SELECT id_karyawan, nama_lengkap, email, role FROM KARYAWAN "
        "WHERE id_karyawan = %(id)s AND is_aktif = 1",
        {"id": payload.get("sub")},
    )
    row = await cur.fetchone()
    if not row:
        raise HTTPException(401, "User tidak ditemukan atau tidak aktif.")

    # Menggunakan kunci Dict, bukan indeks angka
    return {
        "access_token": make_token({"sub": row["id_karyawan"], "nama": row["nama_lengkap"], "email": row["email"], "role": row["role"]},
                                   timedelta(minutes=cfg.ACCESS_EXPIRE_MIN)),
        "token_type": "bearer",
    }


# ==============================================================================
# ROUTER: KARYAWAN (FR-09)
# ==============================================================================
@app.get("/karyawan", tags=["👤 Karyawan"])
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


@app.post("/karyawan", status_code=201, tags=["👤 Karyawan"])
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


@app.put("/karyawan/{kid}", tags=["👤 Karyawan"])
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


# ==============================================================================
# ROUTER: KENDARAAN
# ==============================================================================
# ==============================================================================
# ROUTER: KENDARAAN
# ==============================================================================
@app.get("/kendaraan", tags=["🚗 Kendaraan"])
async def list_kendaraan(
    tipe:     Optional[str]  = None,
    status:   Optional[str]  = None,
    featured: Optional[bool] = None,
    cur=Depends(get_db), # <-- cur
):
    q = ("SELECT id_kendaraan, nama_kendaraan, merk, model, tahun, nomor_plat, "
         "tipe_kendaraan, transmisi, bahan_bakar, kapasitas_penumpang, "
         "harga_sewa_harian, harga_supir_harian, status, foto_url, "
         "is_featured, traccar_device_id, odometer_km, created_at "
         "FROM KENDARAAN WHERE 1=1")
    p = {}
    if tipe:     q += " AND tipe_kendaraan = %(tipe)s"; p["tipe"] = tipe.upper()
    if status:   q += " AND status = %(st)s";           p["st"]   = status.upper()
    if featured is not None:
        q += " AND is_featured = %(ft)s"; p["ft"] = 1 if featured else 0
    q += " ORDER BY is_featured DESC, nama_kendaraan ASC"

    await cur.execute(q, p)
    rows = await cur.fetchall()
    
    # Format Dict MySQL
    for r in rows:
        r["harga_sewa_harian"] = fmt_float(r["harga_sewa_harian"])
        r["harga_supir_harian"] = fmt_float(r["harga_supir_harian"])
        r["created_at"] = fmt_date(r["created_at"])
    return rows


@app.get("/kendaraan/{kid}", tags=["🚗 Kendaraan"])
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


@app.post("/kendaraan", status_code=201, tags=["🚗 Kendaraan"])
async def tambah_kendaraan(body: KendaraanIn, user=Depends(req_owner), cur=Depends(get_db)):
    await cur.execute("SELECT COUNT(*) AS total FROM KENDARAAN WHERE nomor_plat = %(p)s", {"p": body.nomor_plat.upper()})
    cek = await cur.fetchone()
    if cek["total"] > 0:
        raise HTTPException(409, f"Nomor plat '{body.nomor_plat}' sudah terdaftar.")

    kid = f"kend-{uuid.uuid4()}"
    await cur.execute(
        "INSERT INTO KENDARAAN (id_kendaraan, nama_kendaraan, merk, model, tahun, nomor_plat, "
        "tipe_kendaraan, transmisi, bahan_bakar, kapasitas_penumpang, harga_sewa_harian, "
        "harga_supir_harian, is_featured, traccar_device_id, deskripsi) "
        "VALUES (%(id)s, %(n)s, %(m)s, %(mo)s, %(t)s, %(p)s, %(tp)s, %(tr)s, %(b)s, %(k)s, %(h)s, %(hs)s, %(f)s, %(tid)s, %(d)s)",
        {"id": kid, "n": body.nama_kendaraan, "m": body.merk, "mo": body.model,
         "t": body.tahun, "p": body.nomor_plat.upper(), "tp": body.tipe_kendaraan,
         "tr": body.transmisi, "b": body.bahan_bakar, "k": body.kapasitas_penumpang,
         "h": body.harga_sewa_harian, "hs": body.harga_supir_harian,
         "f": body.is_featured, "tid": body.traccar_device_id, "d": body.deskripsi},
    )
    return {"message": "Kendaraan berhasil ditambahkan.", "id_kendaraan": kid}


@app.put("/kendaraan/{kid}", tags=["🚗 Kendaraan"])
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


@app.post("/kendaraan/{kid}/foto", tags=["🚗 Kendaraan"])
async def upload_foto_kendaraan(kid: str, file: UploadFile = File(...), user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Format file harus JPEG, PNG, atau WebP.")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024: raise HTTPException(400, "Ukuran file maksimal 5MB.")

    url = await imgbb_upload(data, f"kendaraan_{kid[:8]}_{file.filename}")
    await cur.execute("UPDATE KENDARAAN SET foto_url = %(u)s WHERE id_kendaraan = %(id)s", {"u": url, "id": kid})
    return {"message": "Foto kendaraan diperbarui.", "foto_url": url}


@app.get("/kendaraan/{kid}/gps", tags=["🚗 Kendaraan"])
async def gps_kendaraan(kid: str, user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    await cur.execute("SELECT traccar_device_id, nama_kendaraan FROM KENDARAAN WHERE id_kendaraan = %(id)s", {"id": kid})
    row = await cur.fetchone()
    if not row: raise HTTPException(404, "Kendaraan tidak ditemukan.")
    if not row["traccar_device_id"]: raise HTTPException(404, f"Kendaraan '{row['nama_kendaraan']}' belum terhubung ke GPS Traccar.")

    posisi = await traccar_posisi(row["traccar_device_id"])
    if not posisi: raise HTTPException(503, "Data GPS tidak tersedia. Pastikan perangkat Traccar aktif.")
    return {"kendaraan": row["nama_kendaraan"], **posisi}


# ==============================================================================
# ROUTER: PELANGGAN
# ==============================================================================
@app.get("/pelanggan", tags=["👥 Pelanggan"])
async def list_pelanggan(user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    await cur.execute(
        "SELECT id_pelanggan AS id, nama_lengkap AS nama, email, no_telepon AS telepon, alamat, "
        "foto_ktp_url AS foto_ktp, is_verified, created_at FROM PELANGGAN ORDER BY created_at DESC"
    )
    rows = await cur.fetchall()
    for r in rows: r["created_at"] = fmt_date(r["created_at"])
    return rows


@app.get("/pelanggan/{pid}", tags=["👥 Pelanggan"])
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


@app.post("/pelanggan", status_code=201, tags=["👥 Pelanggan"])
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


# ==============================================================================
# ROUTER: TRANSAKSI SEWA
# ==============================================================================
@app.get("/transaksi", tags=["📋 Transaksi"])
async def list_transaksi(
    status: Optional[str] = None,
    dari:   Optional[date] = None,
    sampai: Optional[date] = None,
    limit:  int = 100,
    user=Depends(req_kasir_or_owner),
    cur=Depends(get_db),
):
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


@app.get("/transaksi/{tid}", tags=["📋 Transaksi"])
async def detail_transaksi(tid: str, cur=Depends(get_db)):
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


@app.post("/transaksi", status_code=201, tags=["📋 Transaksi"])
async def buat_transaksi(body: TransaksiIn, bt: BackgroundTasks, cur=Depends(get_db)):
    await cur.execute("SELECT status, harga_sewa_harian, harga_supir_harian FROM KENDARAAN WHERE id_kendaraan = %(id)s", {"id": body.id_kendaraan})
    kend = await cur.fetchone()
    if not kend: raise HTTPException(404, "Kendaraan tidak ditemukan.")
    if kend["status"] != "TERSEDIA": raise HTTPException(409, f"Kendaraan tidak tersedia (status: {kend['status']}).")

    await cur.execute("SELECT nama_lengkap, no_telepon FROM PELANGGAN WHERE id_pelanggan = %(id)s", {"id": body.id_pelanggan})
    plg = await cur.fetchone()
    if not plg: raise HTTPException(404, "Pelanggan tidak ditemukan.")

    durasi  = max((body.tanggal_selesai_rencana - body.tanggal_mulai).days, 1)
    b_sewa  = float(kend["harga_sewa_harian"]) * durasi
    b_supir = float(kend["harga_supir_harian"]) * durasi if body.gunakan_supir else 0.0
    total   = b_sewa + b_supir

    import random
    hari_ini = datetime.now().strftime("%Y%m%d")
    acak = str(random.randint(0, 9999)).zfill(4)
    nomor_booking = f"BKG-{hari_ini}-{acak}"

    tid = f"trx-{uuid.uuid4()}"
    await cur.execute(
        "INSERT INTO TRANSAKSI_SEWA (id_transaksi, nomor_booking, id_pelanggan, id_kendaraan, "
        "tanggal_mulai, tanggal_selesai_rencana, durasi_hari_rencana, "
        "gunakan_supir, biaya_sewa, biaya_supir, total_biaya, "
        "metode_pembayaran, catatan_kasir, status) "
        "VALUES (%(id)s, %(nb)s, %(pid)s, %(kid)s, %(tmu)s, %(tse)s, %(dur)s, %(sup)s, %(bs)s, %(bsu)s, %(tot)s, %(met)s, %(cat)s, 'MENUNGGU')",
        {"id": tid, "nb": nomor_booking, "pid": body.id_pelanggan, "kid": body.id_kendaraan,
         "tmu": body.tanggal_mulai, "tse": body.tanggal_selesai_rencana, "dur": durasi,
         "sup": body.gunakan_supir, "bs": b_sewa, "bsu": b_supir, "tot": total,
         "met": body.metode_pembayaran, "cat": body.catatan_kasir},
    )

    pesan = (
        f"✅ *Booking AeroRent Berhasil!*\n\nHalo {plg['nama_lengkap']},\n📋 No. Booking: *{nomor_booking}*\n"
        f"📅 {body.tanggal_mulai} s/d {body.tanggal_selesai_rencana} ({durasi} hari)\n💰 Total: Rp {total:,.0f}\n"
    )
    bt.add_task(fonnte_send, plg["no_telepon"], pesan)
    return {"message": "Pemesanan berhasil.", "id_transaksi": tid, "nomor_booking": nomor_booking, "total_biaya": total}


@app.put("/transaksi/{tid}/status", tags=["📋 Transaksi"])
async def update_status(tid: str, body: StatusUpd, bt: BackgroundTasks, user=Depends(req_kasir_or_owner), cur=Depends(get_db)):
    await cur.execute(
        "SELECT ts.status, ts.id_kendaraan, ts.tanggal_selesai_rencana, "
        "ts.biaya_sewa, ts.biaya_supir, k.harga_sewa_harian, "
        "p.no_telepon, p.nama_lengkap, ts.nomor_booking, ts.id_transaksi "
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

    await cur.execute(f"UPDATE TRANSAKSI_SEWA SET {', '.join(upd_sets)} WHERE id_transaksi = %(actual_id)s", upd_params)
    return {"message": f"Status berhasil diubah ke '{st_baru}'.", "nomor_booking": nb, "status_baru": st_baru}


@app.post("/transaksi/{tid}/foto-kondisi", tags=["📋 Transaksi"])
async def upload_foto_kondisi(
    tid:           str,
    jenis:         str         = Form(..., description="'sebelum' atau 'sesudah'"),
    file_depan:    UploadFile  = File(...),
    file_samping:  UploadFile  = File(...),
    file_belakang: UploadFile  = File(...),
    user=Depends(req_kasir_or_owner),
    cur=Depends(get_db),
):
    if jenis not in ("sebelum", "sesudah"): raise HTTPException(400, "Parameter 'jenis' harus 'sebelum' atau 'sesudah'.")

    b_d, b_s, b_b = (await file_depan.read(), await file_samping.read(), await file_belakang.read())
    pfx = f"trx_{tid[:8]}_{jenis}"

    url_d, url_s, url_b = await asyncio.gather(
        imgbb_upload(b_d, f"{pfx}_depan"),
        imgbb_upload(b_s, f"{pfx}_samping"),
        imgbb_upload(b_b, f"{pfx}_belakang"),
    )

    foto_json = json.dumps([
        {"posisi": "depan",    "url": url_d},
        {"posisi": "samping",  "url": url_s},
        {"posisi": "belakang", "url": url_b},
    ])
    kolom = "foto_kondisi_sebelum" if jenis == "sebelum" else "foto_kondisi_sesudah"

    await cur.execute(
        f"UPDATE TRANSAKSI_SEWA SET {kolom} = %(foto)s WHERE id_transaksi = %(id)s OR nomor_booking = %(nb)s",
        {"foto": foto_json, "id": tid, "nb": tid.upper()},
    )
    return {"message": f"3 foto kondisi '{jenis}' berhasil diupload.", "urls": {"depan": url_d, "samping": url_s, "belakang": url_b}}


@app.post("/transaksi/{tid}/midtrans-snap", tags=["📋 Transaksi"])
async def buat_snap(tid: str, cur=Depends(get_db)):
    await cur.execute(
        "SELECT ts.nomor_booking, ts.total_biaya, p.nama_lengkap, p.email "
        "FROM TRANSAKSI_SEWA ts JOIN PELANGGAN p ON ts.id_pelanggan = p.id_pelanggan "
        "WHERE (ts.id_transaksi = %(id)s OR ts.nomor_booking = %(nb)s) AND ts.status IN ('MENUNGGU','DIKONFIRMASI')",
        {"id": tid, "nb": tid.upper()},
    )
    r = await cur.fetchone()
    if not r: raise HTTPException(404, "Transaksi tidak ditemukan atau tidak dapat dibayar online.")

    result = await midtrans_snap(r["nomor_booking"], fmt_float(r["total_biaya"]), r["nama_lengkap"], r["email"] or "")
    await cur.execute(
        "UPDATE TRANSAKSI_SEWA SET midtrans_order_id = %(oid)s, midtrans_status = 'pending' "
        "WHERE id_transaksi = %(id)s OR nomor_booking = %(nb)s",
        {"oid": r["nomor_booking"], "id": tid, "nb": tid.upper()},
    )
    return {"snap_token": result.get("token"), "redirect_url": result.get("redirect_url"), "order_id": r["nomor_booking"]}


# ==============================================================================
# ROUTER: WEBHOOK MIDTRANS
# ==============================================================================
@app.post("/webhook/midtrans", tags=["🔔 Webhook"])
async def webhook_midtrans(request: Request, cur=Depends(get_db)):
    payload      = await request.json()
    order_id     = payload.get("order_id", "")
    trx_status   = payload.get("transaction_status", "")
    status_code  = payload.get("status_code", "")
    gross_amount = payload.get("gross_amount", "0.00")
    recv_sig     = payload.get("signature_key", "")

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
    await cur.execute(
        "UPDATE TRANSAKSI_SEWA "
        "SET midtrans_status = %(ms)s, midtrans_transaction_id = %(mti)s, status_pembayaran = %(sp)s "
        "WHERE midtrans_order_id = %(oid)s",
        {"ms": trx_status, "mti": payload.get("transaction_id"),
         "sp": STATUS_MAP.get(trx_status, "BELUM_LUNAS"), "oid": order_id},
    )
    log.info(f"[Midtrans Webhook] order={order_id}, status={trx_status}")
    return {"status": "OK"}


# ==============================================================================
# ROUTER: PENGELUARAN OPERASIONAL
# ==============================================================================
@app.get("/pengeluaran", tags=["💸 Pengeluaran"])
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


@app.post("/pengeluaran", status_code=201, tags=["💸 Pengeluaran"])
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


@app.delete("/pengeluaran/{pid}", tags=["💸 Pengeluaran"])
async def hapus_pengeluaran(pid: str, user=Depends(req_owner), cur=Depends(get_db)):
    await cur.execute("SELECT id_pengeluaran FROM PENGELUARAN_OPERASIONAL WHERE id_pengeluaran = %(id)s", {"id": pid})
    if not await cur.fetchone(): raise HTTPException(404, "Data pengeluaran tidak ditemukan.")
    
    await cur.execute("DELETE FROM PENGELUARAN_OPERASIONAL WHERE id_pengeluaran = %(id)s", {"id": pid})
    return {"message": "Pengeluaran berhasil dihapus."}


# ==============================================================================
# ROUTER: LAPORAN KEUANGAN (FR-08, FR-10)
# ==============================================================================
@app.get("/laporan/keuangan", tags=["📊 Laporan"])
async def laporan_keuangan(
    dari:   Optional[date] = None,
    sampai: Optional[date] = None,
    user=Depends(req_owner),
    cur=Depends(get_db),
):
    if not dari:   dari   = date.today().replace(day=1)
    if not sampai: sampai = date.today()
    p = {"d": dari, "s": sampai}

    await cur.execute(
        "SELECT COALESCE(SUM(total_biaya),0) AS total, COUNT(*) AS jml FROM TRANSAKSI_SEWA "
        "WHERE status = 'SELESAI' AND tanggal_mulai BETWEEN %(d)s AND %(s)s", p
    )
    pend_row = await cur.fetchone()

    await cur.execute(
        "SELECT COALESCE(SUM(jumlah),0) AS total FROM PENGELUARAN_OPERASIONAL "
        "WHERE tanggal_pengeluaran BETWEEN %(d)s AND %(s)s", p
    )
    peng_row = await cur.fetchone()

    await cur.execute(
        "SELECT kategori, COALESCE(SUM(jumlah),0) AS total FROM PENGELUARAN_OPERASIONAL "
        "WHERE tanggal_pengeluaran BETWEEN %(d)s AND %(s)s "
        "GROUP BY kategori ORDER BY total DESC", p
    )
    dist_peng = {r["kategori"]: fmt_float(r["total"]) for r in await cur.fetchall()}

    await cur.execute(
        "SELECT DATE_FORMAT(tanggal_mulai,'%Y-%m') AS bulan, SUM(total_biaya) AS pend "
        "FROM TRANSAKSI_SEWA WHERE status = 'SELESAI' "
        "AND tanggal_mulai BETWEEN DATE_SUB(%(s)s, INTERVAL 11 MONTH) AND %(s)s "
        "GROUP BY DATE_FORMAT(tanggal_mulai,'%Y-%m') ORDER BY bulan", p
    )
    tren = [{"bulan": r["bulan"], "pendapatan": float(r["pend"])} for r in await cur.fetchall()]

    await cur.execute(
        "SELECT k.nama_kendaraan, SUM(ts.total_biaya) AS total, COUNT(*) AS jml "
        "FROM TRANSAKSI_SEWA ts JOIN KENDARAAN k ON ts.id_kendaraan = k.id_kendaraan "
        "WHERE ts.status = 'SELESAI' AND ts.tanggal_mulai BETWEEN %(d)s AND %(s)s "
        "GROUP BY k.nama_kendaraan ORDER BY total DESC LIMIT 5", p
    )
    top_kend = [{"nama": r["nama_kendaraan"], "total": float(r["total"]), "jumlah_sewa": r["jml"]} for r in await cur.fetchall()]

    await cur.execute(
        "SELECT status, COUNT(*) AS jml FROM TRANSAKSI_SEWA "
        "WHERE tanggal_mulai BETWEEN %(d)s AND %(s)s GROUP BY status", p
    )
    dist_status = {r["status"]: r["jml"] for r in await cur.fetchall()}

    tp, tpe = float(pend_row["total"]), float(peng_row["total"])
    return {
        "periode": {"dari": dari.isoformat(), "sampai": sampai.isoformat()},
        "ringkasan": {
            "total_pendapatan_kotor":  tp,
            "total_biaya_operasional": tpe,
            "profit_bersih":           tp - tpe,
            "margin_persen":           round((tp - tpe) / tp * 100, 2) if tp > 0 else 0,
            "jumlah_transaksi_selesai": int(pend_row["jml"]),
        },
        "tren_bulanan":                tren,
        "distribusi_status":           dist_status,
        "distribusi_pengeluaran":      dist_peng,
        "top_5_kendaraan":             top_kend,
    }

@app.get("/laporan/armada", tags=["📊 Laporan"])
async def laporan_armada(user=Depends(req_owner), cur=Depends(get_db)):
    """Statistik performa & utilisasi armada bulan berjalan."""
    await cur.execute("SELECT status, COUNT(*) AS total FROM KENDARAAN GROUP BY status")
    status_armada = {r["status"]: r["total"] for r in await cur.fetchall()}

    # Dialek MySQL menggunakan DATE_FORMAT atau fungsi bulan
    await cur.execute(
        "SELECT k.id_kendaraan AS id, k.nama_kendaraan AS nama, k.tipe_kendaraan AS tipe, k.status, "
        "k.foto_url AS foto, k.harga_sewa_harian AS harga_harian, "
        "COUNT(ts.id_transaksi) AS sewa_bulan_ini, COALESCE(SUM(ts.total_biaya),0) AS pendapatan_bulan_ini "
        "FROM KENDARAAN k "
        "LEFT JOIN TRANSAKSI_SEWA ts ON k.id_kendaraan = ts.id_kendaraan "
        "AND ts.status = 'SELESAI' AND DATE_FORMAT(ts.tanggal_mulai, '%Y-%m') = DATE_FORMAT(CURRENT_DATE, '%Y-%m') "
        "GROUP BY k.id_kendaraan, k.nama_kendaraan, k.tipe_kendaraan, "
        "k.status, k.foto_url, k.harga_sewa_harian "
        "ORDER BY sewa_bulan_ini DESC, pendapatan_bulan_ini DESC"
    )
    
    armada = await cur.fetchall()
    for a in armada:
        a["harga_harian"] = fmt_float(a["harga_harian"])
        a["pendapatan_bulan_ini"] = fmt_float(a["pendapatan_bulan_ini"])
        
    return {"status_armada": status_armada, "total_unit": sum(status_armada.values()),
            "armada_detail": armada}


# ==============================================================================
# ENTRY POINT
# ==============================================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host      = "0.0.0.0",
        port      = 8000,
        reload    = cfg.APP_DEBUG,
        log_level = "debug" if cfg.APP_DEBUG else "info",
    )