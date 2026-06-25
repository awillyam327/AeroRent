/**
 * ==============================================================================
 * AeroRent — API Layer
 * Satu pintu komunikasi ke backend FastAPI. Semua halaman memakai modul ini
 * supaya base URL, header auth, dan penanganan error konsisten di satu tempat.
 *
 * CATATAN PENTING UNTUK TIM BACKEND:
 * Endpoint yang dipanggil di sini mengikuti kontrak yang didokumentasikan di
 * README_STRUKTUR.md bagian "Kontrak API". Sebagian endpoint (terutama yang
 * bertanda "BELUM ADA DI BACKEND" di komentar fungsi masing-masing) belum
 * terimplementasi di main.py saat laporan ini dibuat — frontend tetap memanggil
 * endpoint tsb sesuai kontrak yang diharapkan, lalu fallback ke data demo bila
 * gagal, supaya halaman tetap bisa didemokan sebelum backend menyusul.
 * ==============================================================================
 */

const API_BASE = 'https://aero-rent-twvb.vercel.app';
const AUTH_KEY = 'aerorent_auth';

/* ---------- Sesi & Token ---------- */

/** Ambil objek sesi tersimpan: { access_token, refresh_token, token_type, user } atau null */
function getAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); }
  catch (_) { return null; }
}

function getToken() { return getAuth()?.access_token || null; }
function getCurrentUser() { return getAuth()?.user || null; }

function setAuth(authData) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

/**
 * Wajibkan login untuk halaman ini. Panggil di awal <script> tiap halaman
 * yang butuh sesi (dashboard, checkout, dst).
 * @param {string[]} allowedRoles - cth. ['OWNER'], ['KASIR'], ['CUSTOMER']
 * @param {string} loginPath - path relatif ke login.html dari halaman saat ini
 */
function requireAuth(allowedRoles, loginPath = '/login.html') {
  const auth = getAuth();
  if (!auth || !auth.access_token) {
    location.href = loginPath;
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(auth.user?.role)) {
    location.href = loginPath;
    return null;
  }
  return auth;
}

function logout(redirectTo = '/login.html') {
  clearAuth();
  location.href = redirectTo;
}

/* ---------- Fetch wrapper umum ---------- */

/**
 * Panggil endpoint backend dengan header Authorization otomatis.
 * Mengembalikan Response mentah (bukan json) supaya pemanggil bisa cek r.ok.
 * Pada 401, sesi dianggap kadaluarsa: token dihapus & user diarahkan ke login.
 */
async function apiFetch(path, options = {}, loginPath = '/login.html') {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  try {
    const res = await fetch(API_BASE + path, { ...options, headers });
    if (res.status === 401) {
      clearAuth();
      location.href = loginPath;
      return null;
    }
    return res;
  } catch (err) {
    console.warn(`[api] Network error saat memanggil ${path}:`, err.message);
    return null;
  }
}

/** Sama seperti apiFetch, tapi langsung parse JSON. Mengembalikan null bila gagal. */
async function apiJson(path, options = {}, loginPath = '/login.html') {
  const res = await apiFetch(path, options, loginPath);
  if (res && res.ok) {
    try { return await res.json(); } catch (_) { return null; }
  }
  return null;
}

/* ---------- Auth: Login ---------- */

/**
 * Login Kasir/Owner — endpoint NYATA, sudah ada di main.py (/auth/login).
 * FastAPI OAuth2PasswordRequestForm mewajibkan field 'username' (diisi email)
 * & 'password', dikirim sebagai application/x-www-form-urlencoded — BUKAN JSON.
 * Melempar Error jika gagal, supaya pemanggil bisa fallback ke mode demo.
 */
async function apiLoginStaff(email, password) {
  const body = new URLSearchParams();
  body.append('username', email);
  body.append('password', password);

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Email atau password salah.');
  }
  return res.json(); // { access_token, refresh_token, token_type, user }
}

/**
 * Login Customer — BELUM ADA DI BACKEND (tabel PELANGGAN belum punya kolom
 * password sama sekali). Kontrak yang diharapkan didokumentasikan di
 * README_STRUKTUR.md. Selama backend belum mendukung ini, fungsi akan selalu
 * melempar Error, dan auth.js akan fallback ke mode demo lokal.
 */
async function apiLoginCustomer(email, password) {
  const res = await fetch(`${API_BASE}/auth/login-customer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Endpoint login customer belum tersedia di backend.');
  return res.json();
}

/**
 * Registrasi Customer — BELUM ADA DI BACKEND (endpoint POST /pelanggan yang
 * ada saat ini terkunci untuk Kasir/Owner saja, bukan untuk self-registration
 * publik). Kontrak yang diharapkan didokumentasikan di README_STRUKTUR.md.
 */
async function apiRegisterCustomer(formData) {
  const res = await fetch(`${API_BASE}/auth/register-customer`, {
    method: 'POST',
    body: formData, // multipart/form-data (ada upload foto KTP)
  });
  if (!res.ok) throw new Error('Endpoint registrasi customer belum tersedia di backend.');
  return res.json();
}
