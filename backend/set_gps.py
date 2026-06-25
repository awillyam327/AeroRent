import urllib.request
import urllib.parse
import json

BASE_URL = "http://127.0.0.1:8000"

# 1. Login
data = urllib.parse.urlencode({"username": "owner@aerorent.id", "password": "OwnerAeroRent2026"}).encode()
req = urllib.request.Request(f"{BASE_URL}/auth/login", data=data)
with urllib.request.urlopen(req) as response:
    token = json.loads(response.read().decode())["access_token"]

# 2. Get Kendaraan List
req = urllib.request.Request(f"{BASE_URL}/kendaraan")
req.add_header("Authorization", f"Bearer {token}")
with urllib.request.urlopen(req) as response:
    kendaraan_list = json.loads(response.read().decode())

# 3. Find Pajero and Update
for k in kendaraan_list:
    if "Pajero".lower() in k.get("nama_kendaraan", "").lower():
        kid = k["id_kendaraan"]
        print(f"Pajero ditemukan dengan ID: {kid}")
        
        # PUT Request
        put_data = json.dumps({"traccar_device_id": "65471"}).encode()
        req_put = urllib.request.Request(f"{BASE_URL}/kendaraan/{kid}", data=put_data, method="PUT")
        req_put.add_header("Authorization", f"Bearer {token}")
        req_put.add_header("Content-Type", "application/json")
        
        with urllib.request.urlopen(req_put) as res_put:
            print(f"Status Update: {res_put.status}")
            print("✅ BERHASIL! Traccar Device ID untuk Pajero sekarang adalah 65471")
        break
