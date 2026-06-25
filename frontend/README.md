# AeroRent Frontend — Quick Start (VS Code)

## Cara Tercepat Menjalankan (disarankan)

1. Buka folder ini di VS Code: **File → Open Folder...** → pilih folder `frontend` ini.
2. VS Code akan menawarkan untuk install extension **"Live Server"** (muncul notifikasi
   pojok kanan bawah) — klik **Install**. Kalau notifikasinya tidak muncul, cari manual
   di tab Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`), ketik "Live Server" karya Ritwick Dey.
3. Di File Explorer VS Code, klik kanan **`login.html`** → **"Open with Live Server"**.
4. Browser akan terbuka otomatis ke `http://127.0.0.1:5500/login.html` — selesai, situs sudah jalan.

> ⚠️ **Jangan dobel-klik file `.html` langsung dari File Explorer Windows/Finder Mac.**
> Sebagian fitur (Service Worker di halaman Kasir, navigasi antar halaman) butuh
> dijalankan lewat server (`http://...`), tidak akan jalan kalau dibuka sebagai file
> lokal (`file://...`).

## Cara Alternatif (tanpa extension, pakai Terminal)

Buka Terminal di VS Code (`` Ctrl+` ``), lalu jalankan salah satu:

```bash
# Mac/Linux
./start-server.sh

# Windows
start-server.bat
```

Atau manual:
```bash
python -m http.server 8000
```

Kalau `python` tidak dikenali, coba `python3 -m http.server 8000`. Lalu buka
`http://localhost:8000/login.html` di browser.

## Akun Demo (di halaman Login, tinggal klik kartunya)

| Role | Email | Password |
|---|---|---|
| Owner | `owner@aerorent.id` | apa saja, asal mengandung **"123"** (mis. `Demo123`) |
| Kasir | `kasir@aerorent.id` | sama seperti di atas |
| Customer | `customer@aerorent.id` | sama seperti di atas |

## Peta Halaman

| Mulai dari | File |
|---|---|
| Beranda (publik) | `index.html` |
| Eksplorasi Armada | `armada.html` |
| Login / Daftar | `login.html` |
| Checkout Customer | `sewa.html` (perlu login sbg Customer) |
| Dashboard Kasir | `pages/cashier/pos-kasir.html` (perlu login sbg Kasir) |
| Dashboard Owner | `pages/owner/owner-dashboard.html` (perlu login sbg Owner) |
| Dashboard/Riwayat/Profil Customer | `pages/customer/*.html` (perlu login sbg Customer) |

## Dokumentasi Lengkap

Struktur folder, kontrak API yang masih ditunggu backend, dan riwayat
perbaikan ada di **[`README_STRUKTUR.md`](./README_STRUKTUR.md)** — baca itu
kalau butuh detail lebih dalam atau mau lanjut ke backend.
