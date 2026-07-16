

const DEMO_VEHICLES = [
  { id_kendaraan: 'kend-001', nama_kendaraan: 'Honda Brio RS 2023', merk: 'Honda', tipe_kendaraan: 'CITY_CAR', transmisi: 'AT', bahan_bakar: 'Bensin', kapasitas_penumpang: 5, harga_sewa_harian: 300000, harga_supir_harian: 150000, status: 'TERSEDIA', is_featured: 1, foto_url: 'assets/images/brio.jpeg' },
  { id_kendaraan: 'kend-002', nama_kendaraan: 'Honda CR-V 2022', merk: 'Honda', tipe_kendaraan: 'SUV', transmisi: 'AT', bahan_bakar: 'Bensin', kapasitas_penumpang: 5, harga_sewa_harian: 650000, harga_supir_harian: 150000, status: 'TERSEDIA', is_featured: 0, foto_url: 'assets/images/honda cr-v 2022.jpg' },
  { id_kendaraan: 'kend-003', nama_kendaraan: 'Toyota Avanza 2022', merk: 'Toyota', tipe_kendaraan: 'MPV', transmisi: 'MT', bahan_bakar: 'Bensin', kapasitas_penumpang: 7, harga_sewa_harian: 350000, harga_supir_harian: 150000, status: 'TERSEDIA', is_featured: 0, foto_url: 'assets/images/Avanza 2022.jpg' },
  { id_kendaraan: 'kend-004', nama_kendaraan: 'Toyota Innova Reborn 2023', merk: 'Toyota', tipe_kendaraan: 'MPV', transmisi: 'AT', bahan_bakar: 'Bensin', kapasitas_penumpang: 7, harga_sewa_harian: 750000, harga_supir_harian: 150000, status: 'DISEWA', is_featured: 1, foto_url: 'assets/images/innova reborn 2023.jpg' },
  { id_kendaraan: 'kend-005', nama_kendaraan: 'Mitsubishi Pajero Sport 2022', merk: 'Mitsubishi', tipe_kendaraan: 'SUV', transmisi: 'AT', bahan_bakar: 'Solar', kapasitas_penumpang: 7, harga_sewa_harian: 950000, harga_supir_harian: 150000, status: 'TERSEDIA', is_featured: 1, foto_url: 'assets/images/pajero sport 2022.jpg' },

  { id_kendaraan: 'kend-006', nama_kendaraan: 'Toyota Hiace Commuter 2023', merk: 'Toyota', tipe_kendaraan: 'MICROBUS', transmisi: 'MT', bahan_bakar: 'Solar', kapasitas_penumpang: 14, harga_sewa_harian: 1200000, harga_supir_harian: 200000, status: 'TERSEDIA', is_featured: 0, foto_url: 'assets/images/Hiace 2023.jpg' },

  { id_kendaraan: 'kend-007', nama_kendaraan: 'Isuzu Elf Long 2022', merk: 'Isuzu', tipe_kendaraan: 'MICROBUS', transmisi: 'MT', bahan_bakar: 'Solar', kapasitas_penumpang: 16, harga_sewa_harian: 1400000, harga_supir_harian: 200000, status: 'TERSEDIA', is_featured: 0, foto_url: 'assets/images/isuzu Elf2022.jpg' },
];

async function fetchVehicles(filters = {}) {
  const params = new URLSearchParams();
  if (filters.tipe) params.append('tipe', filters.tipe);
  if (filters.status) params.append('status', filters.status);
  const qsStr = params.toString() ? `?${params.toString()}` : '';

  const data = await apiJsonPublic(`/kendaraan${qsStr}`);
  if (Array.isArray(data) && data.length) return data;
  return DEMO_VEHICLES.filter((v) =>
    (!filters.tipe || v.tipe_kendaraan === filters.tipe) &&
    (!filters.status || v.status === filters.status)
  );
}

async function apiJsonPublic(path) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  try {
    const res = await fetch(API_BASE + path, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) return await res.json();
    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    return null; 
  }
}

async function fetchVehicleById(id) {
  const data = await apiJsonPublic(`/kendaraan/${id}`);
  if (data && data.id_kendaraan) return data;
  return DEMO_VEHICLES.find((v) => v.id_kendaraan === id) || null;
}

const TIPE_LABEL = { 'SUV': 'SUV', 'MPV': 'MPV', 'CITY_CAR': 'City Car', 'SEDAN': 'Sedan', 'MINIVAN': 'Minivan', 'MICROBUS': 'Microbus', '5_SEATER': 'City Car', '7_SEATER': 'MPV' };

function renderVehicleCard(v, rootPath = '') {
  const tersedia = v.status === 'TERSEDIA';
  const badgeClass = tersedia ? 'badge-tersedia' : 'badge-disewa';
  const badgeLabel = tersedia ? 'Tersedia' : 'Disewa';
  
  // Handle edge cases where foto_url is the string "null" or missing
  let imgSrc = '';
  if (v.foto_url && v.foto_url !== "null" && v.foto_url !== "undefined") {
    imgSrc = v.foto_url.startsWith('http') || v.foto_url.startsWith('data:') 
             ? v.foto_url 
             : rootPath + v.foto_url;
  }

  const fotoHtml = imgSrc
    ? `<img src="${imgSrc}" alt="${v.nama_kendaraan}" loading="lazy" onerror="this.outerHTML='<div class=\\'vehicle-photo-placeholder\\'><i class=\\'ph ph-car\\'></i></div>'">`
    : `<div class="vehicle-photo-placeholder"><i class="ph ph-car"></i></div>`;
    
  let seatCount = v.kapasitas_penumpang;
  if (!seatCount) {
    if (v.tipe_kendaraan === '5_SEATER' || v.tipe_kendaraan === 'CITY_CAR' || v.tipe_kendaraan === 'SEDAN') seatCount = 5;
    else if (v.tipe_kendaraan === '7_SEATER' || v.tipe_kendaraan === 'SUV' || v.tipe_kendaraan === 'MPV' || v.tipe_kendaraan === 'MINIVAN') seatCount = 7;
    else if (v.tipe_kendaraan === 'MICROBUS') seatCount = 16;
    else seatCount = '-';
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
          <span class="spec-pill"><i class="ph ph-user"></i> ${seatCount} Kursi</span>
          <span class="spec-pill"><i class="ph ph-gear"></i> ${v.transmisi === 'AT' ? 'Otomatis' : 'Manual'}</span>
          <span class="spec-pill"><i class="ph ph-gas-pump"></i> ${v.bahan_bakar}</span>
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

function resolveRoot() {
  const depth = location.pathname.split('/').filter(Boolean).length;
  if (location.pathname.includes('/pages/')) return '../../';
  return '';
}
