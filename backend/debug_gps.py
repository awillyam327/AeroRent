import urllib.request
import urllib.parse
import json

BASE_URL = "http://127.0.0.1:8000"

# 1. Login
data = urllib.parse.urlencode({"username": "owner@aerorent.id", "password": "OwnerAeroRent2026"}).encode()
req = urllib.request.Request(f"{BASE_URL}/auth/login", data=data)
with urllib.request.urlopen(req) as response:
    token = json.loads(response.read().decode())["access_token"]

# 2. Test GPS endpoint for Pajero
req = urllib.request.Request(f"{BASE_URL}/kendaraan/kend-005/gps")
req.add_header("Authorization", f"Bearer {token}")
try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Response:", response.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Response:", e.read().decode())
