# AeroRent AI Collaboration Context

# Log Pekerjaan & AI Vibe Coding Guidelines

## 📌 Prompt Pengingat untuk Sesi Selanjutnya
Jika Anda ingin memulai sesi *Vibe Coding* baru untuk proyek ini, berikan *prompt* ini ke AI (Antigravity):

> **"Halo! Kita akan melanjutkan proyek AeroRent. Sebelum mengeksekusi kode apa pun, tolong baca seluruh isi file `D:\Obsidian\Brain\20_Projects\AeroRent\05_Log Pekerjaan & AI Guidelines.md` terlebih dahulu. Pahami fitur yang sudah selesai (terutama pemisahan Local vs Vercel) dan patuhi Panduan Anti-Halu di dalamnya secara ketat. Beri konfirmasi singkat jika sudah membaca dan siap!"**

---

## 📝 Ringkasan Pekerjaan Hari Ini
*Sesi Pengembangan - Validasi SIM, Liveness, dan Cleanup Backend*
1. **Pembersihan Backend (Cleanup)**
   - Menghapus 16 file skrip sisa dan 50+ file dari folder usang (`frontend_old/`, `uploads/`, dll.) untuk merapikan root dan backend.
2. **Dokumentasi Laporan Sistem**
   - Membuat `laporan_sistem_aerorent.md` yang merinci seluruh teknologi, API eksternal (Face++, Fonnte, Midtrans, ImgBB, dll), serta alur kerja sistem.
3. **Integrasi WhatsApp (Fonnte) & Verifikasi Liveness**
   - Menambahkan konfigurasi token Fonnte pada backend untuk pengiriman notifikasi WhatsApp.
   - Mengimplementasikan alur liveness check di frontend (menggunakan kamera HP pengguna langsung via browser) dan backend (mengirim foto selfie dan KTP ke Face++ untuk dicocokkan kemiripan wajahnya).
4. **Validasi Nama SIM via OCR & Kompresi Gambar**
   - **Frontend:** Mengimplementasikan fungsi kompresi gambar client-side menggunakan HTML5 Canvas agar foto SIM yang diunggah tidak lebih dari 1 MB.
   - **Backend:** Membuat endpoint `POST /ocr/sim-validate` yang membaca teks SIM dengan OCR.space, mengekstrak nama, dan membandingkannya dengan nama KTP dari database secara otomatis sebelum diizinkan masuk ke ImgBB.

*Sesi Pengembangan - 5 Fitur Skala Besar (Selesai)*

1. **Pencegahan Double Booking**
   - Transaksi baru akan dicek tabrakan (overlap) tanggalnya dengan transaksi berstatus MENUNGGU, DIKONFIRMASI, atau AKTIF. Webhook Midtrans telah ditingkatkan untuk auto-confirm status penyewaan.
2. **Modul Karyawan Supir**
   - Menambah `SUPIR` role. Owner dapat mengatur supir di dashboard, dan Kasir dapat memilih supir (lewat dropdown yang memanggil API `/karyawan/supir-aktif`) saat membuat transaksi dengan opsi 'Gunakan Jasa Supir'.
3. **Filter & Sorting Kendaraan (UI Owner)**
   - API `/kendaraan` mendukung query `sort_by` dan `order`. UI Owner Dashboard sudah diintegrasikan dengan dropdown interaktif untuk mengurutkan daftar kendaraan.
4. **Unggah Foto Kondisi Kendaraan (Min. 5 Foto)**
   - API dan form POS Kasir diperbarui untuk mewajibkan 5 posisi foto spesifik (Depan, Samping Kanan, Samping Kiri, Belakang, Dalam) dan menyediakan upload file _tambahan_ opsional tanpa batas.
5. **Integrasi Scanner & OCR KTP (Menunggu API Key)**
   - Menambahkan proxy endpoint `/ocr/ktp` di backend. Frontend POS Kasir telah terhubung dan memiliki tombol/input Scan foto KTP.
   - **TUGAS ANDA**: Silakan daftar akun di OCR.space, dapatkan API Key-nya, dan masukkan kunci tersebut ke `.env` lokal serta *Environment Variables* Vercel dengan nama **`OCR_SPACE_API_KEY`**.

*Sesi Pengembangan - Midtrans & Checkout Bug Fixes*
1. **Dokumentasi AS-IS & Kredensial**
   - Berhasil mendata dan membuat `04_Dokumentasi Lengkap AS-IS.md` yang merangkum arsitektur aplikasi (FastAPI + Vanilla JS) beserta kredensial bawaan (Owner, Kasir, Customer) dan batasan sistem saat ini.
2. **Integrasi Midtrans Sandbox (Virtual Account / QRIS)**
   - Menghubungkan tombol "Konfirmasi & Sewa" di frontend dengan Midtrans Snap (*pop-up*).
   - Menambahkan *endpoint* baru di backend (`GET /config/midtrans`) agar frontend bisa secara dinamis mengambil *Client Key* Midtrans.
3. **Troubleshooting Environment Variables**
   - Memecahkan *bug* "Gagal mendapatkan token pembayaran" yang disebabkan oleh file `.env` lokal tidak terbaca di Vercel, dan mengarahkan pengisian *Server Key* & *Client Key* langsung ke Dashboard Vercel.
   - Mengatasi isu *HTTP 401 Unauthorized* dengan memastikan kunci yang dimasukkan ke Vercel adalah kunci khusus mode **Sandbox** (berawalan `SB-`), bukan kunci Produksi.
4. **Perbaikan Bug Flow Checkout (Frontend)**
   - **Midtrans Popup Close:** Mengubah teks layar dari "PEMESANAN BERHASIL" menjadi "PEMESANAN DITUNDA" (dengan desain UI peringatan kuning) jika pelanggan menutup *pop-up* tanpa membayar.
   - **Auto-fill Data Diri:** Menambahkan panggilan API `GET /pelanggan/{id}` di tahap awal *checkout* agar nomor telepon, alamat, dan status KTP pelanggan otomatis terisi jika mereka sudah melengkapi profilnya sebelumnya.

*Sesi Pengembangan - Fitur Customer Tambahan*
1. **Penyesuaian UI Mobile & Foto Profil Pelanggan**
   - Menyesuaikan tampilan *navbar* atas pada *mobile* agar elemen-elemen sapaan dan tombol keluar disembunyikan dalam *hamburger menu* agar tidak sesak.
   - Mengaktifkan fitur *upload* foto profil (*via* ImgBB) dengan opsi unggah foto **langsung dari Kamera** atau **mengambil dari Galeri**.
   - Memperbarui komponen navigasi (*navbar*, *sidebar*, dan navigasi bawah) agar memuat foto profil (URL) yang diunggah secara dinamis.
2. **Penyempurnaan UI Hero Section (Beranda)**
   - Mengubah animasi *slider* foto promo dari efek dasar menjadi efek *crossfade blend* ganda yang sangat mulus dengan durasi transisi 1 detik penuh.
   - Mengatasi *bug* layout bergetar (*page jitter*) yang disebabkan oleh mesin rendering webkit pada efek *blur*, dengan menerapkan *hardware acceleration* (`transform: translateZ(0)`) dan pemisahan lapisan latar belakang (*layering*).
   - Memperbaiki isu halaman *naik-turun* (*layout shift*) akibat animasi mesin tik (*typewriter*) pada teks judul yang melipat secara dinamis. Diselesaikan dengan mengunci tinggi minimal (`min-height`) area kontainer judul tersebut.

*Sesi Pengembangan - Autentikasi & UI Polish*
1. **Fitur Verifikasi Email Pendaftaran (SMTP Gmail)**
   - Backend memblokir akses login pelanggan baru hingga mereka melakukan verifikasi email (`is_verified = 0`). 
   - Backend mengirimkan token JWT verifikasi via SMTP Gmail (menggunakan `aiosmtplib` dan App Password).
   - Frontend membaca parameter `?verify=TOKEN` dan memverifikasi pengguna secara otomatis lewat *endpoint* baru `POST /auth/verify-email`.
2. **Navigasi Mobile Khusus Tamu (Guest)**
   - Mengaktifkan bilah navigasi bawah (*bottom navigation bar*) khusus untuk perangkat *mobile* pada mode *guest*, memandu pengunjung yang belum *login* dengan tautan Beranda, Armada, dan Masuk.
3. **Penyempurnaan Ikonografi UI (No More Emojis)**
   - Membabis-habis seluruh *emoji* bawaan sistem dari dalam aplikasi web (seperti notifikasi Kasir, halaman Profil, Dashboard) dan menggantinya dengan set **Phosphor Icons** agar estetika terlihat konsisten dan premium.

*Sesi Pengembangan - Business Logic & UI Polish*
1. **Aturan Bisnis Jasa Supir (Frontend & Backend)**
   - Menambahkan pembatasan paket sewa: "Sewa Bulanan" kini tidak bisa lagi menggunakan jasa supir (tombol disembunyikan dan di-_disable_ otomatis).
   - Menambahkan limitasi sewa harian: Jika memilih "Gunakan Jasa Supir" untuk paket "Harian", durasi penyewaan dibatasi maksimal hanya **7 hari**. Aturan ini diterapkan langsung ke halaman *Checkout* pelanggan, halaman POS Kasir, dan endpoint API backend `POST /transaksi`.
2. **Penyempurnaan Invoice PDF & WhatsApp**
   - Penyesuaian agar notifikasi WhatsApp hanya mengirimkan struk via teks tanpa lampiran, sementara *file* PDF akan otomatis diunduh (*auto-download*) di browser pelanggan sesaat setelah mereka menekan tombol "Unduh Invoice".
3. **Perbaikan Tata Letak (Layout) & Navigasi UI**
   - Menambahkan tombol **"Kembali"** (Back) pada Dashboard Customer versi *desktop* untuk memudahkan navigasi.
   - Memperbaiki bug tampilan "Pemesanan Berhasil" di *checkout* pelanggan (*Step* 3) yang sebelumnya terdorong ke kiri karena sisa alokasi ruang *grid* kolom ringkasan.
   - Memperbaiki bug struktur tabel "Pemesanan Aktif" di Dashboard Customer yang membuat tombol aksi (*Bayar, Extend, Cancel*) terlempar ke baris baru dan terlihat berantakan karena hilangnya *tag* HTML pembungkus kolom.
   - Menambahkan *badge* transparan elegan berisi **Nama Mobil** di pojok kiri atas foto kendaraan pada layar POS Kasir saat sedang memilih armada.

---

## 🤖 Panduan Anti-Halu untuk Sesi "Vibe Coding" Berikutnya
*(Catatan ini ditujukan sebagai pengingat untuk AI sebelum mengeksekusi kode di masa mendatang guna meminimalisir bug/error)*

1. **Selalu Verifikasi Kontrak API (Frontend-Backend)**
   - Jangan pernah berasumsi bahwa data (misal: struktur objek `user` dalam *token*) mengandung data lengkap. *Cross-check* selalu struktur *database* (`schema.sql`) dengan *response payload* asli di FastAPI sebelum mengubah kode JavaScript.
2. **Cek Perbedaan Environment (Local vs Vercel)**
   - Ingat bahwa modifikasi backend secara lokal (seperti file `.env` atau `main.py`) **tidak akan otomatis berdampak** pada frontend yang mengarah ke `API_BASE = 'https://aero-rent-twvb.vercel.app'`. Selalu tawarkan opsi *testing* lokal (`http://localhost:8000`) atau dorong perubahan ke Git/Vercel.
3. **Pahami Batasan Mode Sandbox Pihak Ketiga**
   - Saat mengetes Midtrans, Fonnte (WA), atau ImgBB, pahami perilaku *sandbox/mock*-nya. Midtrans Sandbox *menolak* API Key Produksi, dan pembayaran (seperti QRIS) tidak bisa di-scan pakai aplikasi *banking* nyata (harus pakai Simulator Midtrans).
4. **Jejaki Akar Masalah Sebelum Bertindak**
   - Jika terjadi *error* aneh di frontend, telusuri *Catch Block*-nya (seperti yang terjadi pada error *token pembayaran* tadi). Jangan asal tebak. Tulis *script scratch* (seperti `check_tidb.py` atau tes `urllib`) untuk membuktikan hipotesis sebelum mengedit kode inti.
5. **Jaga Konsistensi UI/UX**
   - Seluruh elemen frontend harus dikelola secara dinamis. Jika ada perubahan fungsional di JavaScript, pastikan *state* UI seperti warna tombol, teks loading (*spinner*), dan pesan *toast* diperbarui agar pengguna tidak bingung.
6. **Selalu Push ke Git Setelah Perubahan Backend**
   - Mengingat backend di-hosting di Vercel yang terhubung dengan GitHub, setiap perubahan backend yang sudah teruji dan valid di lokal **wajib langsung di-push ke Git** (menggunakan perintah `git add`, `git commit`, `git push`) agar Vercel melakukan *deploy* otomatis dan frontend produksi dapat menikmati perubahannya.
