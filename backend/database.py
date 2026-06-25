import aiomysql
from typing import AsyncGenerator, Optional
from fastapi import Request
from config import cfg, log

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

