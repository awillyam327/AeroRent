

const DEMO_ACCOUNTS = {
  'owner@aerorent.id':    { role: 'OWNER',    nama: 'Bapak Owner',  id: 'k-owner-001' },
  'kasir@aerorent.id':    { role: 'KASIR',    nama: 'Admin Kasir',  id: 'k-kasir-001' },
  'customer@aerorent.id': { role: 'CUSTOMER', nama: 'Budi Santoso', id: 'plg-demo-001' },
};

const REDIRECT_BY_ROLE = {
  OWNER:    'owner-dashboard.html',
  KASIR:    'pos-kasir.html',
  CUSTOMER: 'index.html', // Customer mendarat di Beranda setelah login, BUKAN langsung Dashboard
};

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
  if (qs('tab-register')) wireTabSwitcher();
  qs('form-login').addEventListener('submit', handleLoginSubmit);
  const formReg = qs('form-register');
  if (formReg) formReg.addEventListener('submit', handleRegisterSubmit);
  const auth = getAuth();
  if (auth?.user?.role) {
    location.href = getPostLoginRedirect(auth.user.role);
    return;
  }
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
  qs('form-login').reset();
  qs('form-register').reset();
}

function showError(msg) {
  const box = qs('auth-error');
  box.textContent = msg;
  box.classList.remove('hidden');
}
function hideError() { qs('auth-error').classList.add('hidden'); }

async function handleLoginSubmit(e) {
  e.preventDefault();
  hideError();

  const form = qs('form-login');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const email = qs('login-email').value.trim();
  const password = qs('login-password').value;
  const btn = qs('btn-login-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Memproses...';

  try {
    if (window.AUTH_MODE === 'KARYAWAN') {
      const result = await apiLoginStaff(email, password);
      setAuth(result);
      showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil Masuk', `Selamat datang, ${result.user.nama}.`);
      setTimeout(() => { location.href = getPostLoginRedirect(result.user.role); }, 600);
      return;
    }
    if (window.AUTH_MODE === 'CUSTOMER') {
      try {
        const result = await apiLoginCustomer(email, password);
        setAuth(result);
        location.href = getPostLoginRedirect('CUSTOMER');
        return;
      } catch (custErr) {
        if (custErr.message && custErr.message.toLowerCase().includes('koneksi')) {
            throw custErr;
        }
        if (custErr.message && custErr.message.toLowerCase().includes('diverifikasi')) {
          throw custErr;
        }
      }
    }
    if (!window.AUTH_MODE) {
      try {
        const result = await apiLoginStaff(email, password);
        setAuth(result);
        showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil Masuk', `Selamat datang, ${result.user.nama}.`);
        setTimeout(() => { location.href = getPostLoginRedirect(result.user.role); }, 600);
        return;
      } catch (staffErr) {
        if (staffErr.message && staffErr.message.toLowerCase().includes('koneksi')) throw staffErr;
      }
      try {
        const result = await apiLoginCustomer(email, password);
        setAuth(result);
        location.href = getPostLoginRedirect('CUSTOMER');
        return;
      } catch (custErr) {
        if (custErr.message && custErr.message.toLowerCase().includes('koneksi')) throw custErr;
        if (custErr.message && custErr.message.toLowerCase().includes('diverifikasi')) throw custErr;
      }
    }
    const demo = DEMO_ACCOUNTS[email.toLowerCase()];
    if (window.AUTH_MODE === 'KARYAWAN' && demo && demo.role === 'CUSTOMER') {
      throw new Error('Email atau password salah.');
    }
    if (window.AUTH_MODE === 'CUSTOMER' && demo && demo.role !== 'CUSTOMER') {
      throw new Error('Email atau password salah.');
    }

    if (demo && password.includes('123')) {
      const fakeAuth = {
        access_token: 'demo-token-' + demo.id,
        token_type: 'bearer',
        user: { id: demo.id, nama: demo.nama, email, role: demo.role },
      };
      setAuth(fakeAuth);
      showToast('<i class="ph-fill ph-flask" style="color: #8B5CF6;"></i>', 'Mode Demo', 'Backend tidak tersedia — masuk memakai data demo lokal.');
      setTimeout(() => { location.href = getPostLoginRedirect(demo.role); }, 1000);
      return;
    }

    throw new Error('Email atau password salah.');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Masuk Sekarang';
    showError(err.message || 'Gagal login.');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  hideError();

  const form = qs('form-register');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

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
    if (typeof showToast === 'function') showToast('<i class="ph-fill ph-wifi-slash"></i>', 'Koneksi Error', 'Koneksi terputus atau server tidak merespons.');
  }
  btn.disabled = false;
}

window.addEventListener('DOMContentLoaded', initAuthPage);
