'use strict';
// ============================================================
// KONFIGURASI NGROK
// ============================================================
// Ganti URL ini dengan URL Ngrok milik Anda
// Gunakan localhost untuk pengujian di laptop sendiri
// <i class="ph-fill ph-check-circle" style="color: #10B981;"></i> BENAR — baca dari localStorage agar sinkron dengan index.html
// Tidak perlu update manual setiap kali URL Ngrok berubah
const API = localStorage.getItem('aerorent_api_base') || 'https://aero-rent-twvb.vercel.app';
const AUTH_KEY = 'aerorent_auth';

// ============================================================
// DEMO DATA (fallback jika API tidak tersedia)
// ============================================================
const DEMO = {
  karyawan: [],
  transaksi: [],
  laporan: {
    ringkasan: { total_pendapatan_kotor: 0, total_biaya_operasional: 0, profit_bersih: 0, margin_persen: 0, jumlah_transaksi_selesai: 0 },
    tren_bulanan: [],
    top_5_kendaraan: []
  },
  armada: {
    status_armada: { TERSEDIA: 0, DISEWA: 0, PERAWATAN: 0 },
    armada_detail: []
  },
  pengeluaran: [],
};

// ============================================================
// STATE
// ============================================================
let S = {
  token: null, user: null,
  currentSection: 'dashboard',
  laporan: null, armada: null,
  transaksi: [], karyawan: [],
  pengeluaran: [],
  pesananFilter: 'semua',
  chartRevenue: null,
  editKaryId: null,
};

// ============================================================
// INIT
// ============================================================
async function init() {
  const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  if (auth) { S.token = auth.access_token; S.user = auth.user; }
  if (!auth?.access_token) { location.href = 'login.html'; return; }

  const nama = S.user?.nama || 'Bapak Owner';
  el('sb-nama').textContent = nama;
  el('sb-avatar').textContent = nama[0].toUpperCase();

  // Set default dates to 1st and last day of current local month
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  
  el('lk-dari').value = `${y}-${m}-01`;
  el('lk-sampai').value = `${y}-${m}-${lastDay}`;
  
  // For other inputs, we can just use the current day
  const todayStr = `${y}-${m}-${String(now.getDate()).padStart(2, '0')}`;
  el('po-tanggal').value = todayStr;
  el('mk-tgl').value = todayStr;

  await loadDashboard();
}

// ============================================================
// API HELPER
// ============================================================
function apiHeaders(opts = {}) {
  return {
    'Content-Type': 'application/json',
    ...(S.token ? { 'Authorization': 'Bearer ' + S.token } : {}),
    ...(opts.headers || {})
  };
}

async function api(path, opts = {}) {
  try {
    const r = await fetch(API + path, { ...opts, headers: apiHeaders(opts) });

    if (r.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      // Hanya lakukan reload jika sebelumnya token ada (berarti token kedaluwarsa)
      if (S.token) {
        S.token = null;
        S.user = null;
        location.reload();
      } else {
        // Jika memang dari awal tidak ada token, hentikan loop dan beri peringatan
        toast('<i class="ph ph-lock"></i>', 'Mode Demo Aktif', 'Belum login. Data yang tampil adalah simulasi.');
      }
      return null;
    }

    return r;
  } catch (err) {
    if (err.name === 'TypeError' || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('fetch')) {
      toast('<i class="ph-fill ph-wifi-slash" style="color: #EF4444;"></i>', 'Koneksi Error', 'Terjadi kesalahan jaringan.');
    }
    return null;
  }
}

async function apiJson(path, opts = {}) {
  const r = await api(path, opts);
  if (r && r.ok) return r.json();
  return null;
}

// ============================================================
// NAVIGASI SECTIONS
// ============================================================
function goSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  el(`sec-${name}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.section === name);
  });
  S.currentSection = name;
  closeMobileSidebar();

  if (name === 'laporan') loadLaporan();
  if (name === 'karyawan') loadKaryawan();
  if (name === 'kendaraan') loadKendaraan();
  if (name === 'operasional') loadPengeluaran();
  if (name === 'statistik') loadStatistik();
  if (name === 'pesanan') loadPesanan();
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  // Stat cards
  const armData = await apiJson('/laporan/armada') || DEMO.armada;
  const lapData = await apiJson('/laporan/keuangan?dari=' + el('lk-dari').value + '&sampai=' + el('lk-sampai').value) || DEMO.laporan;
  S.laporan = lapData;
  S.armada = armData;

  const ring = lapData.ringkasan || DEMO.laporan.ringkasan;
  const armSt = armData.status_armada || DEMO.armada.status_armada;
  const total = Object.values(armSt).reduce((a, b) => a + b, 0) || 1;
  const disewa = armSt.DISEWA || 0;

  el('dk-omset').textContent = rp(ring.total_pendapatan_kotor);
  el('dk-okupansi').textContent = ((disewa / total) * 100).toFixed(1) + '%';
  el('dk-sukses').textContent = ring.jumlah_transaksi_selesai + ' Sewa';

  // Tabel penyewaan selesai terbaru dari demo/API
  const trxData = await apiJson('/transaksi?status=SELESAI&limit=5') || [];
  const rows = trxData.length ? trxData : DEMO.transaksi.filter(t => t.status === 'SELESAI').slice(0, 5);
  S.transaksi = trxData.length ? trxData : DEMO.transaksi;

  const tb = el('dk-table');
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="5" class="text-center text-gray-600 py-8 text-sm">
      Belum ada rental yang diselesaikan dalam basis data.</td></tr>`;
  } else {
    tb.innerHTML = rows.map(t => `
      <tr>
        <td><span class="font-mono text-xs text-gray-400">${t.booking || t.id || '—'}</span></td>
        <td class="font-medium">${t.pelanggan || '—'}</td>
        <td class="text-gray-400 text-xs">${t.kendaraan || '—'}</td>
        <td class="font-bold" style="color:#F59E0B;">${rp(t.total || t.total_biaya || 0)}</td>
        <td class="text-gray-500 text-xs">${fmtDT(t.mulai || t.tanggal_mulai)}</td>
      </tr>`).join('');
  }
}

// ============================================================
// LAPORAN KEUANGAN
// ============================================================
async function loadLaporan() {
  const dari = el('lk-dari').value;
  const sampai = el('lk-sampai').value;
  if (!dari || !sampai) return;

  el('lk-table').innerHTML = `<tr><td colspan="5" class="text-center py-6"><div class="spin mx-auto"></div></td></tr>`;

  const data = await apiJson(`/laporan/keuangan?dari=${dari}&sampai=${sampai}`) || DEMO.laporan;
  S.laporan = data;
  const ring = data.ringkasan || DEMO.laporan.ringkasan;

  el('lk-pend').textContent = rp(ring.total_pendapatan_kotor);
  el('lk-peng').textContent = rp(ring.total_biaya_operasional);
  el('lk-peng-sub').textContent = `Pengeluaran tercatat · Rp ${ring.total_biaya_operasional > 0 ? (ring.total_biaya_operasional / 1e6).toFixed(2) + 'jt' : '0'}`;
  el('lk-profit').textContent = rp(ring.profit_bersih);
  el('lk-margin').textContent = `↑ Margin bersih: ${ring.margin_persen}%`;
  el('lk-profit').style.color = ring.profit_bersih >= 0 ? '#C084FC' : '#FCA5A5';

  // ---- Chart Revenue (Chart.js) ----
  const tren = data.tren_bulanan || DEMO.laporan.tren_bulanan;
  const labels = tren.map(t => {
    const [y, m] = t.bulan.split('-');
    const bln = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${bln[parseInt(m)]} ${y}`;
  });
  const values = tren.map(t => t.pendapatan);

  if (S.chartRevenue) S.chartRevenue.destroy();
  const ctx = document.getElementById('chart-revenue').getContext('2d');
  S.chartRevenue = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Pendapatan (Rp)',
        data: values,
        backgroundColor: 'rgba(124,58,237,0.45)',
        borderColor: '#7C3AED',
        borderWidth: 1.5,
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(245,158,11,0.55)',
        hoverBorderColor: '#F59E0B',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(ctx.parsed.y)
          },
          backgroundColor: '#0D0D1C',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#9CA3AF',
          bodyColor: '#F59E0B',
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B7280', font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#6B7280', font: { size: 11 },
            callback: v => 'Rp ' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'jt' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'rb' : v)
          }
        }
      }
    }
  });

  // ---- Tabel Tren Bulanan ----
  const TARGET = ring.total_pendapatan_kotor / (tren.length || 1);
  const tb = el('lk-table');
  if (!tren.length) {
    tb.innerHTML = `<tr><td colspan="5" class="text-center text-gray-600 py-8">Tidak ada data dalam periode ini.</td></tr>`;
  } else {
    tb.innerHTML = tren.map((t, i) => {
      const [y, m] = t.bulan.split('-');
      const bln = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const isLatest = i === tren.length - 1;
      const peng = (data.distribusi_pengeluaran ? Object.values(data.distribusi_pengeluaran).reduce((a, b) => a + b, 0) : 0) / (tren.length || 1);
      const profit = t.pendapatan - peng;
      const tercapai = t.pendapatan >= TARGET;
      return `
        <tr>
          <td>
            <div class="font-medium">${bln[parseInt(m)]} ${y}</div>
            ${isLatest ? '<span class="badge b-aktif-kary" style="font-size:9px;">Aktif</span>' : ''}
          </td>
          <td>
            <span class="${tercapai ? 'text-green-400' : 'text-yellow-400'} font-semibold text-xs flex items-center gap-1">
              ${tercapai ? '✓ Tercapai' : '⚠ Low Season'}
            </span>
          </td>
          <td class="font-bold text-white">${rp(t.pendapatan)}</td>
          <td class="text-red-400">${rp(peng)}</td>
          <td class="font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}">${rp(profit)}</td>
        </tr>`;
    }).join('');
  }

  // ---- Top 5 Kendaraan ----
  const topKend = data.top_5_kendaraan || DEMO.laporan.top_5_kendaraan;
  el('lk-top-kend').innerHTML = !topKend.length
    ? `<tr><td colspan="4" class="text-center text-gray-600 py-6">Belum ada data.</td></tr>`
    : topKend.map((k, i) => `
        <tr>
          <td><span class="w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold"
            style="background:rgba(245,158,11,.15);color:#F59E0B;">${i + 1}</span></td>
          <td class="font-medium">${k.nama}</td>
          <td class="text-gray-400 text-center">${k.jumlah_sewa}×</td>
          <td class="font-bold" style="color:#F59E0B;">${rp(k.total)}</td>
        </tr>`).join('');
}

// ============================================================
// PENCATATAN OPERASIONAL
// ============================================================
async function loadPengeluaran() {
  const data = await apiJson('/pengeluaran') || DEMO.pengeluaran;
  S.pengeluaran = Array.isArray(data) ? data : DEMO.pengeluaran;
  renderPengeluaranTable();
}

function renderPengeluaranTable() {
  const tb = el('po-table');
  const list = S.pengeluaran;
  const total = list.reduce((s, p) => s + (p.jumlah || 0), 0);
  el('po-total').textContent = rp(total);

  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="5" class="text-center text-gray-600 py-8 text-sm">Belum ada riwayat pengeluaran yang dicatat.</td></tr>`;
    return;
  }
  tb.innerHTML = list.map(p => `
    <tr>
      <td class="text-xs text-gray-400 whitespace-nowrap">${fmtD(p.tanggal || p.tanggal_pengeluaran)}</td>
      <td><span class="badge" style="background:rgba(124,58,237,.12);color:#C084FC;border:1px solid rgba(124,58,237,.25);">${p.kategori}</span></td>
      <td class="text-gray-300 text-xs max-w-xs truncate">${p.deskripsi}</td>
      <td class="font-bold text-red-400 whitespace-nowrap">${rp(p.jumlah)}</td>
      <td>
        <button onclick="deletePengeluaran('${p.id || p.id_pengeluaran}')"
                class="btn-r px-2 py-1 rounded-lg text-xs">Hapus</button>
      </td>
    </tr>`).join('');
}

async function savePengeluaran() {
  const tgl = el('po-tanggal').value;
  const kat = el('po-kategori').value;
  const nom = parseFloat(el('po-nominal').value || '0');
  const ket = el('po-ket').value.trim();

  if (!tgl || !nom || !ket) {
    toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Validasi', 'Tanggal, nominal, dan keterangan wajib diisi.'); return;
  }
  if (nom <= 0) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Validasi', 'Nominal harus lebih dari 0.'); return; }

  let saved = false;
  // Backend menggunakan Form(...), jadi kita harus kirim FormData — bukan JSON
  if (S.token) {
    try {
      const fd = new FormData();
      fd.append('deskripsi', ket);
      fd.append('kategori', kat);
      fd.append('jumlah', nom.toString());
      fd.append('tanggal_pengeluaran', tgl.split('T')[0]);

      const r = await fetch(API + '/pengeluaran', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + S.token
        },
        body: fd
      });
      saved = r && r.ok;
    } catch (err) {
      if (err.name === 'TypeError' || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('fetch')) {
        toast('<i class="ph-fill ph-wifi-slash" style="color: #EF4444;"></i>', 'Koneksi Error', 'Terjadi kesalahan jaringan.');
        return;
      }
    }
  }

  // Simpan ke state lokal untuk tampilan
  const newEntry = {
    id: 'po-local-' + Date.now(),
    kategori: kat, deskripsi: ket, jumlah: nom,
    tanggal_pengeluaran: tgl, created_at: new Date().toISOString()
  };
  S.pengeluaran.unshift(newEntry);
  renderPengeluaranTable();

  el('po-nominal').value = '';
  el('po-ket').value = '';
  toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', saved ? 'Tersimpan ke Server' : 'Disimpan Lokal', `Pengeluaran Rp ${rp(nom)} berhasil dicatat.`);
}

async function deletePengeluaran(id) {
  if (!confirm('Hapus catatan pengeluaran ini?')) return;
  if (S.token && !id.startsWith('po-local-')) {
    const r = await api(`/pengeluaran/${id}`, { method: 'DELETE' });
    if (!r || !r.ok) { toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Tidak dapat menghapus data.'); return; }
  }
  S.pengeluaran = S.pengeluaran.filter(p => (p.id || p.id_pengeluaran) !== id);
  renderPengeluaranTable();
  toast('🗑️', 'Dihapus', 'Catatan pengeluaran berhasil dihapus.');
}

// ============================================================
// STATISTIK KENDARAAN
// ============================================================
async function loadStatistik() {
  const data = await apiJson('/laporan/armada') || DEMO.armada;
  S.armada = data;
  const grid = el('stat-grid');
  const list = data.armada_detail || DEMO.armada.armada_detail;

  if (!list.length) {
    grid.innerHTML = `<div class="col-span-full text-center text-gray-600 py-12">Tidak ada data armada.</div>`;
    return;
  }

  // Urutkan berdasarkan sewa_bulan_ini DESC
  const sorted = [...list].sort((a, b) => b.sewa_bulan_ini - a.sewa_bulan_ini);

  grid.innerHTML = sorted.map((k, i) => {
    const rankColor = ['#F59E0B', '#9CA3AF', '#CD7F32', 'rgba(255,255,255,.3)'][Math.min(i, 3)];
    const stBadge = k.status === 'TERSEDIA' ? 'b-tersedia' :
      k.status === 'DISEWA' ? 'b-disewa' : 'b-perawatan';
    const stLabel = k.status === 'TERSEDIA' ? 'Tersedia' :
      k.status === 'DISEWA' ? 'Sedang Disewa' : 'Perawatan';
    return `
      <div class="glass rounded-2xl overflow-hidden group hover:-translate-y-1 transition-transform duration-200">
        <div class="relative h-36 overflow-hidden" style="background:rgba(255,255,255,.03);">
          <div class="absolute top-2 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
               style="background:${rankColor};color:#0A0A14;">
            ${i + 1}
          </div>
          <span class="absolute top-2 right-2 badge ${stBadge}">${stLabel}</span>
          ${k.foto
        ? `<img src="${k.foto}" alt="${k.nama}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300">`
        : `<div class="w-full h-full flex items-center justify-center text-4xl text-gray-700"><i class="ph ph-car"></i></div>`}
          <div class="absolute inset-0" style="background:linear-gradient(to top, rgba(10,10,20,.7) 0%, transparent 60%);"></div>
        </div>
        <div class="p-4">
          <div class="font-bebas text-lg tracking-wide text-white leading-tight">${k.nama}</div>
          <div class="text-xs text-gray-500 mb-3">${(k.tipe || '').replace('_', ' ')}</div>
          <div class="space-y-1.5">
            <div class="flex justify-between text-xs">
              <span class="text-gray-500">Total Di-Sewa</span>
              <span class="font-semibold text-white">${k.sewa_bulan_ini} kali</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-500">Pendapatan Kotor</span>
              <span class="font-bold" style="color:#F59E0B;">${rp(k.pendapatan_bulan_ini)}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-500">Tarif Harian</span>
              <span class="text-gray-300">${rp(k.harga_harian)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
// MANAJEMEN KENDARAAN
// ============================================================
async function loadKendaraan() {
  const sort = document.getElementById('sk-sort') ? document.getElementById('sk-sort').value : '';
  const order = document.getElementById('sk-order') ? document.getElementById('sk-order').value : 'asc';
  const data = await apiJson(`/kendaraan?sort_by=${sort}&order=${order}`) || [];
  S.kendaraan = Array.isArray(data) ? data : [];
  renderKendaraanTable();
}

function renderKendaraanTable() {
  const tb = el('kend-table');
  if (!S.kendaraan || !S.kendaraan.length) {
    tb.innerHTML = `<tr><td colspan="8" class="text-center text-gray-600 py-8">Tidak ada data kendaraan.</td></tr>`;
    return;
  }
  tb.innerHTML = S.kendaraan.map(k => {
    const plat = k.nomor_plat || k.plat_nomor || '-';
    return `
      <tr>
        <td>
          <span class="font-mono text-xs text-gray-500">${k.id_kendaraan.split('-')[0] + '-' + k.id_kendaraan.split('-')[1].substring(0,4)}</span>
        </td>
        <td>
          <div class="font-semibold text-sm">${k.nama_kendaraan}</div>
          <div class="text-xs text-gray-500">${(k.tipe_kendaraan||'').replace('_', ' ')} • ${k.tahun}</div>
        </td>
        <td class="font-semibold">${plat}</td>
        <td class="text-sm">${rp(k.harga_sewa_harian)}</td>
        <td class="text-sm">${rp(k.harga_supir_harian)}</td>
        <td>
          <span class="badge" style="background:rgba(59,130,246,.12);color:#60A5FA;">
            ID: ${k.traccar_device_id || 'Belum'}
          </span>
        </td>
        <td>
          <span class="badge ${k.status === 'TERSEDIA' ? 'b-aktif' : k.status === 'DISEWA' ? 'b-disewa' : 'b-nonaktif'}">${k.status}</span>
        </td>
        <td>
          <div class="flex gap-1.5">
            <button onclick="openKendaraanModal('${k.id_kendaraan}')"
                    class="btn-a px-3 py-1.5 rounded-xl text-xs">Edit</button>
            <button onclick="deleteKendaraan('${k.id_kendaraan}')"
                    class="btn-r px-3 py-1.5 rounded-xl text-xs">Hapus</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function openKendaraanModal(id = null) {
  S.editKendId = id || null;
  el('mkend-title').textContent = id ? 'Edit Data Kendaraan' : 'Tambah Kendaraan';
  if (id) {
    const k = S.kendaraan.find(x => x.id_kendaraan === id);
    if (k) {
      el('mkend-nama').value = k.nama_kendaraan;
      el('mkend-merk').value = k.merk || '';
      el('mkend-model').value = k.model || '';
      el('mkend-tahun').value = k.tahun || new Date().getFullYear();
      el('mkend-plat').value = k.nomor_plat || k.plat_nomor || '';
      el('mkend-tipe').value = k.tipe_kendaraan || '5_SEATER';
      el('mkend-status').value = k.status || 'TERSEDIA';
      el('mkend-sewa').value = k.harga_sewa_harian || 0;
      el('mkend-supir').value = k.harga_supir_harian || 0;
      el('mkend-traccar').value = k.traccar_device_id || '';
    }
  } else {
    el('mkend-nama').value = ''; el('mkend-merk').value = ''; el('mkend-model').value = '';
    el('mkend-tahun').value = new Date().getFullYear(); el('mkend-plat').value = '';
    el('mkend-tipe').value = '5_SEATER'; el('mkend-status').value = 'TERSEDIA';
    el('mkend-sewa').value = ''; el('mkend-supir').value = ''; el('mkend-traccar').value = '';
  }
  el('modal-kendaraan').classList.remove('hidden');
}

function closeKendaraanModal() {
  el('modal-kendaraan').classList.add('hidden');
  S.editKendId = null;
}

async function saveKendaraan() {
  const payload = {
    nama_kendaraan: el('mkend-nama').value.trim(),
    merk: el('mkend-merk').value.trim() || undefined,
    model: el('mkend-model').value.trim() || undefined,
    tahun: parseInt(el('mkend-tahun').value) || new Date().getFullYear(),
    nomor_plat: el('mkend-plat').value.trim(),
    tipe_kendaraan: el('mkend-tipe').value,
    status: el('mkend-status').value,
    harga_sewa_harian: parseFloat(el('mkend-sewa').value || '0'),
    harga_supir_harian: parseFloat(el('mkend-supir').value || '0'),
    traccar_device_id: el('mkend-traccar').value.trim() || null
  };

  if (!payload.nama_kendaraan || !payload.nomor_plat) {
    toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Validasi', 'Nama dan plat nomor wajib diisi.');
    return;
  }

  let ok = false;
  if (S.editKendId) {
    const r = await api(`/kendaraan/${S.editKendId}`, { method: 'PUT', body: JSON.stringify(payload) });
    ok = r && r.ok;
  } else {
    const r = await api('/kendaraan', { method: 'POST', body: JSON.stringify(payload) });
    ok = r && r.ok;
  }

  if (ok) {
    await loadKendaraan();
    closeKendaraanModal();
    toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil', `Kendaraan berhasil ${S.editKendId ? 'diperbarui' : 'ditambahkan'}.`);
  } else {
    toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Terjadi kesalahan saat menyimpan kendaraan.');
  }
}

async function deleteKendaraan(id) {
  if (!confirm('Yakin ingin menghapus kendaraan ini?')) return;
  const r = await api(`/kendaraan/${id}`, { method: 'DELETE' });
  if (r && r.ok) {
    await loadKendaraan();
    toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil', 'Kendaraan dihapus.');
  } else {
    toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Gagal menghapus. Mungkin ada transaksi aktif.');
  }
}

// ============================================================
// MANAJEMEN KARYAWAN
// ============================================================
async function loadKaryawan() {
  const data = await apiJson('/karyawan') || DEMO.karyawan;
  S.karyawan = Array.isArray(data) ? data : DEMO.karyawan;
  renderKaryawanTable();
}

function renderKaryawanTable() {
  const tb = el('kary-table');
  if (!S.karyawan.length) {
    tb.innerHTML = `<tr><td colspan="7" class="text-center text-gray-600 py-8">Tidak ada data karyawan.</td></tr>`;
    return;
  }
  tb.innerHTML = S.karyawan.map((k, i) => {
    const nip = k.id ? k.id.toUpperCase().substring(0, 8) : `EMP-${String(i + 1).padStart(3, '0')}`;
    const aktif = k.is_aktif === 1 || k.is_aktif === true;
    return `
      <tr>
        <td>
          <span class="font-mono text-xs text-gray-500">${nip}</span>
        </td>
        <td>
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                 style="background:rgba(245,158,11,.15);color:#F59E0B;">${(k.nama || k.nama_lengkap || '?')[0].toUpperCase()}</div>
            <div>
              <div class="font-semibold text-sm">${k.nama || k.nama_lengkap || '—'}</div>
              <div class="text-xs text-gray-500">${k.email || '—'}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge" style="background:rgba(59,130,246,.12);color:#60A5FA;border:1px solid rgba(59,130,246,.25);">
            ${k.role === 'OWNER' ? 'Owner' : k.role === 'SUPIR' ? 'Supir' : 'Kasir'}
          </span>
        </td>
        <td class="text-xs text-gray-400">${fmtD(k.tanggal_masuk)}</td>
        <td class="font-semibold text-sm">${rp(k.gaji || k.gaji_per_bulan || 0)}</td>
        <td>
          <span class="badge ${aktif ? 'b-aktif' : 'b-disewa'}">${aktif ? 'Aktif' : 'Nonaktif'}</span>
        </td>
        <td>
          <div class="flex gap-1.5">
            <button onclick="openKaryawanModal('${k.id || ''}')"
                    class="btn-a px-3 py-1.5 rounded-xl text-xs">Edit Data</button>
            ${aktif
        ? `<button onclick="toggleKaryawan('${k.id || ''}', 0)"
                         class="btn-r px-3 py-1.5 rounded-xl text-xs">Nonaktif</button>`
        : `<button onclick="toggleKaryawan('${k.id || ''}', 1)"
                         class="btn-g px-3 py-1.5 rounded-xl text-xs">Aktifkan</button>`}
            <button onclick="deleteKaryawan('${k.id || ''}')" class="btn-r px-3 py-1.5 rounded-xl text-xs bg-red-900/40 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30">Hapus</button>
          </div>
        </td>
    </tr>`;
  }).join('');
}

async function deleteKaryawan(id) {
  if (!confirm('PERINGATAN: Apakah Anda yakin ingin MENGHAPUS karyawan ini secara permanen? Data ini tidak dapat dikembalikan.')) return;
  const r = await api(`/karyawan/${id}`, { method: 'DELETE' });
  if (r && r.ok) {
    await loadKaryawan();
    toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil', 'Karyawan berhasil dihapus.');
  } else {
    toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Gagal menghapus karyawan. Pastikan karyawan tidak memiliki transaksi yang terikat.');
  }
}

function toggleRoleFields() {
  const roleEl = el('mk-role');
  if (!roleEl) return;
  const role = roleEl.value;
  
  const divEmail = el('div-mk-email');
  const divPass = el('div-mk-pass');
  const divBuatAkun = el('div-mk-buatakun');
  const divTelepon = el('div-mk-telepon');
  
  if (role === 'SUPIR') {
    if (divEmail) divEmail.style.display = 'none';
    if (divPass) divPass.style.display = 'none';
    if (divBuatAkun) divBuatAkun.style.display = 'none';
    if (divTelepon) divTelepon.style.display = 'block';
  } else {
    if (divEmail) divEmail.style.display = 'block';
    if (divPass) divPass.style.display = 'block';
    if (divBuatAkun) divBuatAkun.style.display = 'block';
    if (divTelepon) divTelepon.style.display = 'none';
  }
}

function openKaryawanModal(id = null) {
  S.editKaryId = id || null;
  el('mk-title').textContent = id ? 'Edit Data Karyawan' : 'Tambah Karyawan';
  if (id) {
    const k = S.karyawan.find(x => x.id === id);
    if (k) {
      if(el('mk-nip')) el('mk-nip').value = k.id || '';
      if(el('mk-nama')) el('mk-nama').value = k.nama || k.nama_lengkap || '';
      if(el('mk-email')) el('mk-email').value = k.email || '';
      if(el('mk-telepon')) el('mk-telepon').value = k.telepon || k.no_telepon || '';
      if(el('mk-role')) el('mk-role').value = k.role || 'KASIR';
      if(el('mk-tgl')) el('mk-tgl').value = k.tanggal_masuk || '';
      if(el('mk-gaji')) el('mk-gaji').value = k.gaji || k.gaji_per_bulan || '';
      if(el('mk-status')) el('mk-status').value = k.is_aktif === 1 ? '1' : '0';
      if(el('mk-pass')) el('mk-pass').value = '';
    }
  } else {
    if(el('mk-nama')) el('mk-nama').value = '';
    if(el('mk-email')) el('mk-email').value = '';
    if(el('mk-telepon')) el('mk-telepon').value = '';
    if(el('mk-pass')) el('mk-pass').value = '';
    if(el('mk-nip')) el('mk-nip').value = '';
    if(el('mk-gaji')) el('mk-gaji').value = '';
    if(el('mk-role')) el('mk-role').value = 'KASIR';
    if(el('mk-status')) el('mk-status').value = '1';
    if(el('mk-buatakun')) el('mk-buatakun').checked = true;
  }
  toggleRoleFields();
  el('modal-kary').classList.remove('hidden');
}

function closeKaryawanModal() {
  el('modal-kary').classList.add('hidden');
  S.editKaryId = null;
}

async function saveKaryawan() {
  const nama = el('mk-nama').value.trim();
  const email = el('mk-email').value.trim();
  const telepon = el('mk-telepon').value.trim();
  const role = el('mk-role').value;
  const tgl = el('mk-tgl').value;
  const gaji = parseFloat(el('mk-gaji').value || '0');
  const pass = el('mk-pass').value;
  const aktif = parseInt(el('mk-status').value);

  if (!nama) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Validasi', 'Nama wajib diisi.'); return; }
  
  if (role === 'SUPIR') {
    if (!telepon) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Validasi', 'Nomor WA wajib diisi untuk Supir.'); return; }
  } else {
    if (!email) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Validasi', 'Email wajib diisi.'); return; }
    if (!S.editKaryId && !pass) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Validasi', 'Password awal wajib diisi untuk karyawan baru.'); return; }
  }

  let ok = false;
  if (S.editKaryId) {
    // UPDATE
    const payload = { nama_lengkap: nama, is_aktif: aktif, gaji_per_bulan: gaji };
    if (role === 'SUPIR') payload.no_telepon = telepon;

    const r = await api(`/karyawan/${S.editKaryId}`, { method: 'PUT', body: JSON.stringify(payload) });
    ok = r && r.ok;
    if (ok) {
      // Update lokal state
      const idx = S.karyawan.findIndex(k => k.id === S.editKaryId);
      if (idx >= 0) S.karyawan[idx] = { ...S.karyawan[idx], nama, is_aktif: aktif, gaji_per_bulan: gaji };
      if (role === 'SUPIR' && idx >= 0) S.karyawan[idx].telepon = telepon;
    }
  } else {
    // INSERT
    const payload = { nama_lengkap: nama, role, gaji_per_bulan: gaji, is_aktif: aktif };
    if (role === 'SUPIR') {
      payload.no_telepon = telepon;
    } else {
      payload.email = email;
      payload.password = pass;
    }

    const r = await api('/karyawan', { method: 'POST', body: JSON.stringify(payload) });
    ok = r && r.ok;
    if (ok) {
      const res = await r.json().catch(() => ({}));
      S.karyawan.unshift({ id: res.id_karyawan || 'k-new-' + Date.now(), nama, email, role, gaji_per_bulan: gaji, is_aktif: aktif, tanggal_masuk: tgl });
    } else if (!S.token) {
      // Demo mode: simpan lokal
      S.karyawan.unshift({ id: 'k-local-' + Date.now(), nama, email, role, gaji_per_bulan: gaji, is_aktif: aktif, tanggal_masuk: tgl });
      ok = true;
    }
  }

  renderKaryawanTable();
  closeKaryawanModal();
  toast(ok ? '<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>' : '<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', ok ? 'Tersimpan' : 'Mode Demo', `Data karyawan ${nama} berhasil ${S.editKaryId ? 'diperbarui' : 'ditambahkan'}.`);
}

async function toggleKaryawan(id, aktif) {
  const label = aktif ? 'mengaktifkan' : 'menonaktifkan';
  if (!confirm(`Yakin ingin ${label} karyawan ini?`)) return;

  const r = await api(`/karyawan/${id}`, { method: 'PUT', body: JSON.stringify({ is_aktif: aktif }) });
  if (r && r.ok) {
    const idx = S.karyawan.findIndex(k => k.id === id);
    if (idx >= 0) S.karyawan[idx].is_aktif = aktif;
    renderKaryawanTable();
    toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Status Diperbarui', aktif ? 'Karyawan berhasil diaktifkan.' : 'Karyawan berhasil dinonaktifkan.');
  } else {
    toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Tidak dapat mengubah status karyawan.');
  }
}

// ============================================================
// SEMUA PESANAN
// ============================================================
async function loadPesanan() {
  const data = await apiJson('/transaksi?limit=200') || [];
  S.transaksi = Array.isArray(data) && data.length ? data : DEMO.transaksi;
  renderPesanan();
}

function setPesananFilter(f) {
  S.pesananFilter = f;
  document.querySelectorAll('.sf-btn').forEach(b => {
    const isActive = b.dataset.sf === f;
    b.style.background = isActive ? '#7C3AED' : 'rgba(255,255,255,.05)';
    b.style.color = isActive ? 'white' : '';
    b.classList.toggle('active', isActive);
  });
  renderPesanan();
}

function filterPesanan() {
  renderPesanan();
}

function renderPesanan() {
  const q = (el('sp-search').value || '').toLowerCase();
  const filt = S.pesananFilter;
  const grid = el('sp-grid');

  let list = S.transaksi;
  if (filt !== 'semua') list = list.filter(t => t.status === filt);
  if (q) list = list.filter(t =>
    String(t.booking || t.id || '').toLowerCase().includes(q) ||
    String(t.pelanggan || '').toLowerCase().includes(q) ||
    String(t.kendaraan || '').toLowerCase().includes(q)
  );

  if (!list.length) {
    grid.innerHTML = `<div class="text-center text-gray-600 py-12 glass rounded-2xl">
      Tidak ada pesanan ditemukan untuk filter ini.</div>`;
    return;
  }

  grid.innerHTML = list.map(t => {
    const stBadge = {
      MENUNGGU: 'b-menunggu', DIKONFIRMASI: 'b-dikonfirmasi',
      AKTIF: 'b-aktif', SELESAI: 'b-selesai', DIBATALKAN: 'b-disewa'
    };
    const stLabel = {
      MENUNGGU: 'Menunggu', DIKONFIRMASI: 'Dikonfirmasi',
      AKTIF: 'Aktif', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan'
    };
    const actionBtns = buildPesananActions(t);
    return `
      <div class="glass rounded-2xl p-4 hover:border-purple-500/30 transition-colors group"
           style="border-color:rgba(255,255,255,0.06);">
        <div class="flex flex-col md:flex-row md:items-center gap-4">
          <div class="w-full md:w-20 h-20 rounded-xl overflow-hidden bg-white/5 shrink-0 relative">
            ${t.foto_kendaraan
        ? `<img src="${t.foto_kendaraan}" alt="" class="w-full h-full object-cover">`
        : `<div class="w-full h-full flex items-center justify-center text-3xl"><i class="ph ph-car"></i></div>`}
            <span class="absolute top-1 left-1 badge ${stBadge[t.status] || 'b-selesai'}" style="font-size:8px;">
              ${stLabel[t.status] || t.status}
            </span>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono font-bold text-white">${t.booking || t.id || '—'}</span>
            </div>
            <div class="font-semibold text-gray-200 mt-0.5">${t.kendaraan || '—'}</div>
            <div class="text-xs text-gray-500 mt-1">
              Pemesan: <strong class="text-gray-300">${t.pelanggan || '—'}</strong>
            </div>
            <div class="text-xs text-gray-600 mt-0.5">
              ${fmtDT(t.mulai || t.tanggal_mulai)} s/d ${fmtDT(t.selesai_rencana || t.tanggal_selesai_rencana)}
              · ${t.durasi || t.durasi_hari || '?'} hari
            </div>
          </div>

          <div class="flex flex-col md:items-end gap-2 shrink-0">
            <div>
              <div class="text-xs text-gray-600">TOTAL PEMBAYARAN</div>
              <div class="font-bold text-lg" style="color:#F59E0B;">${rp(t.total || t.total_biaya || 0)}</div>
            </div>
            <div class="flex flex-wrap gap-1.5">${actionBtns}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function buildPesananActions(t) {
  const id = t.id || t.id_transaksi;
  const actions = [];

  if (t.status === 'MENUNGGU') {
    actions.push(`
      <button onclick="ownerUpdateStatus('${id}','DIKONFIRMASI')"
              class="btn-g px-3 py-1.5 rounded-xl text-xs font-semibold">✓ Konfirmasi</button>
      <button onclick="ownerUpdateStatus('${id}','DIBATALKAN')"
              class="btn-r px-3 py-1.5 rounded-xl text-xs">Tolak</button>`);
  } else if (t.status === 'DIKONFIRMASI') {
    actions.push(`
      <button onclick="ownerUpdateStatus('${id}','AKTIF')"
              class="btn-g px-3 py-1.5 rounded-xl text-xs font-semibold"><i class="ph ph-car"></i> Serahkan</button>
      <button onclick="ownerUpdateStatus('${id}','DIBATALKAN')"
              class="btn-r px-3 py-1.5 rounded-xl text-xs">Batalkan</button>`);
  } else if (t.status === 'AKTIF') {
    actions.push(`
      <button onclick="ownerUpdateStatus('${id}','SELESAI')"
              class="btn-o px-3 py-1.5 rounded-xl text-xs font-semibold"><i class="ph-fill ph-check-circle" style="color: #10B981;"></i> Selesaikan</button>
      <button onclick="ownerSendWaReminder('${id}')"
              class="btn-o px-3 py-1.5 rounded-xl text-xs font-semibold text-green-500"><i class="ph-fill ph-whatsapp-logo"></i> Kirim Reminder WA</button>`);
  }

  actions.push(`
    <a href="pos-kasir.html" class="btn-o px-3 py-1.5 rounded-xl text-xs"><i class="ph ph-printer"></i> Kwitansi</a>`);

  return actions.join('');
}

async function ownerUpdateStatus(id, status) {
  const label = { DIKONFIRMASI: 'dikonfirmasi', DIBATALKAN: 'dibatalkan', AKTIF: 'diserahkan', SELESAI: 'diselesaikan' };
  if (!confirm(`Yakin ingin mengubah status transaksi ini menjadi ${status}?`)) return;

  const r = await api(`/transaksi/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });

  if (r && r.ok) {
    toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Status Diperbarui', `Transaksi berhasil ${label[status] || status}.`);
    await loadPesanan();
  } else {
    // Fallback demo: update lokal
    const idx = S.transaksi.findIndex(t => (t.id || t.id_transaksi) === id);
    if (idx >= 0) S.transaksi[idx].status = status;
    renderPesanan();
    toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Mode Demo', `Status diubah secara lokal (API tidak tersedia).`);
  }
}

async function ownerSendWaReminder(id) {
  if (!confirm('Kirim pengingat WhatsApp ke kustomer?')) return;
  toast('<div class="spin" style="width:14px;height:14px;"></div>', 'Memproses', 'Mengirim pesan WA...');
  const r = await api(`/transaksi/${id}/remind-wa`, { method: 'POST' });
  if (r?.ok) {
    toast('<i class="ph-fill ph-whatsapp-logo" style="color: #10B981;"></i>', 'Terkirim', 'Reminder WA berhasil dikirim ke kustomer.');
  } else {
    toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Gagal mengirim WA. Pastikan token Fonnte diset.');
  }
}

// ============================================================
// EXPORT EXCEL (FR-10 — menggunakan Blob CSV sederhana)
// ============================================================
function exportExcel() {
  const ring = S.laporan?.ringkasan || DEMO.laporan.ringkasan;
  const tren = S.laporan?.tren_bulanan || DEMO.laporan.tren_bulanan;

  let csv = '\uFEFF'; // BOM untuk Excel agar terbaca UTF-8
  csv += 'LAPORAN KEUANGAN AERORENT\n';
  csv += `Periode,${el('lk-dari').value} s/d ${el('lk-sampai').value}\n\n`;
  csv += 'RINGKASAN\n';
  csv += `Total Pendapatan Kotor,${ring.total_pendapatan_kotor}\n`;
  csv += `Total Biaya Operasional,${ring.total_biaya_operasional}\n`;
  csv += `Profit Bersih,${ring.profit_bersih}\n`;
  csv += `Margin,${ring.margin_persen}%\n`;
  csv += `Jumlah Transaksi Selesai,${ring.jumlah_transaksi_selesai}\n\n`;
  csv += 'TREN BULANAN\n';
  csv += 'Bulan,Pendapatan\n';
  tren.forEach(t => { csv += `${t.bulan},${t.pendapatan}\n`; });

  // Top kendaraan
  const top = S.laporan?.top_5_kendaraan || DEMO.laporan.top_5_kendaraan;
  csv += '\nTOP KENDARAAN\n';
  csv += 'Nama,Jumlah Sewa,Pendapatan\n';
  top.forEach(k => { csv += `${k.nama},${k.jumlah_sewa},${k.total}\n`; });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Laporan_AeroRent_${el('lk-dari').value}_${el('lk-sampai').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('<i class="ph ph-squares-four"></i>', 'Export Berhasil', 'File CSV laporan keuangan berhasil diunduh.');
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const ring = S.laporan?.ringkasan || DEMO.laporan.ringkasan;
  const tren = S.laporan?.tren_bulanan || DEMO.laporan.tren_bulanan;
  const top = S.laporan?.top_5_kendaraan || DEMO.laporan.top_5_kendaraan;

  doc.setFontSize(18);
  doc.text("Laporan Keuangan AeroRent", 14, 20);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Periode: ${el('lk-dari').value} s/d ${el('lk-sampai').value}`, 14, 28);

  doc.autoTable({
    startY: 35,
    head: [['Deskripsi', 'Nominal']],
    body: [
      ['Total Pendapatan Kotor', rp(ring.total_pendapatan_kotor)],
      ['Total Biaya Operasional', rp(ring.total_biaya_operasional)],
      ['Profit Bersih', rp(ring.profit_bersih)],
      ['Margin', ring.margin_persen + '%'],
      ['Jumlah Transaksi Selesai', ring.jumlah_transaksi_selesai + ' Transaksi']
    ],
    theme: 'grid',
    headStyles: { fillColor: [124, 58, 237] }
  });

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Bulan', 'Pendapatan']],
    body: tren.map(t => [t.bulan, rp(t.pendapatan)]),
    theme: 'grid',
    headStyles: { fillColor: [124, 58, 237] }
  });

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Nama Kendaraan', 'Jumlah Sewa', 'Pendapatan']],
    body: top.map(k => [k.nama, k.jumlah_sewa + 'x', rp(k.total)]),
    theme: 'grid',
    headStyles: { fillColor: [124, 58, 237] }
  });

  doc.save(`Laporan_AeroRent_${el('lk-dari').value}_${el('lk-sampai').value}.pdf`);
  toast('<i class="ph ph-file-pdf"></i>', 'Export Berhasil', 'File PDF laporan keuangan berhasil diunduh.');
}

// ============================================================
// MOBILE SIDEBAR
// ============================================================
function openMobileSidebar() {
  el('sidebar').classList.add('open');
  el('mobile-overlay').style.display = 'block';
}
function closeMobileSidebar() {
  el('sidebar').classList.remove('open');
  el('mobile-overlay').style.display = 'none';
}

// ============================================================
// LOGOUT
// ============================================================
function doLogout() {
  if (confirm('Yakin ingin keluar dari sesi Owner?')) {
    localStorage.removeItem(AUTH_KEY);
    location.href = 'login.html';
  }
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================
let toastTimer;
function toast(icon, title, msg) {
  el('t-ic').innerHTML = icon;
  el('t-ttl').textContent = title;
  el('t-msg').textContent = msg;
  el('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4500);
}
function hideToast() { el('toast').classList.add('hidden'); }

// ============================================================
// UTILITAS
// ============================================================
const el = id => document.getElementById(id);
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const fmtD = d => d ? new Date(d).toLocaleDateString('id-ID',
  { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDT = d => d ? new Date(d).toLocaleString('id-ID') : '—';


// Inisialisasi filter tab pesanan
document.querySelectorAll('.sf-btn').forEach(b => {
  b.style.background = b.dataset.sf === 'semua' ? '#7C3AED' : 'rgba(255,255,255,0.05)';
  b.style.color = b.dataset.sf === 'semua' ? 'white' : '';
  b.style.borderRadius = '12px';
  b.style.transition = 'all .15s';
});

// Jalankan saat halaman selesai dimuat
window.addEventListener('load', init);
