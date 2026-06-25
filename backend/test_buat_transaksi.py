import asyncio
import httpx
from datetime import date, timedelta

async def main():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        # Login
        resp = await client.post("/auth/login", data={"username": "kasir@aerorent.id", "password": "KasirAeroRent2026"})
        token = resp.json().get("access_token")
        if not token:
            print("Login failed")
            return
            
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get a customer ID
        r = await client.get("/pelanggan", headers=headers)
        pelanggan = r.json()
        if not pelanggan:
            print("No pelanggan")
            return
        p_id = pelanggan[0]["id"]
        
        # Get a vehicle ID
        r = await client.get("/kendaraan", headers=headers)
        kendaraan = r.json()
        k_id = None
        for k in kendaraan:
            if k["status"] == "TERSEDIA":
                k_id = k["id_kendaraan"]
                break
        if not k_id:
            print("No TERSEDIA kendaraan")
            return
        
        # Make transaction
        payload = {
            "id_pelanggan": p_id,
            "id_kendaraan": k_id,
            "tanggal_mulai": date.today().isoformat(),
            "tanggal_selesai_rencana": (date.today() + timedelta(days=1)).isoformat(),
            "gunakan_supir": 0,
            "metode_pembayaran": "CASH"
        }
        
        r = await client.post("/transaksi", json=payload, headers=headers)
        print(r.status_code, r.text)

if __name__ == "__main__":
    asyncio.run(main())
