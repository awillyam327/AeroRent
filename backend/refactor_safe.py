import os

def write_file(filename, content):
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

with open('main.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# L: List of lines 0-indexed
def get_lines(start_idx, end_idx):
    # start_idx and end_idx are 1-indexed line numbers
    return "".join(lines[start_idx-1:end_idx])

# --- CONFIG ---
config_content = """import os
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()
""" + get_lines(47, 88)
write_file('config.py', config_content)

# --- DATABASE ---
db_content = """import aiomysql
from typing import AsyncGenerator
from fastapi import Request
from config import cfg, log

""" + get_lines(92, 121)
write_file('database.py', db_content)

# --- MODELS ---
models_content = """from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date

""" + get_lines(201, 305)
write_file('models.py', models_content)

# --- DEPENDENCIES ---
deps_content = """from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timezone, timedelta
import jwt
import aiomysql
from database import get_db
from config import cfg

""" + get_lines(126, 196)
write_file('dependencies.py', deps_content)

# --- UTILS ---
utils_content = """import httpx
import json
import base64
import os
import aiosmtplib
import aiomysql
from typing import Optional
from contextlib import asynccontextmanager
from database import get_db
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import HTTPException, BackgroundTasks
from config import cfg, log

""" + get_lines(311, 569)
write_file('utils.py', utils_content)

# --- ROUTERS ---
os.makedirs('routers', exist_ok=True)

auth_content = """from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
import aiomysql
from database import get_db
from config import cfg
from dependencies import verify_pwd, make_token, get_current_user
from models import TokenPair
import uuid

router = APIRouter(prefix="/auth", tags=["Auth"])
""" + get_lines(574, 634).replace('@app.', '@router.').replace('/auth', '')
write_file('routers/auth.py', auth_content)

karyawan_content = """from fastapi import APIRouter, Depends, HTTPException
import aiomysql
from database import get_db
from dependencies import req_owner, hash_pwd
from models import KaryawanIn, KaryawanUpd
import uuid

router = APIRouter(prefix="/karyawan", tags=["Karyawan"])
""" + get_lines(638, 698).replace('@app.', '@router.').replace('/karyawan', '')
write_file('routers/karyawan.py', karyawan_content)

kendaraan_content = """from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner, req_owner, get_current_user
from models import KendaraanIn, KendaraanUpd
from utils import imgbb_upload
import uuid

router = APIRouter(prefix="/kendaraan", tags=["Kendaraan"])
""" + get_lines(702, 820).replace('@app.', '@router.').replace('/kendaraan', '')
write_file('routers/kendaraan.py', kendaraan_content)

pelanggan_content = """from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner
from models import PelangganIn
from utils import imgbb_upload
import uuid

router = APIRouter(prefix="/pelanggan", tags=["Pelanggan"])
""" + get_lines(824, 890).replace('@app.', '@router.').replace('/pelanggan', '')
write_file('routers/pelanggan.py', pelanggan_content)

transaksi_content = """from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
import aiomysql
from datetime import date
from database import get_db
from dependencies import req_kasir_or_owner, req_owner
from models import TransaksiIn, StatusUpd
from utils import send_wa_notification, imgbb_upload
import uuid

router = APIRouter(prefix="/transaksi", tags=["Transaksi"])
""" + get_lines(894, 1149).replace('@app.', '@router.').replace('/transaksi', '')
write_file('routers/transaksi.py', transaksi_content)

midtrans_content = """from fastapi import APIRouter, Depends, HTTPException, Request
import aiomysql
import hashlib
from database import get_db
from config import cfg, log

router = APIRouter(prefix="/webhook", tags=["Webhook"])
""" + get_lines(1153, 1183).replace('@app.', '@router.').replace('/webhook', '')
write_file('routers/midtrans.py', midtrans_content)

pengeluaran_content = """from fastapi import APIRouter, Depends, HTTPException, Form
import aiomysql
from database import get_db
from dependencies import req_kasir_or_owner, req_owner
import uuid
from datetime import date

router = APIRouter(prefix="/pengeluaran", tags=["Pengeluaran"])
""" + get_lines(1187, 1254).replace('@app.', '@router.').replace('/pengeluaran', '')
write_file('routers/pengeluaran.py', pengeluaran_content)

laporan_content = """from fastapi import APIRouter, Depends
import aiomysql
from datetime import date
from database import get_db
from dependencies import req_kasir_or_owner

router = APIRouter(prefix="/laporan", tags=["Laporan"])
""" + get_lines(1258, 1353).replace('@app.', '@router.').replace('/laporan', '')
write_file('routers/laporan.py', laporan_content)

# --- MAIN NEW ---
main_new_content = """import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import init_pool, close_pool
from utils import sync_traccar_devices, job_reminder_pengembalian
from config import cfg, log
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Import Routers
from routers import auth, karyawan, kendaraan, pelanggan, transaksi, midtrans, pengeluaran, laporan

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_pool()
    scheduler = AsyncIOScheduler()
    scheduler.add_job(sync_traccar_devices, 'interval', minutes=5)
    scheduler.add_job(job_reminder_pengembalian, "cron", hour=9, minute=0, id="reminder_wa")
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
app.include_router(midtrans.router)
app.include_router(pengeluaran.router)
app.include_router(laporan.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main_new:app",
        host      = "0.0.0.0",
        port      = 8000,
        reload    = cfg.APP_DEBUG,
        log_level = "debug" if cfg.APP_DEBUG else "info",
    )
"""
write_file('main_new.py', main_new_content)
print("Refactoring via line index generated successfully.")
