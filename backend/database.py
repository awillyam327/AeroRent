import aiomysql
from typing import AsyncGenerator, Optional
from fastapi import Request
from config import cfg, log

_pool: Optional[aiomysql.Pool] = None


async def init_pool() -> None:
    global _pool
    try:
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
    except Exception as e:
        log.critical(f"❌ GAGAL membuat koneksi pool ke database: {e}")
        raise  # Biarkan aplikasi gagal start agar masalah terdeteksi


async def close_pool() -> None:
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        log.info("🛑 TiDB pool ditutup.")

async def get_db():
    """FastAPI Dependency: Pinjamkan langsung DictCursor ke setiap endpoint."""
    if _pool is None:
        raise Exception("Database pool belum diinisialisasi. Pastikan init_pool() sudah dipanggil.")
    async with _pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            yield cur


async def get_db_transaction():
    """
    FastAPI Dependency: Berikan koneksi dengan autocommit=False untuk
    operasi multi-statement yang membutuhkan atomicity (commit/rollback).
    
    Penggunaan di router:
        conn, cur = Depends(get_db_transaction)
    
    Jika semua berhasil, conn.commit() harus dipanggil secara eksplisit.
    Jika terjadi error, conn.rollback() dipanggil otomatis di finally.
    """
    if _pool is None:
        raise Exception("Database pool belum diinisialisasi.")
    async with _pool.acquire() as conn:
        await conn.autocommit(False)
        async with conn.cursor(aiomysql.DictCursor) as cur:
            try:
                yield conn, cur
            except Exception:
                await conn.rollback()
                raise
            finally:
                # Kembalikan autocommit ke True agar koneksi normal saat dikembalikan ke pool
                await conn.autocommit(True)
