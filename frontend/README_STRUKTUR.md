# AeroRent Frontend — Struktur Proyek & Status Build

Dokumen ini menjelaskan struktur folder (Phase 4) dan kontrak API yang dipakai
modul auth (sebagian dari Phase 5). Akan diperluas setiap deliverable baru selesai.

## Struktur Folder

```
frontend/
├── login.html                  ✅ SELESAI — halaman Login/Daftar
├── index.html                  ✅ SELESAI — Beranda (Hero, Kategori, Armada Unggulan, Cara Sewa)
├── armada.html                 ✅ SELESAI — Eksplorasi Armada (search, filter tipe, grid penuh)
├── sewa.html                   ✅ SELESAI — Checkout 3 langkah (Jadwal → Data Diri → Selesai)
│
├── pages/
│   ├── customer/
│   │   ├── dashboard.html      ✅ SELESAI — stat card, tabel pemesanan aktif, banner CS
│   │   ├── riwayat.html        ✅ SELESAI — kartu riwayat, cetak invoice, extend (honest stub)
│   │   └── profil.html         ✅ SELESAI — edit data diri, status dokumen, persist demo lokal
│   │
│   ├── cashier/
│   │   ├── pos-kasir.html      ✅ Tailwind DIHAPUS sepenuhnya — diganti CSS murni hand-written
│   │   │                          (cashier.css), nol perubahan pada logika JS/IndexedDB/sync
│   │   ├── cashier.css         ✅ BARU — pengganti Tailwind, lihat catatan migrasi di bawah
│   │   └── sw.js               ✅ DIPINDAH apa adanya (Service Worker, scope folder ini)
│   │
│   └── owner/
│       ├── owner-dashboard.html ✅ Tailwind DIHAPUS sepenuhnya — diganti CSS murni hand-written
│       │                           (owner.css), nol perubahan pada logika JS/Chart.js
│       └── owner.css            ✅ BARU — pengganti Tailwind
│
├── css/
│   ├── global.css              ✅ Design tokens & komponen bersama SEMUA halaman
│   │                              (warna, font, glass-card, button, badge, navbar, footer, toast)
│   ├── auth.css                ✅ Style khusus login.html (card terpusat, tab switcher)
│   ├── public.css              ✅ Style khusus index.html & armada.html (hero, kartu kendaraan, steps)
│   ├── checkout.css            ✅ Style khusus sewa.html (step indicator, ringkasan sticky, upload KTP)
│   └── customer.css            ✅ Layout sidebar + konten portal Customer (dashboard/riwayat/profil)
│   # css/responsive.css belum diperlukan terpisah — breakpoint sejauh ini cukup inline per file
│
├── js/
│   ├── utils.js                ✅ Formatter bersama + penyimpanan booking demo (localStorage)
│   ├── api.js                  ✅ Satu pintu ke backend: base URL, token, requireAuth(), logout()
│   ├── components.js           ✅ Render navbar/footer/sidebar Customer/toast via JS string
│   │                              (bukan fetch partial, supaya tetap jalan dibuka dari file://)
│   ├── auth.js                 ✅ Logika login.html: tab switch, submit form, demo-fallback
│   ├── vehicle.js              ✅ Fetch katalog kendaraan (publik) + render kartu kendaraan,
│   │                              dipakai index.html & armada.html
│   ├── booking.js              ✅ Logika checkout 3 langkah (sewa.html): kalkulasi biaya,
│   │                              submit ke POST /transaksi asli + fallback demo
│   └── customer.js             ✅ Logika 3 halaman Customer: dashboard (statistik), riwayat
│                                  (kartu + cetak invoice), profil (edit + persist lokal)
│
├── assets/{images,icons,logos} ⏳ Kosong — diisi saat aset nyata tersedia
└── components/                 ⏳ Kosong — dicadangkan untuk partial HTML jika nanti
                                    dipindah dari pendekatan JS-string ke fetch()-based
```

## Mengapa pendekatan "render via JS string", bukan fetch() partial HTML?

`components.js` menyuntikkan HTML navbar/footer lewat `innerHTML`, bukan
`fetch('navbar.html')`. Alasannya: kalau folder ini dibuka langsung dari file
explorer (protokol `file://`, tanpa server lokal seperti `python -m http.server`),
`fetch()` ke file lokal akan diblokir oleh kebijakan CORS browser. Pendekatan
JS-string memastikan setiap halaman tetap berfungsi baik dijalankan via server
sungguhan maupun dibuka langsung sebagai file — penting untuk kemudahan
demo/presentasi.

## Perubahan 2 baris pada file yang dipindah

Saat memindahkan `pos-kasir.html` dan `owner-dashboard.html` ke folder baru,
ada penyesuaian path yang murni urusan routing frontend (bukan menyentuh logika
bisnis/backend):

| File | Baris lama | Baris baru | Alasan |
|---|---|---|---|
| `pages/cashier/pos-kasir.html` | `alert('Sesi habis. Silakan login.'); return;` | `location.href = '../../login.html'; return;` | Sebelumnya tidak ada halaman login untuk dituju, sekarang ada |
| `pages/cashier/pos-kasir.html` | 401 → `location.reload()` | 401 → `location.href='../../login.html'` | `reload()` lama hanya mengulang alert yang sama tanpa jalan keluar |
| `pages/owner/owner-dashboard.html` | 401 → `location.reload()` | 401 → `location.href='../../login.html'` | sama seperti di atas |
| `pages/owner/owner-dashboard.html` | `<a href="pos-kasir.html">` | `<a href="../cashier/pos-kasir.html">` | File sekarang ada di folder berbeda |

Tidak ada perubahan pada logika bisnis, pemanggilan API, atau perilaku selain
keempat baris di atas.

## Migrasi Lepas-Tailwind — `pos-kasir.html` (SELESAI)

`pos-kasir.html` awalnya memuat Tailwind via CDN (`<script src="https://cdn.tailwindcss.com">`)
— melanggar aturan proyek. Berikut metodologi migrasinya, supaya bisa diulang
persis sama untuk `owner-dashboard.html`:

1. **Identifikasi yang BUKAN Tailwind dulu.** File ini sudah punya banyak
   class custom hand-written sejak awal (`.glass`, `.g-input`, `.badge`,
   `.btn-p/a/g/r/o`, `.trx-card`, `.up-zone`, `.overlay`, `.modal-box`,
   `.spin`) — ini valid CSS, bukan Tailwind, jadi dipertahankan apa adanya.
2. **Ekstrak semua class Tailwind yang benar-benar dipakai** (statis di HTML
   maupun di dalam template string JS seperti `renderList()`, `renderDetail()`,
   `renderActions()`) via `grep`, lalu tulis definisi CSS tangan untuk
   masing-masing (`cashier.css`) — nilai pixel/warna disalin presisi dari
   skala default Tailwind (mis. `gap-2` → `8px`, `text-gray-400` → `#9CA3AF`)
   supaya tampilan akhir identik.
3. **Nol perubahan pada atribut `class="..."`** di HTML maupun JS — baik
   statis maupun yang digenerate dinamis. Ini sengaja, untuk menghapus risiko
   regresi pada logika bisnis (IndexedDB, Background Sync, upload foto,
   kalkulasi denda) sampai ke titik nol, karena tidak satu baris JS pun disentuh.
4. **Hapus tag `<script src="cdn.tailwindcss.com">` + `tailwind.config`**,
   ganti dengan `<link rel="stylesheet" href="cashier.css">`.
5. **Uji ulang menyeluruh** lewat browser sungguhan (Playwright): tiap status
   transaksi (Menunggu/Dikonfirmasi/Aktif/Selesai/Dibatalkan), modal foto +
   upload 3 file, modal konfirmasi, modal selesai + kalkulasi denda otomatis,
   filter & search, dan tampilan mobile.

**Temuan saat pengujian (bukan disebabkan migrasi ini, sudah ada sejak
sebelumnya):** di tampilan mobile, header utama (`z-30`, tanpa `position`
eksplisit) tumpang-tindih dengan header panel detail (`#right-panel` jadi
`position:fixed` di mobile) di area y=0–53px, membuat tombol "kembali"
sebagian tertutup secara visual meski fungsinya tetap berjalan. Diperbaiki
dengan menaikkan `#right-panel.show` ke `z-index:40` di `cashier.css`.

## `owner-dashboard.html` — SELESAI dimigrasi

Metodologi sama persis seperti `pos-kasir.html` di atas. Chart.js
(`cdn.jsdelivr.net`) dipertahankan apa adanya — itu pustaka grafik canvas
murni JS, bukan framework CSS/JS yang dilarang aturan proyek. Sudah diuji
penuh lewat browser sungguhan: 6 section (Dashboard, Manajemen Karyawan,
Laporan Keuangan, Pencatatan Operasional, Statistik Kendaraan, Semua Pesanan),
modal Tambah Karyawan, search + filter status di Semua Pesanan, dan sidebar
mobile slide-in — semua identik dengan tampilan asli, nol baris JS diubah.

## Changelog — Perbaikan dari Feedback Mockup (putaran review pertama)

Empat perbaikan berikut dilakukan setelah membandingkan langsung dengan
screenshot mockup asli:

1. **Redirect login Customer**: sebelumnya langsung ke Dashboard, sekarang
   ke Beranda (`index.html`) — sesuai alur mockup (Dashboard baru relevan
   setelah ada transaksi). Pengecualian: jika Customer diarahkan ke
   `login.html` dari tombol "Sewa" yang diklik saat belum login (lihat
   `handleSewaClick()` di `js/vehicle.js`), setelah login mereka otomatis
   **kembali melanjutkan ke checkout kendaraan yang sama** lewat parameter
   `?redirect=`, bukan ke Beranda. Logikanya ada di `getPostLoginRedirect()`
   di `js/auth.js`.
2. **Auto-isi Data Diri saat checkout**: jika Customer sudah login dan pernah
   mengisi profil (`profil.html`), field Nama/Telepon/Alamat di Step 2
   checkout (`sewa.html`) otomatis terisi — tidak perlu ketik ulang. Helper
   `getDemoProfile()` dipindah dari `js/customer.js` ke `js/utils.js` supaya
   bisa dipakai bersama oleh `js/booking.js`.
3. **Hero Beranda dirombak** mendekati mockup: judul diganti
   "Mau sewa mobil **apa hari ini?**", layout rata-kiri (bukan center),
   search bar lebih ringkas, ditambah kartu promo + kotak "Tarif Mulai Dari"
   (Brio/Agya 300rb, Avanza/Xenia 350rb, Innova Reborn 750rb — persis sesuai
   mockup). Foto kendaraan di kartu promo sengaja pakai ikon 🚗, BUKAN foto
   asli, supaya konsisten dengan kebijakan hak cipta yang sudah diterapkan
   di seluruh kartu kendaraan lain (lihat catatan di bagian kontrak API
   kendaraan).
4. **Filter Transmisi ditambahkan** di halaman Armada (Semua Transmisi /
   Matic (Otomatis) / Manual) — sebelumnya cuma ada filter Kategori,
   padahal mockup punya dua baris filter. Bisa dikombinasi dengan filter
   Kategori & search teks sekaligus.

## Status Akhir: Bebas Tailwind 100%

Per pengecekan `grep -ri "tailwind"` ke seluruh folder `frontend/`, tidak ada
satu pun referensi CDN/config Tailwind yang tersisa di kode aplikasi manapun
(hanya muncul di komentar dokumentasi seperti file ini, yang menjelaskan
proses migrasinya). Seluruh 8 halaman frontend sekarang 100% HTML + CSS murni
+ Vanilla JavaScript, sesuai aturan proyek.

## Kontrak API — Modul Kendaraan (`js/vehicle.js`)

**`GET /kendaraan`** — sudah ada & publik di `main.py`, tidak butuh login (sesuai FR-02).
- Query param opsional: `tipe` (`5_SEATER`/`7_SEATER`/`MICROBUS`), `status`, `featured`
- Dipakai apa adanya, fallback ke `DEMO_VEHICLES` (disamakan dengan seed `schema.sql`) bila backend tidak terjangkau.
- Catatan: field `foto_url` di banyak data seed masih kosong — kartu kendaraan menampilkan
  placeholder ikon 🚗 saat itu terjadi (lihat `.vehicle-photo-placeholder` di `css/public.css`),
  bukan foto hasil pencarian web, supaya tidak ada risiko hak cipta pada foto kendaraan asli.

## Kontrak API — Modul Dashboard Customer (`js/customer.js`)

**`GET /transaksi/saya`** — BELUM ADA di backend. `GET /transaksi` yang sudah
ada saat ini dikunci `req_kasir_or_owner` dan tidak punya parameter filter
`id_pelanggan` sama sekali, jadi menambah auth Customer ke endpoint itu saja
tidak cukup — perlu endpoint baru yang menyaring berdasarkan token JWT
pemanggil. Sambil menunggu, dashboard memakai data demo statis (`DEMO_BOOKINGS`)
digabung dengan booking yang baru dibuat di sesi browser yang sama (lihat
`getDemoBookings()` di `js/utils.js`), supaya alur "booking lalu lihat di
dashboard" tetap terasa nyata saat didemokan.

**`PUT /pelanggan/saya`** — BELUM ADA di backend, dibutuhkan halaman Profil
Saya untuk Customer mengubah data dirinya sendiri berdasarkan token JWT-nya
(endpoint yang ada saat ini hanya untuk Kasir/Owner mengubah data Pelanggan
LAIN). Sambil menunggu, `profil.html` menyimpan perubahan ke `localStorage`
(lihat `saveProfil()` di `js/customer.js`) supaya tetap terlihat persisten
saat halaman dibuka ulang pada sesi yang sama.

**Fitur "Tambah Waktu Sewa" / Extend** — tidak ada padanan endpoint maupun
kolom database sama sekali untuk ini (lihat laporan Phase 1-2). Tombol
"Extend Sewa" di `riwayat.html` sengaja TIDAK dibuat berpura-pura berhasil —
hanya menampilkan toast yang jujur bahwa fitur ini menunggu pengembangan
backend.

## Kontrak API — Modul Auth

### Sudah ada & berfungsi di backend (`main.py`)

**`POST /auth/login`** — dipakai `apiLoginStaff()` di `js/api.js`
- Content-Type: `application/x-www-form-urlencoded` (bukan JSON — ini standar OAuth2PasswordRequestForm FastAPI)
- Body: `username=<email>&password=<password>`
- Response 200: `{ access_token, refresh_token, token_type, user: { id, nama, email, role } }`
- Response 401: `{ detail: "Email atau password salah." }`
- Hanya mengenali akun di tabel `KARYAWAN` (role `OWNER`/`KASIR`) — **tidak mengenali Customer**.

### Diharapkan ada, BELUM diimplementasikan backend

Frontend sudah memanggil endpoint berikut sesuai kontrak yang diasumsikan di
bawah. Selama belum ada di backend, `auth.js` otomatis fallback ke mode demo
lokal (lihat `DEMO_ACCOUNTS` di `js/auth.js`) supaya halaman tetap bisa
didemokan utuh.

**`POST /auth/login-customer`** (dipakai `apiLoginCustomer()`)
- Body (JSON): `{ email, password }`
- Response yang diharapkan: sama persis seperti `/auth/login` di atas, dengan `user.role = "CUSTOMER"`
- Prasyarat backend: tabel `PELANGGAN` perlu kolom `password_hash` yang saat ini belum ada di `schema.sql`.

**`POST /auth/register-customer`** (dipakai `apiRegisterCustomer()`)
- Body: `multipart/form-data` — field `nama_lengkap`, `no_telepon`, `email`, `password`, file `foto_ktp` (opsional)
- Response yang diharapkan: sama seperti login (langsung mengembalikan token, auto-login setelah daftar)
- Catatan: endpoint `POST /pelanggan` yang sudah ada di `main.py` **tidak bisa dipakai langsung** untuk ini karena dikunci `req_kasir_or_owner` (hanya staf yang boleh memanggilnya) dan tidak mengembalikan token.

## Status Keseluruhan vs Laporan Analisis Phase 1-2

Lihat `AeroRent_Analisis_Phase1-2.md` untuk daftar gap lengkap. Dokumen ini
hanya melacak status build frontend secara teknis, bukan menggantikan laporan
analisis tersebut.
