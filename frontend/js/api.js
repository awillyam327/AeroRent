

const API_BASE = 'https://aero-rent-twvb.vercel.app';
const AUTH_KEY = 'aerorent_auth';

function getAuth() {
  try { 
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); 
    if (auth && auth.user && auth.user.role === 'PELANGGAN') {
      auth.user.role = 'CUSTOMER';
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    }
    return auth;
  }
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

async function apiFetch(path, options = {}, loginPath = '/login.html') {
  const token = getToken();
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const res = await fetch(API_BASE + path, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.status === 401) {
      clearAuth();
      location.href = loginPath;
      return null;
    }
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[api] Network error saat memanggil ${path}:`, err.message);
    if (typeof showToast === 'function') {
        showToast('<i class="ph ph-wifi-slash"></i>', 'Koneksi Error', 'Koneksi terputus atau server tidak merespons. Silakan periksa jaringan Anda.');
    } else {
        alert('Koneksi terputus atau server tidak merespons. Silakan periksa jaringan Anda.');
    }
    return null;
  }
}

async function apiJson(path, options = {}, loginPath = '/login.html') {
  const res = await apiFetch(path, options, loginPath);
  if (res && res.ok) {
    try { return await res.json(); } catch (_) { return null; }
  }
  return null;
}

async function apiLoginStaff(email, password) {
  const body = new URLSearchParams();
  body.append('username', email);
  body.append('password', password);

  let res;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
    });
  } catch (err) {
    if (typeof showToast === 'function') showToast('<i class="ph ph-wifi-slash"></i>', 'Koneksi Error', 'Gagal menghubungi server.');
    throw new Error('Koneksi terputus atau server tidak merespons.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Email atau password salah.');
  }
  return res.json(); // { access_token, refresh_token, token_type, user }
}

async function apiLoginCustomer(email, password) {
  let res;
  try {
    res = await fetch(`${API_BASE}/auth/login-customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    if (typeof showToast === 'function') showToast('<i class="ph ph-wifi-slash"></i>', 'Koneksi Error', 'Gagal menghubungi server.');
    throw new Error('Koneksi terputus atau server tidak merespons.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Login gagal.');
  }
  return res.json();
}

async function apiRegisterCustomer(formData) {
  let res;
  try {
    res = await fetch(`${API_BASE}/auth/register-customer`, {
      method: 'POST',
      body: formData, // multipart/form-data (ada upload foto KTP)
    });
  } catch (err) {
    if (typeof showToast === 'function') showToast('<i class="ph ph-wifi-slash"></i>', 'Koneksi Error', 'Gagal menghubungi server.');
    throw new Error('Koneksi terputus atau server tidak merespons.');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Pendaftaran gagal (Terjadi kesalahan server)');
  }
  return res.json();
}

async function apiVerifyEmail(token) {
  let res;
  try {
    res = await fetch(`${API_BASE}/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    if (typeof showToast === 'function') showToast('<i class="ph ph-wifi-slash"></i>', 'Koneksi Error', 'Gagal menghubungi server.');
    throw new Error('Koneksi terputus atau server tidak merespons.');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Verifikasi gagal atau token tidak valid.');
  }
  return res.json();
}
