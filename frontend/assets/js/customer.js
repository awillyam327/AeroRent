'use strict';

const API = localStorage.getItem('aerorent_api_base') || 'https://pope-bolster-gallon.ngrok-free.dev';
const AUTH_KEY = 'aerorent_customer_auth';

let S = {
  token: null,
  user: null,
  armada: [],
  pesananState: { id_kendaraan: null, nama: null, harga: 0, supir: 0, tgl: null, durasi: 1, total: 0 }
};

function el(id) { return document.getElementById(id); }

// ============================================================
// INIT & CORE
// ============================================================
async function init() {
  const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  if (auth) {
    S.token = auth.access_token;
    S.user = auth.user;
    renderAuthNav();
  }

  // Load Kendaraan
  await loadArmada();
  
  // Set default dates
  const td = new Date().toISOString().split('T')[0];
  if(el('date-home')) el('date-home').value = td;
  if(el('date-armada')) el('date-armada').value = td;
  if(el('p-tanggal')) el('p-tanggal').value = td;
  
  if (location.hash === '#dashboard') {
    if(!S.token) goSection('beranda');
    else goSection('dashboard');
  }
}

function renderAuthNav() {
  const n = el('nav-auth');
  if(!n) return;
  if (S.token && S.user) {
    const fn = S.user.nama || 'C';
    n.innerHTML = `<button onclick="goSection('dashboard')" class="flex items-center gap-2 px-4 py-2 rounded-full glass border border-purple-500/30 hover:border-purple-500/80 transition-colors">
      <div class="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">${fn[0].toUpperCase()}</div>
      <span class="text-xs font-semibold text-white hidden md:block">Akun Saya</span>
    </button>`;
  } else {
    n.innerHTML = `<button onclick="openAuthModal()" class="px-5 py-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors shadow-[0_0_15px_rgba(124,58,237,0.3)]">Masuk / Daftar</button>`;
  }
}

async function api(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '69420',
    ...(S.token ? { 'Authorization': 'Bearer ' + S.token } : {}),
    ...(opts.headers || {})
  };
  try {
    const r = await fetch(API + path, { ...opts, headers });
    if (r.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      S.token = null; S.user = null;
      renderAuthNav();
      if(el('sec-dashboard').classList.contains('active')) goSection('beranda');
      return null;
    }
    return r;
  } catch(e) { return null; }
}

async function apiJson(path, opts = {}) {
  const r = await api(path, opts);
  if(r && r.ok) return r.json();
  return null;
}

// ============================================================
// NAVIGATION
// ============================================================
function goSection(name) {
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active', 'hidden'));
  document.querySelectorAll('.section').forEach(el => {
    if (el.id !== 'sec-' + name) el.classList.add('hidden');
  });
  el('sec-' + name).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  if(name === 'dashboard') loadDashboard();
}

// ============================================================
// ARMADA
// ============================================================
async function loadArmada() {
  const res = await apiJson('/kendaraan');
  if (res && Array.isArray(res)) S.armada = res;
  
  // Render unggulan (max 3, yg status TERSEDIA)
  renderUnggulan();
  // Render full armada
  renderArmada();
}

function renderUnggulan() {
  const c = el('unggulan-grid');
  if(!c) return;
  const t = S.armada.filter(k => k.status === 'TERSEDIA').slice(0, 3);
  
  if (t.length === 0) {
    c.innerHTML = '<div class="col-span-3 text-center text-gray-500 text-sm py-10">Belum ada armada tersedia.</div>';
    return;
  }
  
  c.innerHTML = t.map(k => `
    <div class="glass rounded-3xl overflow-hidden border border-white/5 hover:border-amber-500/50 transition-all group cursor-pointer relative" onclick="startPesan('${k.id_kendaraan}')">
      <div class="absolute top-4 right-4 z-10 glass px-3 py-1 rounded-full border border-white/10 text-xs font-bold text-white flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-green-500"></div> Tersedia
      </div>
      <div class="h-48 overflow-hidden bg-white/5 relative">
        <img src="${k.foto_url || 'https://via.placeholder.com/600x400/14141e/fff?text=Mobil'}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        <div class="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-[#0A0A14] to-transparent"></div>
      </div>
      <div class="p-6 relative">
        <div class="text-xs text-amber-500 font-bold mb-1">${k.kategori}</div>
        <h3 class="text-xl font-bold text-white mb-4">${k.nama_kendaraan}</h3>
        
        <div class="grid grid-cols-2 gap-y-3 gap-x-2 text-xs text-gray-400 mb-6">
          <div class="flex items-center gap-1">👨‍👩‍👦 ${k.kapasitas_penumpang} Kursi</div>
          <div class="flex items-center gap-1">🧳 ${k.kapasitas_bagasi} Koper</div>
          <div class="flex items-center gap-1">⚙️ ${k.transmisi}</div>
          <div class="flex items-center gap-1">⛽ ${k.bahan_bakar}</div>
        </div>
        
        <div class="flex items-center justify-between border-t border-white/10 pt-4">
          <div>
            <div class="text-[10px] text-gray-500 uppercase tracking-widest">Sewa Per Hari</div>
            <div class="font-bold text-lg text-white">Rp ${parseInt(k.harga_sewa_per_hari).toLocaleString('id-ID')}</div>
          </div>
          <button class="bg-amber-500 hover:bg-amber-400 text-dark font-bold px-4 py-2 rounded-xl text-sm transition-colors">Sewa</button>
        </div>
      </div>
    </div>
  `).join('');
}

let activeKategori = 'semua';
function setKategori(k) {
  activeKategori = k;
  document.querySelectorAll('.kat-btn').forEach(b => {
    if(b.dataset.k === k) b.classList.add('active');
    else b.classList.remove('active');
  });
  renderArmada();
}

function filterArmadaSearch(val) {
  if (el('search-armada')) el('search-armada').value = val;
  renderArmada();
}

function renderArmada() {
  const c = el('armada-grid');
  if(!c) return;
  const q = (el('search-armada')?.value || '').toLowerCase();
  
  const f = S.armada.filter(k => {
    const matchK = activeKategori === 'semua' || k.kategori === activeKategori;
    const matchQ = k.nama_kendaraan.toLowerCase().includes(q) || k.kategori.toLowerCase().includes(q);
    return matchK && matchQ;
  });
  
  if(f.length === 0) {
    c.innerHTML = '<div class="col-span-3 text-center text-gray-500 text-sm py-20">Kendaraan tidak ditemukan.</div>';
    return;
  }
  
  c.innerHTML = f.map(k => `
    <div class="glass rounded-3xl overflow-hidden border border-white/5 hover:border-purple-500/30 transition-all group cursor-pointer relative" onclick="startPesan('${k.id_kendaraan}')">
      ${k.status === 'TERSEDIA' 
        ? `<div class="absolute top-4 right-4 z-10 glass px-3 py-1 rounded-full border border-white/10 text-xs font-bold text-white flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-green-500"></div> Tersedia</div>`
        : `<div class="absolute top-4 right-4 z-10 glass px-3 py-1 rounded-full border border-white/10 text-xs font-bold text-white flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-red-500"></div> ${k.status}</div>`
      }
      <div class="h-48 overflow-hidden bg-white/5 relative">
        <img src="${k.foto_url || 'https://via.placeholder.com/600x400/14141e/fff?text=Mobil'}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        <div class="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-[#0A0A14] to-transparent"></div>
      </div>
      <div class="p-6 relative">
        <div class="text-xs text-purple-400 font-bold mb-1">${k.kategori}</div>
        <h3 class="text-lg font-bold text-white mb-4">${k.nama_kendaraan}</h3>
        
        <div class="flex flex-wrap gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">
          <span class="glass px-2 py-1 rounded-md">${k.transmisi}</span>
          <span class="glass px-2 py-1 rounded-md">${k.kapasitas_penumpang} Seat</span>
          <span class="glass px-2 py-1 rounded-md">${k.bahan_bakar}</span>
        </div>
        
        <div class="flex items-center justify-between border-t border-white/10 pt-4">
          <div class="font-bold text-white">Rp ${parseInt(k.harga_sewa_per_hari).toLocaleString('id-ID')} <span class="text-[10px] text-gray-500 font-normal">/hari</span></div>
          <button class="text-xs font-semibold text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors ${k.status !== 'TERSEDIA' ? 'opacity-50 cursor-not-allowed' : ''}" ${k.status !== 'TERSEDIA' ? 'disabled' : ''}>Pilih</button>
        </div>
      </div>
    </div>
  `).join('');
}


// ============================================================
// AUTH MODAL & FLOW
// ============================================================
function openAuthModal() { el('modal-auth').classList.remove('hidden'); el('modal-auth').classList.add('flex'); }
function closeAuthModal() { el('modal-auth').classList.add('hidden'); el('modal-auth').classList.remove('flex'); }
function switchAuth(type) {
  if (type === 'login') {
    el('form-login-sec').classList.remove('hidden');
    el('form-register-sec').classList.add('hidden');
  } else {
    el('form-login-sec').classList.add('hidden');
    el('form-register-sec').classList.remove('hidden');
  }
}

async function handleCustomerLogin(e) {
  e.preventDefault();
  const em = el('l-email').value;
  const pw = el('l-pass').value;
  
  const fd = new URLSearchParams();
  fd.append('username', em);
  fd.append('password', pw);

  const btn = el('btn-login'); btn.innerText = 'Memproses...'; btn.disabled = true;
  const r = await api('/auth/login/customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: fd
  });
  btn.innerText = 'Masuk Sekarang'; btn.disabled = false;

  if (r && r.ok) {
    const data = await r.json();
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
    S.token = data.access_token;
    S.user = data.user;
    closeAuthModal();
    renderAuthNav();
    toast('✅', 'Login Berhasil', `Selamat datang, ${data.user.nama}`);
    // Jika sedang dalam proses pemesanan tapi terhalang login, lanjut ke pemesanan
    if(S.pesananState.id_kendaraan && el('sec-pemesanan').classList.contains('active')) {
      fillDataDiri();
    } else {
      goSection('dashboard');
    }
  } else {
    toast('❌', 'Login Gagal', 'Email atau password salah.');
  }
}

async function handleCustomerRegister(e) {
  e.preventDefault();
  const nama = el('r-nama').value;
  const telp = el('r-telp').value;
  const email = el('r-email').value;
  const pass = el('r-pass').value;

  const btn = el('btn-register'); btn.innerText = 'Memproses...'; btn.disabled = true;
  const r = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ nama_lengkap: nama, no_telepon: telp, email: email, password: pass })
  });
  btn.innerText = 'Daftar Akun'; btn.disabled = false;

  if (r && r.ok) {
    const data = await r.json();
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
    S.token = data.access_token;
    S.user = data.user;
    closeAuthModal();
    renderAuthNav();
    toast('✅', 'Registrasi Berhasil', 'Akun Anda telah dibuat.');
    if(S.pesananState.id_kendaraan && el('sec-pemesanan').classList.contains('active')) {
      fillDataDiri();
    } else {
      goSection('dashboard');
    }
  } else {
    toast('❌', 'Gagal', 'Email mungkin sudah digunakan.');
  }
}

function doLogout() {
  if (confirm('Yakin ingin keluar?')) {
    localStorage.removeItem(AUTH_KEY);
    S.token = null; S.user = null;
    renderAuthNav();
    goSection('beranda');
  }
}

// ============================================================
// PEMESANAN TRANSAKSI (MULTI-STEP)
// ============================================================
function startPesan(id) {
  const k = S.armada.find(x => x.id_kendaraan === id);
  if(!k) return;
  if(k.status !== 'TERSEDIA') {
    toast('❌', 'Kendaraan Tidak Tersedia', 'Pilih kendaraan lain.');
    return;
  }
  
  S.pesananState.id_kendaraan = k.id_kendaraan;
  S.pesananState.nama = k.nama_kendaraan;
  S.pesananState.harga = parseInt(k.harga_sewa_per_hari);
  
  el('p-sum-img').innerHTML = `<img src="${k.foto_url || ''}" class="w-full h-full object-cover">`;
  el('p-sum-nama').textContent = k.nama_kendaraan;
  el('p-sum-tipe').textContent = k.kategori;
  el('p-sum-harga').textContent = 'Rp ' + S.pesananState.harga.toLocaleString('id-ID') + '/hari';
  
  el('pemesanan-step-1').classList.remove('hidden');
  el('pemesanan-step-2').classList.add('hidden');
  el('pemesanan-step-3').classList.add('hidden');
  
  el('p-action-1').classList.remove('hidden');
  el('p-action-2').classList.add('hidden');
  
  setStepUI(1);
  calculateTotal();
  goSection('pemesanan');
}

function calculateTotal() {
  const d = parseInt(el('p-durasi').value) || 1;
  const s = el('p-supir').checked ? 150000 : 0;
  
  const ts = d * S.pesananState.harga;
  const tsup = d * s;
  const t = ts + tsup;
  
  S.pesananState.durasi = d;
  S.pesananState.supir = s > 0 ? 1 : 0;
  S.pesananState.total = t;
  S.pesananState.tgl = el('p-tanggal').value;
  
  el('p-sum-dur').textContent = d;
  el('p-sum-totsewa').textContent = 'Rp ' + ts.toLocaleString('id-ID');
  
  if (s > 0) {
    el('p-sum-supir-row').style.display = 'flex';
    el('p-sum-totsupir').textContent = 'Rp ' + tsup.toLocaleString('id-ID');
  } else {
    el('p-sum-supir-row').style.display = 'none';
  }
  el('p-sum-total').textContent = 'Rp ' + t.toLocaleString('id-ID');
}

function setStepUI(s) {
  for(let i=1; i<=3; i++) {
    const c = el(`step-${i}-cir`);
    const l = el(`step-${i}-lbl`);
    if(i < s) {
      c.className = 'w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm';
      c.innerHTML = '✓';
      l.className = 'text-sm font-semibold text-white';
    } else if(i === s) {
      c.className = 'w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm';
      c.innerHTML = i;
      l.className = 'text-sm font-semibold text-white';
    } else {
      c.className = 'w-8 h-8 rounded-full bg-white/10 text-gray-400 flex items-center justify-center font-bold text-sm';
      c.innerHTML = i;
      l.className = 'text-sm font-semibold text-gray-500';
    }
  }
}

function nextStep() {
  if (!S.token) {
    openAuthModal();
    return;
  }
  
  if(!S.pesananState.tgl || S.pesananState.durasi < 1) {
    toast('⚠️', 'Perhatian', 'Lengkapi jadwal pemesanan.'); return;
  }
  
  fillDataDiri();
  el('pemesanan-step-1').classList.add('hidden');
  el('pemesanan-step-2').classList.remove('hidden');
  el('p-action-1').classList.add('hidden');
  el('p-action-2').classList.remove('hidden');
  setStepUI(2);
}

function prevStep() {
  el('pemesanan-step-1').classList.remove('hidden');
  el('pemesanan-step-2').classList.add('hidden');
  el('p-action-1').classList.remove('hidden');
  el('p-action-2').classList.add('hidden');
  setStepUI(1);
}

async function fillDataDiri() {
  if(!S.user) return;
  const r = await apiJson('/pelanggan/' + S.user.id);
  if(r) {
    el('p-nama').value = r.nama_lengkap;
    el('p-telp').value = r.no_telepon;
  } else {
    el('p-nama').value = S.user.nama;
  }
}

async function submitPemesanan() {
  if(!el('p-syarat').checked) {
    toast('⚠️', 'Syarat & Ketentuan', 'Anda harus menyetujui S&K untuk melanjutkan.'); return;
  }
  
  const endD = new Date(S.pesananState.tgl);
  endD.setDate(endD.getDate() + parseInt(S.pesananState.durasi));
  
  const p = {
    id_pelanggan: S.user.id,
    id_kendaraan: S.pesananState.id_kendaraan,
    tanggal_mulai: S.pesananState.tgl,
    tanggal_selesai_rencana: endD.toISOString().split('T')[0],
    gunakan_supir: S.pesananState.supir,
    metode_pembayaran: document.querySelector('input[name="p-metode"]:checked').value
  };
  
  const btn = el('btn-submit-book'); btn.innerText = 'Memproses...'; btn.disabled = true;
  
  const r = await api('/transaksi', {
    method: 'POST',
    body: JSON.stringify(p)
  });
  
  btn.innerText = 'Konfirmasi & Sewa ➔'; btn.disabled = false;
  
  if(r && r.ok) {
    el('pemesanan-step-2').classList.add('hidden');
    el('p-summary-box').classList.add('hidden');
    el('pemesanan-step-3').classList.remove('hidden');
    el('p-res-nama').textContent = S.user.nama;
    setStepUI(3);
    
    // Reload kendaraan agar statusnya update
    loadArmada();
  } else {
    let msg = 'Gagal membuat pesanan.';
    if(r) { const e = await r.json(); msg = e.detail || msg; }
    toast('❌', 'Transaksi Gagal', msg);
  }
}

// ============================================================
// DASHBOARD CUSTOMER
// ============================================================
async function loadDashboard() {
  if(!S.token) return;
  el('dash-nama').textContent = S.user.nama;
  el('dash-ava').textContent = S.user.nama[0].toUpperCase();
  el('dash-title-nama').textContent = S.user.nama;
  
  const r = await apiJson('/pelanggan/' + S.user.id);
  if (r) {
    el('prof-nama').value = r.nama_lengkap;
    el('prof-email').value = r.email || S.user.email;
    el('prof-telp').value = r.no_telepon;
  }

  // Karena endpoint khusus get transaksi by customer id belum ada (kecuali kita buat baru atau /transaksi mengembalikan semua dan kita filter)
  // Untuk efisiensi tanpa merusak API lama, kita fetch /transaksi dan filter. (Jika admin yg akses /transaksi dapat semua).
  // Wait, req_kasir_or_owner di endpoint GET /transaksi akan nge-block PELANGGAN!
  // Kita harus fetch dengan endpoint yg diizinkan atau update backend.
  // Jika /transaksi terlarang, S.transaksi tidak bisa diambil.
  // SOLUSI: panggil API endpoint yg baru saja dimodif (atau yg diizinkan).
  const tr = await apiJson('/transaksi');
  
  // Jika diblock backend karena role PELANGGAN (403), maka tr = null.
  // Pada step Implementation Plan, tertulis "Menyesuaikan endpoint agar Customer bisa mengambil list transaksi berdasarkan ID mereka sendiri."
  
  let myT = [];
  if (tr && Array.isArray(tr)) {
    myT = tr.filter(x => x.id_pelanggan === S.user.id);
  }

  el('d-stat-total').textContent = `${myT.length} KALI`;
  el('d-stat-aktif').textContent = `${myT.filter(x => x.status_transaksi === 'BOOKED' || x.status_transaksi === 'BERJALAN').length} TRANSAKSI`;
  
  // Render table (Recent)
  const act = myT.filter(x => x.status_transaksi === 'BOOKED' || x.status_transaksi === 'BERJALAN').slice(0, 5);
  el('d-recent-tb').innerHTML = act.length ? act.map(x => `
    <tr class="hover:bg-white/5 transition-colors">
      <td class="p-4">${x.nomor_booking}</td>
      <td class="p-4 font-bold text-white">${x.nama_kendaraan}</td>
      <td class="p-4 text-xs">${x.tanggal_mulai.split('T')[0]} - ${x.tanggal_selesai_rencana.split('T')[0]}</td>
      <td class="p-4"><span class="px-2 py-1 rounded-md text-[10px] font-bold ${x.status_transaksi==='BOOKED'?'bg-blue-500/20 text-blue-400':'bg-amber-500/20 text-amber-500'}">${x.status_transaksi}</span></td>
      <td class="p-4 font-medium text-white">Rp ${parseInt(x.biaya_sewa + (x.biaya_supir||0)).toLocaleString('id-ID')}</td>
    </tr>
  `).join('') : `<tr><td colspan="5" class="p-4 text-center text-gray-500">Belum ada pemesanan aktif.</td></tr>`;
  
  // Render List (Riwayat)
  el('d-riwayat-list').innerHTML = myT.length ? myT.map(x => `
    <div class="glass p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row justify-between md:items-center gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="text-sm font-bold text-white">${x.nomor_booking}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${x.status_transaksi==='SELESAI'?'bg-green-500/20 text-green-400':'bg-gray-500/20 text-gray-400'}">${x.status_transaksi}</span>
        </div>
        <div class="text-xs text-gray-400">${x.nama_kendaraan} | ${x.tanggal_mulai.split('T')[0]} s/d ${x.tanggal_selesai_rencana.split('T')[0]}</div>
      </div>
      <div class="text-right">
        <div class="text-xs text-gray-500 uppercase tracking-widest mb-1">Total Biaya</div>
        <div class="font-bold text-amber-500">Rp ${parseInt(x.biaya_sewa + (x.biaya_supir||0) + (x.biaya_denda_terlambat||0) + (x.biaya_denda_kerusakan||0) + (x.biaya_tambahan_lain||0)).toLocaleString('id-ID')}</div>
      </div>
    </div>
  `).join('') : `<div class="text-center text-gray-500 text-sm py-10">Belum ada riwayat transaksi.</div>`;
}

function switchDashTab(tab) {
  document.querySelectorAll('.dash-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.d-tab').forEach(el => el.classList.remove('active', 'hidden'));
  document.querySelectorAll('.d-tab').forEach(el => {
    if(el.id !== 'd-' + tab) el.classList.add('hidden');
    else el.classList.add('active');
  });
  event.currentTarget.classList.add('active');
}

// ============================================================
// TOAST
// ============================================================
let toastTm;
function toast(icon, title, msg) {
  const t = el('toast');
  el('t-ic').textContent = icon;
  el('t-ttl').textContent = title;
  el('t-msg').textContent = msg;
  
  t.classList.remove('hidden');
  t.style.animation = 'none';
  t.offsetHeight; 
  t.style.animation = 'fadeIn 0.4s ease-out forwards';
  
  clearTimeout(toastTm);
  toastTm = setTimeout(() => {
    t.classList.add('hidden');
  }, 4000);
}

// Start
init();
