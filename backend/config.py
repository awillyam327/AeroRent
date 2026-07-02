import os
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()
class Settings(BaseSettings):
    # ✅ DIPERBAIKI: DB_NAME sebelumnya diisi password secara tidak sengaja
    DB_HOST:     str = "gateway01.ap-southeast-1.prod.aws.tidbcloud.com"
    DB_PORT:     int = 4000
    DB_USER:     str = "2QN6TiyQC2GrnuN.root"
    DB_PASSWORD: str = "NwUQIsMUGSVQ2Whj"
    DB_NAME:     str = "aerorent"           # ← PERBAIKAN: was "NwUQIsMUGSVQ2Whj"

    JWT_SECRET:         str   = "GANTI_DENGAN_STRING_PANJANG_DAN_ACAK_DI_PRODUCTION"
    JWT_ALGORITHM:      str   = "HS256"
    ACCESS_EXPIRE_MIN:  int   = 60
    REFRESH_EXPIRE_DAYS:int   = 7

    IMGBB_API_KEY:      str   = ""
    OCR_SPACE_API_KEY:  str   = "helloworld"
    MIDTRANS_SERVER_KEY:str   = ""
    MIDTRANS_CLIENT_KEY:str   = ""
    MIDTRANS_IS_PROD:   bool  = False
    FONNTE_TOKEN:       str   = ""
    TRACCAR_BASE_URL:   str   = "https://demo.traccar.org"
    TRACCAR_USER:       str   = "awillyam327@gmail.com"
    TRACCAR_PASSWORD:   str   = "arthurgaming123"
    SMTP_HOST:          str   = "smtp.gmail.com"
    SMTP_PORT:          int   = 587
    SMTP_USER:          str   = ""
    SMTP_PASSWORD:      str   = ""
    SMTP_FROM:          str   = "noreply@aerorent.id"
    FRONTEND_URL:       str   = "http://localhost:5500"
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

