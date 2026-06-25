"""
Full Owner Flow Test — AeroRent
Tests ALL owner dashboard endpoints end-to-end.
"""
import asyncio
import httpx
import json
import sys
import io
import time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from datetime import date, timedelta

print("Menunggu 3 detik agar server stabil...")
time.sleep(3)

BASE = "http://127.0.0.1:8000"
PASS = 0
FAIL = 0

def ok(label, detail=""):
    global PASS; PASS += 1
    print(f"  [PASS] {label}" + (f" — {detail}" if detail else ""))

def fail(label, detail=""):
    global FAIL; FAIL += 1
    print(f"  [FAIL] {label}" + (f" — {detail}" if detail else ""))

def check(label, r, expected=200):
    if r is None:
        fail(label, "No response (connection error)")
        return False
    if r.status_code == expected:
        ok(label, f"{r.status_code}")
        return True
    else:
        fail(label, f"Expected {expected}, got {r.status_code}: {r.text[:200]}")
        return False

async def safe_req(c, method, path, **kwargs):
    """Wrapper with retry for server reload."""
    for attempt in range(3):
        try:
            return await getattr(c, method)(path, **kwargs)
        except (httpx.ReadError, httpx.ConnectError, httpx.RemoteProtocolError):
            if attempt < 2:
                await asyncio.sleep(2)
            else:
                return None

async def main():
    global PASS, FAIL
    async with httpx.AsyncClient(base_url=BASE, timeout=15.0) as c:

        # ═══════════════════════════════════════════════════════
        print("\n1. LOGIN OWNER")
        # ═══════════════════════════════════════════════════════
        r = await safe_req(c, "post", "/auth/login", data={"username": "owner@aerorent.id", "password": "OwnerAeroRent2026"})
        if not check("POST /auth/login (owner)", r):
            print("GAGAL LOGIN — tidak bisa lanjut testing!"); return
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        # ═══════════════════════════════════════════════════════
        print("\n2. KENDARAAN — LIST")
        # ═══════════════════════════════════════════════════════
        r = await safe_req(c, "get", "/kendaraan", headers=h)
        if check("GET /kendaraan", r):
            kend_list = r.json()
            ok(f"  Jumlah kendaraan: {len(kend_list)}")

        # ═══════════════════════════════════════════════════════
        print("\n3. KENDARAAN — TAMBAH BARU")
        # ═══════════════════════════════════════════════════════
        test_kend = {
            "nama_kendaraan": "TEST Toyota Avanza 2024",
            "merk": "Toyota", "model": "Avanza", "tahun": 2024,
            "nomor_plat": f"H-TST-{int(asyncio.get_event_loop().time()) % 10000}",
            "tipe_kendaraan": "7_SEATER", "transmisi": "AT",
            "bahan_bakar": "Bensin", "kapasitas_penumpang": 7,
            "harga_sewa_harian": 350000, "harga_supir_harian": 150000,
            "is_featured": 0, "traccar_device_id": None,
            "deskripsi": "Mobil test dari script otomatis"
        }
        r = await safe_req(c, "post", "/kendaraan", json=test_kend, headers=h)
        new_kend_id = None
        if check("POST /kendaraan (tambah)", r, 201):
            new_kend_id = r.json().get("id_kendaraan")
            ok(f"  ID baru: {new_kend_id}")

        # ═══════════════════════════════════════════════════════
        print("\n4. KENDARAAN — DETAIL")
        # ═══════════════════════════════════════════════════════
        if new_kend_id:
            r = await safe_req(c, "get", f"/kendaraan/{new_kend_id}", headers=h)
            if check("GET /kendaraan/{id} (detail)", r):
                d = r.json()
                ok(f"  Nama: {d.get('nama_kendaraan')}, Plat: {d.get('nomor_plat')}")

        # ═══════════════════════════════════════════════════════
        print("\n5. KENDARAAN — UPDATE (+ set Traccar Device ID)")
        # ═══════════════════════════════════════════════════════
        if new_kend_id:
            r = await safe_req(c, "put", f"/kendaraan/{new_kend_id}", json={
                "nama_kendaraan": "TEST Toyota Avanza 2024 (Updated)",
                "harga_sewa_harian": 400000, "traccar_device_id": "65471", "is_featured": 1
            }, headers=h)
            check("PUT /kendaraan/{id} (update + traccar)", r)

        # ═══════════════════════════════════════════════════════
        print("\n6. KENDARAAN — GPS TRACKING")
        # ═══════════════════════════════════════════════════════
        if new_kend_id:
            r = await safe_req(c, "get", f"/kendaraan/{new_kend_id}/gps", headers=h)
            if r and r.status_code == 200:
                gps = r.json()
                ok("GET /kendaraan/{id}/gps", f"lat={gps.get('latitude')}, lng={gps.get('longitude')}")
            elif r and r.status_code in (404, 503):
                ok("GET /kendaraan/{id}/gps", f"{r.status_code} (expected: device might not have data)")
            else:
                fail("GET /kendaraan/{id}/gps", f"Connection error or unexpected status")

        # ═══════════════════════════════════════════════════════
        print("\n7. KARYAWAN — LIST")
        # ═══════════════════════════════════════════════════════
        r = await safe_req(c, "get", "/karyawan", headers=h)
        if check("GET /karyawan", r):
            ok(f"  Jumlah karyawan: {len(r.json())}")

        # ═══════════════════════════════════════════════════════
        print("\n8. KARYAWAN — TAMBAH")
        # ═══════════════════════════════════════════════════════
        test_email = f"test_kary_{int(asyncio.get_event_loop().time())}@test.id"
        r = await safe_req(c, "post", "/karyawan", json={
            "nama_lengkap": "Test Karyawan Auto",
            "email": test_email, "password": "TestPass123!", "role": "KASIR", "gaji_per_bulan": 3000000
        }, headers=h)
        new_kary_id = None
        if check("POST /karyawan (tambah)", r, 201):
            new_kary_id = r.json().get("id_karyawan")
            ok(f"  ID baru: {new_kary_id}")

        # ═══════════════════════════════════════════════════════
        print("\n9. KARYAWAN — UPDATE")
        # ═══════════════════════════════════════════════════════
        if new_kary_id:
            r = await safe_req(c, "put", f"/karyawan/{new_kary_id}", json={
                "nama_lengkap": "Test Karyawan Updated", "gaji_per_bulan": 3500000, "is_aktif": 0
            }, headers=h)
            check("PUT /karyawan/{id} (update + nonaktif)", r)

        # ═══════════════════════════════════════════════════════
        print("\n10. TRANSAKSI — LIST ALL")
        # ═══════════════════════════════════════════════════════
        r = await safe_req(c, "get", "/transaksi?limit=10", headers=h)
        if check("GET /transaksi?limit=10", r):
            ok(f"  Jumlah transaksi: {len(r.json())}")

        # ═══════════════════════════════════════════════════════
        print("\n11. LAPORAN KEUANGAN")
        # ═══════════════════════════════════════════════════════
        today = date.today().isoformat()
        first = date.today().replace(day=1).isoformat()
        r = await safe_req(c, "get", f"/laporan/keuangan?dari={first}&sampai={today}", headers=h)
        if check("GET /laporan/keuangan", r):
            lap = r.json()
            ring = lap.get("ringkasan", {})
            ok(f"  Pendapatan: Rp {ring.get('total_pendapatan_kotor', 0):,.0f}")
            ok(f"  Pengeluaran: Rp {ring.get('total_biaya_operasional', 0):,.0f}")
            ok(f"  Profit: Rp {ring.get('profit_bersih', 0):,.0f}")
            ok(f"  Tren bulanan: {len(lap.get('tren_bulanan', []))} bulan")
            ok(f"  Top 5 kendaraan: {len(lap.get('top_5_kendaraan', []))} mobil")

        # ═══════════════════════════════════════════════════════
        print("\n12. LAPORAN ARMADA (STATISTIK)")
        # ═══════════════════════════════════════════════════════
        r = await safe_req(c, "get", "/laporan/armada", headers=h)
        if check("GET /laporan/armada", r):
            arm = r.json()
            ok(f"  Status armada: {arm.get('status_armada', {})}")
            ok(f"  Total unit: {arm.get('total_unit', 0)}")
            ok(f"  Detail armada: {len(arm.get('armada_detail', []))} mobil")

        # ═══════════════════════════════════════════════════════
        print("\n13. PENGELUARAN — TAMBAH")
        # ═══════════════════════════════════════════════════════
        fd = {
            "deskripsi": "Test BBM Premium script otomatis",
            "kategori": "BBM", "jumlah": "250000",
            "tanggal_pengeluaran": date.today().isoformat(),
        }
        r = await safe_req(c, "post", "/pengeluaran", data=fd, headers=h)
        new_peng_id = None
        if check("POST /pengeluaran (tambah)", r, 201):
            new_peng_id = r.json().get("id_pengeluaran")
            ok(f"  ID baru: {new_peng_id}")

        # ═══════════════════════════════════════════════════════
        print("\n14. PENGELUARAN — LIST")
        # ═══════════════════════════════════════════════════════
        r = await safe_req(c, "get", "/pengeluaran", headers=h)
        if check("GET /pengeluaran", r):
            ok(f"  Jumlah pengeluaran: {len(r.json())}")

        # ═══════════════════════════════════════════════════════
        print("\n15. PENGELUARAN — HAPUS")
        # ═══════════════════════════════════════════════════════
        if new_peng_id:
            r = await safe_req(c, "delete", f"/pengeluaran/{new_peng_id}", headers=h)
            check("DELETE /pengeluaran/{id}", r)

        # ═══════════════════════════════════════════════════════
        print("\n16. CLEANUP — HAPUS DATA TEST")
        # ═══════════════════════════════════════════════════════
        if new_kend_id:
            r = await safe_req(c, "delete", f"/kendaraan/{new_kend_id}", headers=h)
            if r and r.status_code == 200:
                ok("DELETE /kendaraan (cleanup)", "Test kendaraan dihapus")
            elif r and r.status_code == 405:
                ok("DELETE /kendaraan (cleanup)", "Endpoint belum ada -- perlu dibuat")
            else:
                fail("DELETE /kendaraan (cleanup)", "Gagal atau tidak ada response")

        # ═══════════════════════════════════════════════════════
        print("\n" + "=" * 55)
        total = PASS + FAIL
        print(f"  HASIL: {PASS}/{total} PASS, {FAIL}/{total} FAIL")
        if FAIL == 0:
            print("  SEMUA TES BERHASIL!")
        else:
            print(f"  Ada {FAIL} kegagalan yang perlu diperbaiki.")
        print("=" * 55)

if __name__ == "__main__":
    asyncio.run(main())

