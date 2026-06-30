import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import init_pool, close_pool
from utils import job_reminder_pengembalian
from config import cfg, log
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Import Routers
from routers import auth, karyawan, kendaraan, pelanggan, transaksi, midtrans, pengeluaran, laporan, ocr

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_pool()
    scheduler = AsyncIOScheduler()
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

@app.get("/", tags=["Health"])
async def root():
    return {"message": "AeroRent API is running successfully on Vercel! 🚀", "status": "active"}

@app.get("/config/midtrans", tags=["Config"])
async def get_midtrans_config():
    return {"client_key": cfg.MIDTRANS_CLIENT_KEY}

app.include_router(auth.router)
app.include_router(karyawan.router)
app.include_router(kendaraan.router)
app.include_router(pelanggan.router)
app.include_router(transaksi.router)
app.include_router(midtrans.router)
app.include_router(pengeluaran.router)
app.include_router(laporan.router)
app.include_router(ocr.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host      = "0.0.0.0",
        port      = 8000,
        reload    = cfg.APP_DEBUG,
        log_level = "debug" if cfg.APP_DEBUG else "info",
    )
