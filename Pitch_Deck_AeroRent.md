# DRAFT PRESENTASI PITCH DECK: AERORENT
*(Disesuaikan dengan Ketentuan Isi Presentasi)*

---

## 1. Judul & Tim
*   **Judul Proyek:** AeroRent - Modernizing Car Rental Operations
*   **Daftar Anggota Tim:** 
    *   Awillyam (Role: Fullstack Developer / Project Manager)
    *   *(Tambahkan anggota tim lain dan perannya jika ada)*
*   **Visual:** Logo AeroRent besar, dengan nama anggota tim di bawahnya.

## 2. Latar Belakang (Problem)
*   **Masalah Spesifik:**
    1. **Tingginya Penipuan Identitas:** Kasus penyewa membawa kabur mobil lepas-kunci menggunakan KTP palsu.
    2. **Operasional Manual yang Rentan:** Pembukuan manual memicu *double-booking*, dan tidak adanya bukti valid kondisi awal mobil sebelum disewa yang memicu perdebatan lecet dengan pelanggan.
    3. **Tidak Ada Transparansi Finansial:** Pemilik bisnis (*Owner*) kesulitan memantau arus kas (*cash flow*) dan pendapatan secara *real-time*.
*   **Mengapa Penting:** Kerugian finansial akibat pencurian aset mobil dan inefisiensi operasional sangat besar dan bisa membuat bisnis bangkrut.

## 3. Solusi (Solution)
*   **Gambaran Singkat:** AeroRent adalah sistem ERP (Enterprise Resource Planning) berbasis web yang mendigitalkan dan mengotomatiskan seluruh siklus penyewaan mobil dalam satu platform terpusat (*closed-loop*).
*   **Visual:** Screenshot halaman beranda aplikasi AeroRent.

## 4. Target Pengguna (Target Audience)
*   Sistem ini dirancang untuk menghubungkan 3 aktor utama dalam ekosistem bisnis rental:
    1. **Pelanggan (Customer):** Orang yang ingin menyewa mobil dengan cepat dan aman via web.
    2. **Kasir / Staf Operasional:** Karyawan rental yang mengurus serah-terima kunci dan verifikasi fisik.
    3. **Pemilik Bisnis (Owner):** Investor atau pemilik yang memantau performa bisnis dan laporan keuangan dari jarak jauh.

## 5. Cara Kerja (How It Works)
*   **Alur Kerja Inti:**
    1. **Booking & Verifikasi AI:** Pelanggan memesan mobil, wajib *upload* foto KTP, SIM, dan diverifikasi otomatis menggunakan AI *Face Recognition* (Face++ Liveness).
    2. **Pembayaran Otomatis:** Pelanggan membayar via QRIS/VA (Midtrans). Sistem otomatis mengkonfirmasi tanpa campur tangan admin.
    3. **Serah Terima (FR-07):** Saat hari H, Kasir mengambil 5 foto sudut mobil sebelum menyerahkan kunci sebagai bukti kondisi awal.
    4. **Notifikasi Pintar:** Sistem mengirim pesan WhatsApp otomatis (Fonnte) H-1 sebelum masa sewa berakhir.

## 6. Teknologi yang Digunakan (Tech Stack)
*   **Frontend:** Vanilla HTML, CSS, JavaScript (Ringan dan performa super cepat).
*   **Backend:** Python FastAPI (Performa tinggi, arsitektur *asynchronous*).
*   **Database:** TiDB Cloud (Distributed SQL Database) - Tangguh dan *scalable*.
*   **Integrasi Pihak Ketiga (API):** 
    *   *Midtrans* (Payment Gateway)
    *   *Face++* (AI Liveness & Face Matching)
    *   *Fonnte* (WhatsApp Gateway)
    *   *Cloudinary* (Cloud Image Storage - Anti Blokir)
*   **Infrastruktur:** Vercel (Serverless Deployment).

## 7. Demo Produk
*   **Keterangan:** (Di bagian slide ini, tutup presentasi dan tunjukkan langsung aplikasinya secara *live*).
*   **Skenario Demo:**
    1. Tunjukkan halaman utama pelanggan dan buat akun.
    2. Tunjukkan cara pesan mobil (perlihatkan form KTP/SIM AI).
    3. Tunjukkan pembayaran otomatis QRIS Midtrans.
    4. Buka *dashboard* Owner untuk menunjukkan grafik pendapatan, lalu *download* Laporan Keuangan PDF.

## 8. Dampak / Model Bisnis (Impact/Business Model)
*   **Dampak Positif:** 
    *   **Keamanan Aset:** Mengurangi risiko pencurian mobil hingga 99% berkat deteksi wajah AI Liveness.
    *   **Efisiensi Waktu:** Otomatisasi mutasi bank/pembayaran dan pengingat WhatsApp mengurangi beban kerja karyawan secara drastis.
*   **Keuntungan (Model Bisnis):** 
    *   Biaya operasional *server* ditekan hingga hampir **Rp 0** (mengandalkan arsitektur *Serverless* Vercel dan Cloudinary).
    *   AeroRent dapat disewakan kembali ke pengusaha rental mobil tradisional dengan model berlangganan per bulan (SaaS - *Software as a Service*).
