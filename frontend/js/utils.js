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
  qs('toast-ic').textContent = icon;
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
