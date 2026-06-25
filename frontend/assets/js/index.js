'use strict';

// ============================================================
// KONFIGURASI
// ============================================================
const API_BASE = 'https://pope-bolster-gallon.ngrok-free.dev';
const AUTH_KEY = 'aerorent_auth';

// Simpan URL Ngrok ke memori peramban agar bisa dibaca halaman lain
localStorage.setItem('aerorent_api_base', API_BASE);

// Header wajib untuk Ngrok agar tidak muncul peringatan browser
const FETCH_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'ngrok-skip-browser-warning': '69420',
};

// ============================================================
// INISIALISASI: Jika sudah login, langsung redirect
// ============================================================
window.addEventListener('load', () => {
  // Register Service Worker untuk PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err =>
      console.warn('[SW] Registrasi gagal:', err)
    );
  }

  // Auto-redirect jika sesi masih valid
  const auth = parseLocalAuth();
  if (auth?.access_token && auth?.user?.role) {
    redirectByRole(auth.user.role);
  }

  // Tampilkan host API
  document.getElementById('apiHost').textContent = new URL(API_BASE).host;
});

// ============================================================
// LOGIN HANDLER
// ============================================================
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('btnSubmit');
  const btnText = document.getElementById('btnText');

  if (!email || !password) {
    showToast('⚠️', 'Validasi', 'Email dan kata sandi wajib diisi.');
    return;
  }

  // Loading state
  btn.disabled = true;
  btnText.innerHTML = '<div class="spin"></div>';
  document.getElementById('apiStatus').classList.remove('hidden');

  try {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: FETCH_HEADERS,
      body: formData,
    });

    // Handle HTTP error codes
    if (res.status === 401) {
      throw new Error('Email atau kata sandi salah. Periksa kembali.');
    }
    if (res.status === 403) {
      throw new Error('Akun Anda telah dinonaktifkan. Hubungi Owner.');
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Server error (${res.status})`);
    }

    const data = await res.json();

    // ✅ DIPERBAIKI: Ambil role dari data.user.role (bukan data.role)
    // Struktur respons API: { access_token, refresh_token, token_type, user: {id, nama, email, role} }
    const userRole = data.user?.role || _decodeRoleFromJwt(data.access_token) || 'KASIR';

    // Simpan sesi ke localStorage dengan struktur lengkap
    localStorage.setItem(AUTH_KEY, JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      user: {
        id: data.user?.id || '',
        nama: data.user?.nama || email.split('@')[0],
        email: data.user?.email || email,
        role: userRole,
      },
    }));

    // Redirect berdasarkan role
    redirectByRole(userRole);

  } catch (err) {
    const msg = err.message || 'Tidak dapat terhubung ke server.';

    // Bedakan error koneksi dari error kredensial
    if (err instanceof TypeError && err.message.includes('fetch')) {
      showToast('🔌', 'Koneksi Gagal',
        `Tidak bisa menjangkau ${new URL(API_BASE).host}. Pastikan server berjalan.`);
    } else {
      showToast('⚠️', 'Login Gagal', msg);
    }

    btn.disabled = false;
    btnText.textContent = 'Masuk ke Sistem';
    document.getElementById('apiStatus').classList.add('hidden');
  }
}

// ============================================================
// REDIRECT BERDASARKAN ROLE
// ============================================================
function redirectByRole(role) {
  if (role === 'OWNER') {
    window.location.replace('owner-dashboard.html');
  } else {
    // KASIR dan role lain → POS Terminal
    window.location.replace('pos-kasir.html');
  }
}

// ============================================================
// HELPER: Decode role dari JWT payload (fallback)
// ============================================================
function _decodeRoleFromJwt(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}

// ============================================================
// HELPER: Parse localStorage auth
// ============================================================
function parseLocalAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

// ============================================================
// UI HELPERS
// ============================================================
function togglePassword() {
  const input = document.getElementById('password');
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';

  // Ganti icon eye
  document.getElementById('eyeIcon').innerHTML = isHidden
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
         <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
         <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
         <circle cx="12" cy="12" r="3"/>`;
}

let toastTimer;
function showToast(icon, title, msg) {
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent = msg;
  document.getElementById('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4000);
}

function hideToast() {
  document.getElementById('toast').classList.remove('show');
}