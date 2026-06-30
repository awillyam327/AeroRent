import asyncio
import os
from config import cfg, log
import database

async def clear_transaksi():
    await database.init_pool()
    try:
        async with database._pool.acquire() as conn:
            async with conn.cursor() as cur:
                print("Menghapus data dari TRANSAKSI_SEWA...")
                await cur.execute("DELETE FROM TRANSAKSI_SEWA")
                print("Mengembalikan status semua kendaraan menjadi TERSEDIA...")
                await cur.execute("UPDATE KENDARAAN SET status = 'TERSEDIA'")
                await conn.commit()
                print("Berhasil membersihkan transaksi dan mereset status kendaraan.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await database.close_pool()

if __name__ == "__main__":
    import sys
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(clear_transaksi())
