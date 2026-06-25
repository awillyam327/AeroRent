import asyncio
import httpx
from config import cfg

async def main():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        # 1. Login to get token
        resp = await client.post("/auth/login", data={"username": "kasir@aerorent.id", "password": "KasirAeroRent2026"})
        if resp.status_code != 200:
            print(f"Login failed: {resp.status_code} {resp.text}")
            return
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 2. Test endpoints
        endpoints = [
            "/karyawan",
            "/kendaraan",
            "/pelanggan",
            "/transaksi",
            "/pengeluaran",
            "/laporan/keuangan",
            "/laporan/armada"
        ]
        for ep in endpoints:
            r = await client.get(ep, headers=headers)
            print(f"GET {ep} -> {r.status_code}")
            if r.status_code == 500:
                print(f"ERROR on {ep}: {r.text}")

if __name__ == "__main__":
    asyncio.run(main())
