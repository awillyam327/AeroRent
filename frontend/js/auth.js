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
  qs('form-login').addEventListener('submit', handleLoginSubmit);
  qs('form-register').addEventListener('submit', handleRegisterSubmit);

  // Kalau sudah login, langsung lempar ke dashboard masing-masing.
  const auth = getAuth();
  if (auth?.user?.role) {
    location.href = getPostLoginRedirect(auth.user.role);
    return;
  }

  // Cek jika ada parameter verifikasi email di URL
  const params = new URLSearchParams(window.location.search);
  const verifyToken = params.get('verify');
  if (verifyToken) {
    handleVerifyEmail(verifyToken);
  }
}

async function handleVerifyEmail(token) {
  try {
    const result = await apiVerifyEmail(token);
    showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Verifikasi Berhasil', result.message || 'Email Anda telah diverifikasi.');
    // Bersihkan URL dari parameter verify
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (err) {
    showError(err.message || 'Gagal memverifikasi email.');
  }
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
  hideError();
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
    showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil Masuk', `Selamat datang, ${result.user.nama}.`);
    setTimeout(() => { location.href = getPostLoginRedirect(result.user.role); }, 600);
    return;
  } catch (staffErr) {
    // Email ini mungkin memang akun Customer, atau backend sedang tidak aktif — lanjut ke fallback.
  }

  try {
    // 2) Coba endpoint login customer asli
    const result = await apiLoginCustomer(email, password);
    setAuth(result);
    location.href = getPostLoginRedirect('CUSTOMER');
    return;
  } catch (custErr) {
    // Jika backend mengirim error spesifik (misal belum verifikasi), tampilkan error tersebut dan hentikan fallback.
    if (custErr.message && custErr.message.toLowerCase().includes('diverifikasi')) {
      btn.disabled = false;
      btn.textContent = 'Masuk Sekarang';
      showError(custErr.message);
      return;
    }
    // Jika bukan error verifikasi (misal salah password / API mati), lanjut ke mode demo.
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
    showToast('<i class="ph-fill ph-flask" style="color: #8B5CF6;"></i>', 'Mode Demo', 'Backend tidak tersedia — masuk memakai data demo lokal.');
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
  const passwordConfirm = qs('reg-password-confirm').value;
  const nik = qs('reg-nik').value.trim();
  const alamat = qs('reg-alamat').value.trim();
  const fotoKtp = qs('reg-ktp').files[0];
  const fotoSim = qs('reg-sim').files[0];

  if (!nama || !telp || !email || !password || !passwordConfirm) {
    showError('Semua field wajib diisi.');
    return;
  }
  
  if (password !== passwordConfirm) {
    showError('Konfirmasi password tidak cocok.');
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
  if (nik) fd.append('no_ktp', nik);
  if (alamat) fd.append('alamat', alamat);
  if (fotoKtp) fd.append('foto_ktp', fotoKtp);
  if (fotoSim) fd.append('foto_sim', fotoSim);

  try {
    const result = await apiRegisterCustomer(fd);
    
    // Jangan langsung login, tampilkan pesan sukses dan instruksi cek email
    btn.disabled = false;
    btn.textContent = 'Daftar Akun';
    qs('form-register').reset();
    document.getElementById('reg-ktp-label').textContent = 'Silakan pilih foto KTP Anda...';
    document.getElementById('reg-sim-label').textContent = 'Silakan pilih foto SIM A Anda...';
    const statusEl = document.getElementById('reg-ktp-status');
    if (statusEl) {
      statusEl.innerHTML = '';
      statusEl.className = 'hidden mt-2 text-sm text-center';
    }
    switchTab('login'); // Kembali ke form login
    
    showToast('<i class="ph-fill ph-envelope-simple" style="color: #3B82F6;"></i>', 'Cek Email Anda', result.message || 'Registrasi berhasil. Silakan periksa email Anda untuk verifikasi.');
    
    return;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Daftar Akun';
    showError(err.message || 'Terjadi kesalahan saat mendaftar.');
  }
}

async function scanRegKtp() {
  const inp = document.getElementById('reg-ktp');
  if (!inp.files.length) {
    showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Peringatan', 'Pilih foto KTP terlebih dahulu.');
    return;
  }
  
  let file = inp.files[0];
  const statusEl = document.getElementById('reg-ktp-status');
  const btn = document.getElementById('btn-scan-reg-ktp');
  
  statusEl.classList.remove('hidden', 'text-green-400', 'text-red-400');
  statusEl.classList.add('text-gray-500');
  statusEl.innerHTML = '<div class="spin inline-block mx-auto" style="width:12px;height:12px;border-width:2px;vertical-align:-2px;margin-right:6px;"></div>Mengompresi & Memproses OCR...';
  btn.disabled = true;
  
  try {
    file = await compressImageFile(file, 0.95); // Maks 950KB
  } catch (e) {
    console.error('Gagal kompresi:', e);
  }

  const fd = new FormData();
  fd.append('file', file);
  
  try {
    // API is global from api.js (API_BASE)
    const r = await fetch(`${API_BASE}/ocr/ktp`, {
      method: 'POST',
      body: fd
    });
    
    if (r.ok) {
      const res = await r.json();
      let msg = [];
      if (res.nik) { document.getElementById('reg-nik').value = res.nik; msg.push('NIK'); }
      if (res.nama) { document.getElementById('reg-nama').value = res.nama; msg.push('Nama'); }
      if (res.alamat) { document.getElementById('reg-alamat').value = res.alamat; msg.push('Alamat'); }
      
      if (msg.length > 0) {
        showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'OCR Berhasil', `Berhasil mengisi: ${msg.join(', ')}`);
        statusEl.innerHTML = '<i class="ph-fill ph-check-circle" style="color: #10B981;"></i> ' + msg.join(', ') + ' berhasil diisi.';
        statusEl.classList.add('text-green-400');
      } else {
        showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'OCR Selesai', 'KTP berhasil dibaca, tapi data tidak jelas.');
        statusEl.innerHTML = 'Data tidak jelas / blur.';
      }
    } else {
      let errMsg = 'Gagal membaca KTP.';
      try {
        const errRes = await r.json();
        if (errRes.detail) errMsg = typeof errRes.detail === 'string' ? errRes.detail : JSON.stringify(errRes.detail);
        else errMsg = 'Server membalas: ' + JSON.stringify(errRes);
      } catch (e) {
        errMsg += ' (Bukan JSON)';
      }
      statusEl.innerHTML = '<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i> ' + errMsg;
      statusEl.classList.add('text-red-400');
    }
  } catch (e) {
    statusEl.innerHTML = '<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i> Terjadi kesalahan jaringan.';
    statusEl.classList.add('text-red-400');
  }
  btn.disabled = false;
}

window.addEventListener('DOMContentLoaded', initAuthPage);
