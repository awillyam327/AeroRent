# Catatan Pembaruan (Changelog) - AeroRent

## [Terbaru] Fitur Jam Sewa & Pembaruan Format Waktu (Juli 2026)

**Deskripsi:**
Sistem AeroRent kini mendasarkan pemesanan (booking) kendaraan secara spesifik hingga ke satuan jam dan menit, bukan lagi hanya berdasarkan tanggal kalender (hari).

### Detail Perubahan:
1. **Skema Database (TiDB):**
   - Kolom `tanggal_mulai` dan `tanggal_selesai_rencana` pada tabel `TRANSAKSI_SEWA` telah dimigrasi dari tipe `DATE` menjadi `DATETIME`.
   
2. **Penyesuaian Durasi & Harga (Backend):**
   - Perhitungan durasi di `backend/routers/transaksi.py` kini menggunakan selisih waktu (`total_seconds()`) yang dibulatkan ke atas (`math.ceil`) untuk menentukan total hari. Hal ini memastikan kebijakan sewa 24-jam terpenuhi secara ketat. (Misal: 25 jam = 2 hari).
   - Skema Pydantic (`backend/models.py`) untuk input transaksi diubah menggunakan modul `datetime`.

3. **Perubahan Antarmuka Pengguna (Frontend):**
   - Seluruh input pemesanan pada `sewa.html`, `pos-kasir.html`, `index.html`, dan `armada.html` menggunakan `type="datetime-local"`.
   - Komponen tanggal pada Dasbor Kasir, Dasbor Customer, dan Dasbor Owner (`pos-kasir.js`, `customer.js`, `owner-dashboard.js`) kini menggunakan pemformat `fmtDT()` di `utils.js` agar mencetak jam secara spesifik (misal: "09 July 2026, 14:30").

**Status:** Selesai dan berfungsi di lingkungan produksi. (Commit `626c3f1`)
