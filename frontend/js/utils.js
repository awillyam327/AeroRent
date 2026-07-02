/**
 * ==============================================================================
 * AeroRent — Utilitas Bersama
 * Dipakai oleh semua halaman: formatter angka/tanggal, shortcut DOM, toast.
 * ==============================================================================
 */

/** Shortcut document.getElementById */
function qs(id) { return document.getElementById(id); }

/** Format angka jadi Rupiah, contoh: rp(300000) -> "Rp 300.000" */
function rp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

/** Format tanggal singkat, contoh: "19 Jun 2026" */
function fmtD(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format tanggal + jam, contoh: "19/06/2026 14.30" */
function fmtDT(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('id-ID');
}

/** Hitung selisih hari antara dua tanggal (string YYYY-MM-DD) */
function diffDays(dariStr, sampaiStr) {
  const a = new Date(dariStr); a.setHours(0, 0, 0, 0);
  const b = new Date(sampaiStr); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

/**
 * Tampilkan toast notifikasi.
 * Membutuhkan markup #toast / #toast-ic / #toast-ttl / #toast-msg di halaman
 * (lihat components.js -> renderToastMarkup()).
 */
let _toastTimer;
function showToast(icon, title, msg, durationMs = 4000) {
  const box = qs('toast');
  if (!box) { console.warn('[toast] markup #toast tidak ditemukan di halaman ini'); return; }
  qs('toast-ic').innerHTML = icon;
  qs('toast-ttl').textContent = title;
  qs('toast-msg').textContent = msg;
  box.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(hideToast, durationMs);
}
function hideToast() {
  const box = qs('toast');
  if (box) box.classList.add('hidden');
}

/** Debounce sederhana — dipakai untuk search-as-you-type */
function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/* ---------- Penyimpanan booking mode-demo (sesi browser lokal) ----------
 * Saat checkout.html gagal memanggil backend asli (lihat js/booking.js),
 * booking "demo" yang dihasilkan disimpan di sini, supaya tetap muncul di
 * Dashboard Customer pada sesi browser yang sama — membuat alur demo terasa
 * utuh dari ujung ke ujung tanpa backend nyata. BUKAN pengganti database. */
const DEMO_BOOKINGS_KEY = 'aerorent_demo_bookings';

function getDemoBookings() {
  try { return JSON.parse(localStorage.getItem(DEMO_BOOKINGS_KEY) || '[]'); }
  catch (_) { return []; }
}
function addDemoBooking(booking) {
  const list = getDemoBookings();
  list.unshift(booking);
  localStorage.setItem(DEMO_BOOKINGS_KEY, JSON.stringify(list));
}

/* ---------- Profil Customer mode-demo (sesi browser lokal) ----------
 * Dipakai oleh profil.html (simpan) dan sewa.html (auto-isi Data Diri) —
 * lihat README_STRUKTUR.md bagian kontrak API PUT /pelanggan/saya. */
const DEMO_PROFILE_KEY = 'aerorent_demo_profile';

function getDemoProfile() {
  try { return JSON.parse(localStorage.getItem(DEMO_PROFILE_KEY) || 'null'); }
  catch (_) { return null; }
}

/**
 * Kompresi gambar client-side menggunakan HTML5 Canvas
 * @param {File} file - File asli (gambar)
 * @param {number} maxSizeMB - Batas maksimal dalam MB (default: 0.95MB untuk amannya API OCR)
 * @returns {Promise<File>} - Resolves with compressed File, or original file if already small
 */
function compressImageFile(file, maxSizeMB = 0.95) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return resolve(file);
    }
    
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size <= maxSizeBytes) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 1600; // Maksimal dimensi gambar

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > width && height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          0.7 // Kualitas JPEG (70%)
        );
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
}
