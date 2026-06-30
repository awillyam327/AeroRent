"""
Full Kasir Flow Test - AeroRent
Tests the complete kasir workflow end-to-end via the API.
"""
import asyncio
import httpx
import json
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from datetime import date, timedelta

BASE = "http://127.0.0.1:8000"

async def main():
    results = []
    
    def log(step, status_code, ok, detail=""):
        emoji = "✅" if ok else "❌"
        results.append((step, ok))
        print(f"  {emoji} [{status_code}] {step}" + (f" — {detail}" if detail else ""))

    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as c:
        print("=" * 60)
        print("  FULL KASIR TESTING — AeroRent")
        print("=" * 60)

        # ─── 1. LOGIN ────────────────────────────────────────────
        print("\n📌 1. LOGIN KASIR")
        r = await c.post("/auth/login", data={"username": "kasir@aerorent.id", "password": "KasirAeroRent2026"})
        token = r.json().get("access_token")
        log("Login kasir", r.status_code, r.status_code == 200, f"token={'yes' if token else 'NO'}")
        if not token:
            print("⛔ Tidak bisa lanjut tanpa token."); return
        h = {"Authorization": f"Bearer {token}"}

        # ─── 2. DASHBOARD DATA ───────────────────────────────────
        print("\n📌 2. AMBIL DATA DASHBOARD")
        
        r = await c.get("/kendaraan", headers=h)
        kendaraan = r.json()
        log("GET /kendaraan", r.status_code, r.status_code == 200, f"{len(kendaraan)} kendaraan")

        r = await c.get("/pelanggan", headers=h)
        pelanggan = r.json()
        log("GET /pelanggan", r.status_code, r.status_code == 200, f"{len(pelanggan)} pelanggan")

        r = await c.get("/transaksi", headers=h)
        transaksi = r.json()
        log("GET /transaksi", r.status_code, r.status_code == 200, f"{len(transaksi)} transaksi")

        # ─── 3. BUAT TRANSAKSI BARU ──────────────────────────────
        print("\n📌 3. BUAT TRANSAKSI BARU")
        
        # Cari kendaraan TERSEDIA
        k_id = None
        for k in kendaraan:
            if k.get("status") == "TERSEDIA":
                k_id = k["id_kendaraan"]
                print(f"  ℹ️  Kendaraan tersedia: {k.get('nama_kendaraan', k_id)}")
                break
        if not k_id:
            print("  ⚠️  Tidak ada kendaraan TERSEDIA, skip buat transaksi.")
        
        p_id = pelanggan[0]["id"] if pelanggan else None
        if not p_id:
            print("  ⚠️  Tidak ada pelanggan.")

        tid = None
        nb = None
        if k_id and p_id:
            payload = {
                "id_pelanggan": p_id,
                "id_kendaraan": k_id,
                "tanggal_mulai": date.today().isoformat(),
                "tanggal_selesai_rencana": (date.today() + timedelta(days=2)).isoformat(),
                "gunakan_supir": 0,
                "metode_pembayaran": "CASH",
                "catatan_kasir": "Test dari script"
            }
            r = await c.post("/transaksi", json=payload, headers=h)
            data = r.json()
            tid = data.get("id_transaksi")
            nb = data.get("nomor_booking")
            log("POST /transaksi", r.status_code, r.status_code == 201, f"booking={nb}")
        
        # ─── 4. GET DETAIL TRANSAKSI ─────────────────────────────
        if tid:
            print("\n📌 4. GET DETAIL TRANSAKSI")
            r = await c.get(f"/transaksi/{tid}", headers=h)
            log(f"GET /transaksi/{tid[:12]}...", r.status_code, r.status_code == 200)

        # ─── 5. STATUS: MENUNGGU → DIKONFIRMASI (SKIPPED) ────────
        # Transaksi sekarang otomatis DIKONFIRMASI saat dibuat, jadi step ini dilewati.

        # ─── 6. UPLOAD FOTO KONDISI (SEBELUM) ────────────────────
        if tid:
            print("\n📌 6. UPLOAD FOTO KONDISI (SEBELUM)")
            # Buat dummy image 1x1 pixel PNG
            dummy_png = (
                b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
                b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00'
                b'\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00'
                b'\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
            )
            files = {
                "file_depan": ("depan.png", dummy_png, "image/png"),
                "file_samping": ("samping.png", dummy_png, "image/png"),
                "file_belakang": ("belakang.png", dummy_png, "image/png"),
            }
            r = await c.post(
                f"/transaksi/{tid}/foto-kondisi",
                data={"jenis": "sebelum"},
                files=files,
                headers=h,
            )
            log("POST foto-kondisi (sebelum)", r.status_code, r.status_code == 200, r.text[:100])

        # ─── 7. STATUS: DIKONFIRMASI → AKTIF ─────────────────────
        if tid:
            print("\n📌 7. STATUS: DIKONFIRMASI → AKTIF")
            r = await c.put(f"/transaksi/{tid}/status", json={"status": "AKTIF"}, headers=h)
            log("PUT status → AKTIF", r.status_code, r.status_code == 200, r.text[:80])

        # ─── 8. UPLOAD FOTO KONDISI (SESUDAH) ────────────────────
        if tid:
            print("\n📌 8. UPLOAD FOTO KONDISI (SESUDAH)")
            files = {
                "file_depan": ("depan2.png", dummy_png, "image/png"),
                "file_samping": ("samping2.png", dummy_png, "image/png"),
                "file_belakang": ("belakang2.png", dummy_png, "image/png"),
            }
            r = await c.post(
                f"/transaksi/{tid}/foto-kondisi",
                data={"jenis": "sesudah"},
                files=files,
                headers=h,
            )
            log("POST foto-kondisi (sesudah)", r.status_code, r.status_code == 200, r.text[:100])

        # ─── 9. STATUS: AKTIF → SELESAI ──────────────────────────
        if tid:
            print("\n📌 9. STATUS: AKTIF → SELESAI")
            r = await c.put(f"/transaksi/{tid}/status", json={
                "status": "SELESAI",
                "biaya_denda_kerusakan": 0,
                "biaya_tambahan_lain": 0,
                "catatan_kasir": "Kendaraan dikembalikan dalam kondisi baik"
            }, headers=h)
            log("PUT status → SELESAI", r.status_code, r.status_code == 200, r.text[:100])

        # ─── 10. LAPORAN ─────────────────────────────────────────
        print("\n📌 10. LAPORAN")
        for ep in ["/laporan/armada", "/laporan/keuangan"]:
            r = await c.get(ep, headers=h)
            log(f"GET {ep}", r.status_code, r.status_code == 200, r.text[:60])

        # ─── 11. PELANGGAN CRUD ──────────────────────────────────
        print("\n📌 11. PELANGGAN CRUD")
        r = await c.post("/pelanggan", data={
            "nama_lengkap": "Test Script",
            "no_telepon": "081000000000",
            "email": "test@test.com"
        }, headers=h)
        log("POST /pelanggan (baru)", r.status_code, r.status_code == 201, r.text[:80])
        new_plg_id = r.json().get("id_pelanggan") if r.status_code == 201 else None
        
        if new_plg_id:
            r = await c.get(f"/pelanggan/{new_plg_id}", headers=h)
            log(f"GET /pelanggan/{new_plg_id[:12]}...", r.status_code, r.status_code == 200)

        # ─── 12. PENGELUARAN ─────────────────────────────────────
        print("\n📌 12. PENGELUARAN")
        r = await c.get("/pengeluaran", headers=h)
        log("GET /pengeluaran", r.status_code, r.status_code == 200, f"{len(r.json())} pengeluaran")

        # ─── SUMMARY ─────────────────────────────────────────────
        print("\n" + "=" * 60)
        passed = sum(1 for _, ok in results if ok)
        failed = sum(1 for _, ok in results if not ok)
        print(f"  TOTAL: {passed} ✅  |  {failed} ❌  (dari {len(results)} tes)")
        print("=" * 60)
        
        if failed:
            print("\n  ❌ GAGAL:")
            for step, ok in results:
                if not ok:
                    print(f"    • {step}")

if __name__ == "__main__":
    asyncio.run(main())
