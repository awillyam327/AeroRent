/**
 * ==============================================================================
 * AeroRent — Modul Kendaraan
 * Dipakai oleh index.html (Armada Unggulan) dan armada.html (Eksplorasi Armada).
 * Mengikuti kontrak nyata GET /kendaraan yang SUDAH ADA & publik di main.py.
 * ==============================================================================
 */

/** Fallback demo — dipakai hanya jika backend tidak terjangkau. Field & nilai
 *  disamakan persis dengan data seed di schema.sql supaya konsisten. */
const DEMO_VEHICLES = [
  { id_kendaraan: 'kend-001', nama_kendaraan: 'Honda Brio RS 2023', merk: 'Honda', tipe_kendaraan: '5_SEATER', transmisi: 'AT', bahan_bakar: 'Bensin', kapasitas_penumpang: 5, harga_sewa_harian: 300000, harga_supir_harian: 150000, status: 'TERSEDIA', is_featured: 1, foto_url: 'assets/images/brio.jpeg' },
  { id_kendaraan: 'kend-002', nama_kendaraan: 'Honda CR-V 2022', merk: 'Honda', tipe_kendaraan: '5_SEATER', transmisi: 'AT', bahan_bakar: 'Bensin', kapasitas_penumpang: 5, harga_sewa_harian: 650000, harga_supir_harian: 150000, status: 'TERSEDIA', is_featured: 0, foto_url: 'assets/images/honda cr-v 2022.jpg' },
  { id_kendaraan: 'kend-003', nama_kendaraan: 'Toyota Avanza 2022', merk: 'Toyota', tipe_kendaraan: '7_SEATER', transmisi: 'MT', bahan_bakar: 'Bensin', kapasitas_penumpang: 7, harga_sewa_harian: 350000, harga_supir_harian: 150000, status: 'TERSEDIA', is_featured: 0, foto_url: 'assets/images/Avanza 2022.jpg' },
  { id_kendaraan: 'kend-004', nama_kendaraan: 'Toyota Innova Reborn 2023', merk: 'Toyota', tipe_kendaraan: '7_SEATER', transmisi: 'AT', bahan_bakar: 'Bensin', kapasitas_penumpang: 7, harga_sewa_harian: 750000, harga_supir_harian: 150000, status: 'DISEWA', is_featured: 1, foto_url: 'assets/images/innova reborn 2023.jpg' },


  { id_kendaraan: 'kend-005', nama_kendaraan: 'Mitsubishi Pajero Sport 2022', merk: 'Mitsubishi', tipe_kendaraan: '7_SEATER', transmisi: 'AT', bahan_bakar: 'Solar', kapasitas_penumpang: 7, harga_sewa_harian: 950000, harga_supir_harian: 150000, status: 'TERSEDIA', is_featured: 1, foto_url: 'assets/images/pajero sport 2022.jpg' },

  { id_kendaraan: 'kend-006', nama_kendaraan: 'Toyota Hiace Commuter 2023', merk: 'Toyota', tipe_kendaraan: 'MICROBUS', transmisi: 'MT', bahan_bakar: 'Solar', kapasitas_penumpang: 14, harga_sewa_harian: 1200000, harga_supir_harian: 200000, status: 'TERSEDIA', is_featured: 0, foto_url: 'assets/images/Hiace 2023.jpg' },
  
  { id_kendaraan: 'kend-007', nama_kendaraan: 'Isuzu Elf Long 2022', merk: 'Isuzu', tipe_kendaraan: 'MICROBUS', transmisi: 'MT', bahan_bakar: 'Solar', kapasitas_penumpang: 16, harga_sewa_harian: 1400000, harga_supir_harian: 200000, status: 'TERSEDIA', is_featured: 0, foto_url: 'assets/images/isuzu Elf2022.jpg' },
];


/**
 * Ambil daftar kendaraan dari backend (GET /kendaraan, endpoint publik).
 * Fallback ke DEMO_VEHICLES bila backend tidak terjangkau.
 * @param {object} filters - { tipe, status }
 */
async function fetchVehicles(filters = {}) {
  const params = new URLSearchParams();
  if (filters.tipe) params.append('tipe', filters.tipe);
  if (filters.status) params.append('status', filters.status);
  const qsStr = params.toString() ? `?${params.toString()}` : '';

  const data = await apiJsonPublic(`/kendaraan${qsStr}`);
  if (Array.isArray(data) && data.length) return data;

  // Fallback demo (filter lokal supaya perilaku tetap konsisten)
  return DEMO_VEHICLES.filter((v) =>
    (!filters.tipe || v.tipe_kendaraan === filters.tipe) &&
    (!filters.status || v.status === filters.status)
  );
}

/** Versi apiJson tanpa requireAuth/redirect — katalog ini publik, harus bisa
 *  diakses tanpa login sama sekali (FR-02). */
async function apiJsonPublic(path) {
  try {
    const res = await fetch(API_BASE + path);
    if (res.ok) return await res.json();
    return null;
  } catch (_) { return null; }
}

/**
 * Ambil satu kendaraan by ID (GET /kendaraan/{id}, sudah ada & publik di backend).
 * Fallback ke DEMO_VEHICLES bila backend tidak terjangkau / ID tidak ketemu di sana.
 */
async function fetchVehicleById(id) {
  const data = await apiJsonPublic(`/kendaraan/${id}`);
  if (data && data.id_kendaraan) return data;
  return DEMO_VEHICLES.find((v) => v.id_kendaraan === id) || null;
}

const TIPE_LABEL = { '5_SEATER': '5 Seater', '7_SEATER': '7 Seater', 'MICROBUS': 'Microbus' };

/** Render satu kartu kendaraan (ipakai di grid Armada Unggulan & Eksplorasi Armada) */
function renderVehicleCard(v, rootPath = '') {
  const tersedia = v.status === 'TERSEDIA';
  const badgeClass = tersedia ? 'badge-tersedia' : 'badge-disewa';
  const badgeLabel = tersedia ? 'Tersedia' : 'Disewa';
  const fotoHtml = v.foto_url
    ? `<img src="${v.foto_url}" alt="${v.nama_kendaraan}" loading="lazy">`
    : `<div class="vehicle-photo-placeholder">🚗</div>`;
function renderVehicleCard(v, rootPath = '') {

  console.log(v.nama_kendaraan, v.foto_url);

  const tersedia = v.status === 'TERSEDIA';
}
  return `
    <div class="vehicle-card glass-card">
      <div class="vehicle-photo">
        ${v.is_featured ? '<span class="vehicle-promo-badge">PROMO</span>' : ''}
        <span class="badge ${badgeClass} vehicle-status-badge">${badgeLabel}</span>
        ${fotoHtml}
      </div>
      <div class="vehicle-body">
        <div class="vehicle-name">${v.nama_kendaraan}</div>
        <div class="vehicle-sub text-dim">${v.merk} • ${TIPE_LABEL[v.tipe_kendaraan] || v.tipe_kendaraan}</div>
        <div class="vehicle-specs">
          <span class="spec-pill">👤 ${v.kapasitas_penumpang || '-'} Kursi</span>
          <span class="spec-pill">⚙ ${v.transmisi === 'AT' ? 'Otomatis' : 'Manual'}</span>
          <span class="spec-pill">⛽ ${v.bahan_bakar}</span>
        </div>
        <div class="vehicle-footer">
          <div>
            <span class="text-amber" style="font-size:18px;font-weight:700;">${rp(v.harga_sewa_harian)}</span>
            <span class="text-faint" style="font-size:12px;">/hari</span>
          </div>
          <button class="btn btn-primary" style="padding:9px 18px;font-size:13px;"
                  onclick="handleSewaClick('${v.id_kendaraan}')" ${tersedia ? '' : 'disabled'}>
            Sewa
          </button>
        </div>
      </div>
    </div>`;
}

/** Klik tombol "Sewa": belum login -> login.html (bawa info "kembali ke sini
 *  setelah login" via ?redirect=), sudah login -> sewa.html?id=... langsung. */
function handleSewaClick(vehicleId) {
  const auth = getAuth();
  const root = resolveRoot();
  if (!auth || auth.user?.role !== 'CUSTOMER') {
    const returnTo = encodeURIComponent(`sewa.html?id=${vehicleId}`);
    location.href = `${root}login.html?redirect=${returnTo}`;
    return;
  }
  location.href = `${root}sewa.html?id=${vehicleId}`;
}

/** Deteksi prefix relatif ke root berdasarkan kedalaman path saat ini. */
function resolveRoot() {
  const depth = location.pathname.split('/').filter(Boolean).length;
  // index.html & armada.html ada di root -> depth 1 (nama file itu sendiri) -> rootPath ''
  // pages/customer/dashboard.html -> depth 3 -> rootPath '../../'
  if (location.pathname.includes('/pages/')) return '../../';
  return '';
}
