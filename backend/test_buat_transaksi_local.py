from fastapi.testclient import TestClient
from main import app
from datetime import date, timedelta
import asyncio

client = TestClient(app)

def test_transaksi():
    with TestClient(app) as client:
        # Login
        resp = client.post("/auth/login", data={"username": "kasir@aerorent.id", "password": "KasirAeroRent2026"})
        token = resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get pelanggan
        r = client.get("/pelanggan", headers=headers)
    p_id = r.json()[0]["id"]
    
    # Get kendaraan
    r = client.get("/kendaraan", headers=headers)
    k_id = next(k["id_kendaraan"] for k in r.json() if k["status"] == "TERSEDIA")
    
    payload = {
        "id_pelanggan": p_id,
        "id_kendaraan": k_id,
        "tanggal_mulai": date.today().isoformat(),
        "tanggal_selesai_rencana": (date.today() + timedelta(days=1)).isoformat(),
        "gunakan_supir": 0,
        "metode_pembayaran": "CASH"
    }
    
    r = client.post("/transaksi", json=payload, headers=headers)
    print(r.status_code)
    print(r.text)

if __name__ == "__main__":
    test_transaksi()
