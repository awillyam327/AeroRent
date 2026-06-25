import os

# --- 1. config.py ---
with open('config.py', 'w', encoding='utf-8') as f:
    f.write('''import os
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    DB_HOST:     str = "gateway01.ap-southeast-1.prod.aws.tidbcloud.com"
    DB_PORT:     int = 4000
    DB_USER:     str = "2QN6TiyQC2GrnuN.root"
    DB_PASSWORD: str = "NwUQIsMUGSVQ2Whj"
    DB_NAME:     str = "aerorent"

    JWT_SECRET:         str   = "GANTI_DENGAN_STRING_PANJANG_DAN_ACAK_DI_PRODUCTION"
    JWT_ALGORITHM:      str   = "HS256"
    ACCESS_EXPIRE_MIN:  int   = 60
    REFRESH_EXPIRE_DAYS:int   = 7

    IMGBB_API_KEY:      str   = ""
    MIDTRANS_SERVER_KEY:str   = ""
    MIDTRANS_CLIENT_KEY:str   = ""
    MIDTRANS_IS_PROD:   bool  = False
    FONNTE_TOKEN:       str   = ""
    TRACCAR_BASE_URL:   str   = "http://localhost:8082"
    TRACCAR_USER:       str   = "admin"
    TRACCAR_PASSWORD:   str   = "admin"
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

if cfg.JWT_SECRET == "GANTI_DENGAN_STRING_PANJANG_DAN_ACAK_DI_PRODUCTION":
    log.warning("⚠️  JWT_SECRET masih menggunakan nilai default! Ganti di .env untuk production.")
''')

# --- 2. database.py ---
with open('database.py', 'w', encoding='utf-8') as f:
    f.write('''import aiomysql
from typing import AsyncGenerator
from fastapi import Request
from config import cfg, log

_pool = None

async def init_pool() -> None:
    global _pool
    _pool = await aiomysql.create_pool(
        host=cfg.DB_HOST,
        port=cfg.DB_PORT,
        user=cfg.DB_USER,
        password=cfg.DB_PASSWORD,
        db=cfg.DB_NAME,
        autocommit=True,
        pool_recycle=3600,
        ssl={"fake_flag_to_enable_tls": True}
    )
    log.info("✅ Database Pool (TiDB Cloud) berhasil dibuat!")

async def close_pool() -> None:
    global _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        log.info("❌ Database Pool ditutup.")

async def get_db() -> AsyncGenerator[aiomysql.DictCursor, None]:
    if not _pool:
        raise Exception("Database pool belum diinisialisasi.")
    async with _pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            yield cur
''')

# --- 3. models.py ---
with open('main.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

def get_block(start_marker, end_marker=None):
    start_idx = -1
    for i, l in enumerate(lines):
        if start_marker in l:
            start_idx = i
            break
    if start_idx == -1: return ""
    
    end_idx = len(lines)
    if end_marker:
        for i in range(start_idx + 1, len(lines)):
            if end_marker in lines[i]:
                end_idx = i
                break
    return "".join(lines[start_idx:end_idx])

models_block = get_block("# PYDANTIC MODELS (Request / Response)", "# INTEGRASI API EKSTERNAL")
with open('models.py', 'w', encoding='utf-8') as f:
    f.write('''from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date

''' + models_block.strip() + '\n')

# --- 4. utils.py ---
utils_block = get_block("# INTEGRASI API EKSTERNAL", "# ==============================================================================\n# ROUTER: AUTENTIKASI")
with open('utils.py', 'w', encoding='utf-8') as f:
    f.write('''import httpx
import json
import base64
import os
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import HTTPException
from config import cfg, log

''' + utils_block.strip() + '\n')

# --- 5. dependencies.py ---
deps_block = get_block("# KEAMANAN: JWT + bcrypt", "# PYDANTIC MODELS (Request / Response)")
with open('dependencies.py', 'w', encoding='utf-8') as f:
    f.write('''from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import aiomysql
from database import get_db
from config import cfg

''' + deps_block.strip() + '\n')

# --- 6. Routers ---
os.makedirs('routers', exist_ok=True)

auth_block = get_block("# ROUTER: AUTENTIKASI", "# ROUTER: KARYAWAN")
with open('routers/auth.py', 'w', encoding='utf-8') as f:
    f.write('''from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
import aiomysql
from database import get_db
from config import cfg
from dependencies import verify_pwd, make_token, get_current_user
from models import TokenPair
import uuid

router = APIRouter(prefix="/auth", tags=["Auth"])
''' + auth_block.replace('router = APIRouter(prefix="/auth", tags=["Auth"])', '').strip() + '\n')

karyawan_block = get_block("# ROUTER: KARYAWAN", "# ROUTER: KENDARAAN")
with open('routers/karyawan.py', 'w', encoding='utf-8') as f:
    f.write('''from fastapi import APIRouter, Depends, HTTPException
import aiomysql
from database import get_db
from dependencies import req_owner, hash_pwd
from models import KaryawanIn, KaryawanUpd
import uuid

router = APIRouter(prefix="/karyawan", tags=["Karyawan"])
''' + karyawan_block.replace('router = APIRouter(prefix="/karyawan", tags=["Karyawan"])', '').strip() + '\n')

kendaraan_block = get_block("# ROUTER: KENDARAAN", "# ROUTER: PELANGGAN")
with open('routers/kendaraan.py', 'w', encoding='utf-8') as f:
    f.write('''from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner, req_owner, get_current_user
from models import KendaraanIn, KendaraanUpd
from utils import imgbb_upload
import uuid

router = APIRouter(prefix="/kendaraan", tags=["Kendaraan"])
''' + kendaraan_block.replace('router = APIRouter(prefix="/kendaraan", tags=["Kendaraan"])', '').strip() + '\n')

pelanggan_block = get_block("# ROUTER: PELANGGAN", "# ROUTER: TRANSAKSI SEWA")
with open('routers/pelanggan.py', 'w', encoding='utf-8') as f:
    f.write('''from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner
from models import PelangganIn
from utils import imgbb_upload
import uuid

router = APIRouter(prefix="/pelanggan", tags=["Pelanggan"])
''' + pelanggan_block.replace('router = APIRouter(prefix="/pelanggan", tags=["Pelanggan"])', '').strip() + '\n')

transaksi_block = get_block("# ROUTER: TRANSAKSI SEWA", "# ROUTER: WEBHOOK MIDTRANS")
with open('routers/transaksi.py', 'w', encoding='utf-8') as f:
    f.write('''from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import aiomysql
from datetime import date
from database import get_db
from dependencies import req_kasir_or_owner, req_owner
from models import TransaksiIn, StatusUpd
from utils import send_wa_notification, imgbb_upload
import uuid

router = APIRouter(prefix="/transaksi", tags=["Transaksi"])
''' + transaksi_block.replace('router = APIRouter(prefix="/transaksi", tags=["Transaksi"])', '').strip() + '\n')

pengeluaran_block = get_block("# ROUTER: PENGELUARAN OPERASIONAL", "# ROUTER: LAPORAN KEUANGAN")
with open('routers/pengeluaran.py', 'w', encoding='utf-8') as f:
    f.write('''from fastapi import APIRouter, Depends, HTTPException, Form
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner, req_owner
import uuid
from datetime import date

router = APIRouter(prefix="/pengeluaran", tags=["Pengeluaran"])
''' + pengeluaran_block.replace('router = APIRouter(prefix="/pengeluaran", tags=["Pengeluaran"])', '').strip() + '\n')

laporan_block = get_block("# ROUTER: LAPORAN KEUANGAN", "# ==============================================================================\n# BACKGROUND TASKS")
with open('routers/laporan.py', 'w', encoding='utf-8') as f:
    f.write('''from fastapi import APIRouter, Depends
import aiomysql
from datetime import date
from database import get_db
from dependencies import req_kasir_or_owner

router = APIRouter(prefix="/laporan", tags=["Laporan"])
''' + laporan_block.replace('router = APIRouter(prefix="/laporan", tags=["Laporan"])', '').strip() + '\n')

# --- 7. Tulis ulang main.py ---
bg_tasks_block = get_block("# BACKGROUND TASKS")
with open('main_new.py', 'w', encoding='utf-8') as f:
    f.write('''from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import init_pool, close_pool
from utils import sync_traccar_devices
from config import cfg, log
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Import Routers
from routers import auth, karyawan, kendaraan, pelanggan, transaksi, pengeluaran, laporan

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_pool()
    scheduler = AsyncIOScheduler()
    scheduler.add_job(sync_traccar_devices, 'interval', minutes=5)
    scheduler.start()
    log.info("🚀 Scheduler & DB Started")
    yield
    # Shutdown
    scheduler.shutdown()
    await close_pool()

app = FastAPI(title="AeroRent API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(karyawan.router)
app.include_router(kendaraan.router)
app.include_router(pelanggan.router)
app.include_router(transaksi.router)
app.include_router(pengeluaran.router)
app.include_router(laporan.router)

''' + bg_tasks_block.replace('app = FastAPI(title="AeroRent API", version="1.0.0", lifespan=lifespan)', '').replace('app.add_middleware(', '# app.add_middleware(').replace('CORSMiddleware,', '#').replace('allow_origins=["*"],', '#').replace('allow_credentials=True,', '#').replace('allow_methods=["*"],', '#').replace('allow_headers=["*"],', '#').replace(')', '#').strip() + '\n')

print("Refactoring backend generated successfully.")
