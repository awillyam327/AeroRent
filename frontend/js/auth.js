/**
 * ==============================================================================
 * AeroRent — Logika Halaman Login & Daftar (login.html)
 *
 * Alur login:
 *   1. Coba /auth/login asli ke backend (berfungsi penuh untuk Owner & Kasir,
 *      karena tabel KARYAWAN sudah punya password_hash).
 *   2. Jika gagal (salah password ASLI, backend mati, atau akun Customer yang
 *      memang belum didukung backend), coba endpoint customer (akan gagal
 *      sampai backend menambahkannya).
 *   3. Jika masih gagal, fallback ke MODE DEMO lokal — supaya halaman tetap
 *      bisa didemokan end-to-end. Mode ini ditandai jelas lewat toast.
 * ==============================================================================
 */

/** Akun demo — dipakai HANYA sebagai fallback saat backend tidak tersedia. */
const DEMO_ACCOUNTS = {
  'owner@aerorent.id':    { role: 'OWNER',    nama: 'Bapak Owner',  id: 'k-owner-001' },
  'kasir@aerorent.id':    { role: 'KASIR',    nama: 'Admin Kasir',  id: 'k-kasir-001' },
  'customer@aerorent.id': { role: 'CUSTOMER', nama: 'Budi Santoso', id: 'plg-demo-001' },
};
// Catatan: mockup AI Studio memakai label "admin@aerorent.id" untuk akun Kasir,
// tapi seed data resmi di schema.sql memakai "kasir@aerorent.id" — di sini saya
// ikuti schema.sql supaya tombol demo tetap valid kalau dicoba ke backend asli.

const REDIRECT_BY_ROLE = {
  OWNER:    'owner-dashboard.html',
  KASIR:    'pos-kasir.html',
  CUSTOMER: 'index.html', // Customer mendarat di Beranda setelah login, BUKAN langsung Dashboard
};

/**
 * Tentukan tujuan setelah login. Untuk Customer: jika sebelumnya mereka
 * diarahkan ke login.html dari proses Sewa (lihat handleSewaClick di
 * vehicle.js), lanjutkan ke situ via query param ?redirect=. Selain itu,
 * default ke Beranda — bukan Dashboard (Dashboard baru relevan SETELAH ada
 * transaksi, sesuai alur mockup).
 */
function getPostLoginRedirect(role) {
  if (role === 'CUSTOMER') {
    const params = new URLSearchParams(location.search);
    const redirect = params.get('redirect');
    if (redirect) return decodeURIComponent(redirect);
  }
  return REDIRECT_BY_ROLE[role] || 'index.html';
}

let activeTab = 'login';

function initAuthPage() {
  renderToastMarkup('toast-root');
  wireTabSwitcher();
  wireDemoCards();
  qs('form-login').addEventListener('submit', handleLoginSubmit);
  qs('form-register').addEventListener('submit', handleRegisterSubmit);

  // Kalau sudah login, langsung lempar ke dashboard masing-masing.
  const auth = getAuth();
  if (auth?.user?.role) location.href = getPostLoginRedirect(auth.user.role);
}

function wireTabSwitcher() {
  qs('tab-login').addEventListener('click', () => switchTab('login'));
  qs('tab-register').addEventListener('click', () => switchTab('register'));
}

function switchTab(tab) {
  activeTab = tab;
  qs('tab-login').classList.toggle('tab-active', tab === 'login');
  qs('tab-register').classList.toggle('tab-active', tab === 'register');
  qs('form-login').classList.toggle('hidden', tab !== 'login');
  qs('form-register').classList.toggle('hidden', tab !== 'register');
  qs('auth-title').textContent = tab === 'login' ? 'MASUK AKUN' : 'DAFTAR BARU';
  qs('auth-subtitle').textContent = tab === 'login'
    ? 'Silakan masuk untuk menyewa armada AeroRent.'
    : 'Daftarkan identitas KTP Anda untuk memulai.';
  qs('demo-section').classList.toggle('hidden', tab !== 'login');
  hideError();
}

function wireDemoCards() {
  document.querySelectorAll('.demo-card').forEach((card) => {
    card.addEventListener('click', () => {
      qs('login-email').value = card.dataset.email;
      qs('login-password').value = 'Demo@123';
    });
  });
}

function showError(msg) {
  const box = qs('auth-error');
  box.textContent = msg;
  box.classList.remove('hidden');
}
function hideError() { qs('auth-error').classList.add('hidden'); }

/* ---------- LOGIN ---------- */

async function handleLoginSubmit(e) {
  e.preventDefault();
  hideError();
  const email = qs('login-email').value.trim();
  const password = qs('login-password').value;
  const btn = qs('btn-login-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Memproses...';

  try {
    // 1) Coba login staf asli (Owner/Kasir) ke backend nyata.
    const result = await apiLoginStaff(email, password);
    setAuth(result);
    showToast('✅', 'Berhasil Masuk', `Selamat datang, ${result.user.nama}.`);
    setTimeout(() => { location.href = getPostLoginRedirect(result.user.role); }, 600);
    return;
  } catch (staffErr) {
    // Email ini mungkin memang akun Customer, atau backend sedang tidak aktif — lanjut ke fallback.
  }

  try {
    // 2) Coba endpoint login customer asli (saat ini belum ada di backend — lihat api.js).
    const result = await apiLoginCustomer(email, password);
    setAuth(result);
    location.href = getPostLoginRedirect('CUSTOMER');
    return;
  } catch (custErr) {
    // Lanjut ke mode demo.
  }

  // 3) Mode demo lokal (backend belum mendukung / sedang tidak tersedia).
  const demo = DEMO_ACCOUNTS[email.toLowerCase()];
  if (demo && password.includes('123')) {
    const fakeAuth = {
      access_token: 'demo-token-' + demo.id,
      token_type: 'bearer',
      user: { id: demo.id, nama: demo.nama, email, role: demo.role },
    };
    setAuth(fakeAuth);
    showToast('🧪', 'Mode Demo', 'Backend tidak tersedia — masuk memakai data demo lokal.');
    setTimeout(() => { location.href = getPostLoginRedirect(demo.role); }, 700);
    return;
  }

  btn.disabled = false;
  btn.textContent = 'Masuk Sekarang';
  showError('Email atau password salah. Untuk versi demo, gunakan salah satu akun di bawah dengan password mengandung "123".');
}

/* ---------- DAFTAR (Customer self-registration) ---------- */

async function handleRegisterSubmit(e) {
  e.preventDefault();
  hideError();
  const nama = qs('reg-nama').value.trim();
  const telp = qs('reg-telp').value.trim();
  const email = qs('reg-email').value.trim();
  const password = qs('reg-password').value;
  const fotoKtp = qs('reg-ktp').files[0];

  if (!nama || !telp || !email || !password) {
    showError('Semua field wajib diisi.');
    return;
  }

  const btn = qs('btn-register-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Memproses...';

  const fd = new FormData();
  fd.append('nama_lengkap', nama);
  fd.append('no_telepon', telp);
  fd.append('email', email);
  fd.append('password', password);
  if (fotoKtp) fd.append('foto_ktp', fotoKtp);

  try {
    // Endpoint ini BELUM ADA di backend — lihat catatan di api.js.
    const result = await apiRegisterCustomer(fd);
    setAuth(result);
    location.href = getPostLoginRedirect('CUSTOMER');
    return;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Daftar Akun';
    showError(err.message || 'Terjadi kesalahan saat mendaftar.');
  }
}

window.addEventListener('DOMContentLoaded', initAuthPage);
