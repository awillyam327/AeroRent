/**
 * ==============================================================================
 * AeroRent — Logika Dashboard Customer (pages/customer/dashboard.html)
 *
 * KETERBATASAN YANG DISADARI: backend belum punya endpoint untuk Customer
 * mengambil daftar booking miliknya sendiri. GET /transaksi yang ada saat ini
 * dikunci untuk role KASIR/OWNER saja (lihat README_STRUKTUR.md bagian
 * kontrak API). Frontend memanggil kontrak yang diharapkan, lalu fallback ke:
 *   1. Data demo statis (DEMO_BOOKINGS, meniru screenshot mockup)
 *   2. + booking apa pun yang baru saja dibuat di sewa.html pada sesi browser
 *      ini (tersimpan via addDemoBooking() di utils.js)
 * supaya alur "booking lalu lihat di dashboard" tetap terasa nyata saat demo.
 * ==============================================================================
 */

const DEMO_BOOKINGS = [
  { id: 'd1', booking: 'AR-4827', kendaraan: 'Honda Brio RS 2023', mulai: '2026-06-30', selesai_rencana: '2026-07-03', durasi: 3, total: 900000, status: 'MENUNGGU', foto_kendaraan: '' },
  { id: 'd2', booking: 'AR-9129', kendaraan: 'Honda Brio RS 2023', mulai: '2026-06-23', selesai_rencana: '2026-06-26', durasi: 3, total: 900000, status: 'MENUNGGU', foto_kendaraan: '' },
  { id: 'd3', booking: 'AR-1881', kendaraan: 'Toyota Innova Reborn 2023', mulai: '2026-06-08', selesai_rencana: '2026-06-11', durasi: 3, total: 2700000, status: 'AKTIF', foto_kendaraan: '' },
];

/** Endpoint yang DIHARAPKAN ada (belum diimplementasikan backend) untuk
 *  Customer mengambil booking miliknya sendiri berdasarkan token JWT-nya. */
async function fetchMyBookings() {
  const real = await apiJson('/transaksi/saya', {}, '../../login.html');
  const seed = Array.isArray(real) ? real : DEMO_BOOKINGS;
  const localDemo = getDemoBookings(); // booking yang baru dibuat di sesi ini (lihat utils.js)
  return [...localDemo, ...seed];
}

function renderStatusBadge(status) {
  const map = {
    MENUNGGU: 'badge-menunggu', DIKONFIRMASI: 'badge-dikonfirmasi',
    AKTIF: 'badge-aktif', SELESAI: 'badge-selesai', DIBATALKAN: 'badge-dibatalkan',
  };
  const label = {
    MENUNGGU: 'Menunggu', DIKONFIRMASI: 'Dikonfirmasi',
    AKTIF: 'Aktif', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan',
  };
  return `<span class="badge ${map[status] || 'badge-selesai'}">${label[status] || status}</span>`;
}

async function initDashboard() {
  const auth = requireAuth(['CUSTOMER'], '../../login.html');
  if (!auth) return;

  renderCustomerSidebar('cs-sidebar', { active: 'dashboard', rootPath: '../../' });
  renderToastMarkup('toast-root');

  qs('cs-greeting').textContent = `HALO, ${auth.user.nama.toUpperCase()}! <i class="ph-fill ph-hand-waving"></i>`;

  const bookings = await fetchMyBookings();
  const totalSewa = bookings.length;
  const aktifMenunggu = bookings.filter((b) => ['MENUNGGU', 'DIKONFIRMASI', 'AKTIF'].includes(b.status)).length;

  qs('stat-total').textContent = `${totalSewa} Kali`;
  qs('stat-aktif').textContent = `${aktifMenunggu} Transaksi`;

  const activeBookings = bookings.filter((b) => ['MENUNGGU', 'DIKONFIRMASI', 'AKTIF'].includes(b.status));
  const tbody = qs('booking-tbody');

  if (!activeBookings.length) {
    qs('booking-table-wrap').classList.add('hidden');
    qs('booking-empty').classList.remove('hidden');
    return;
  }

  tbody.innerHTML = activeBookings.map((b) => `
    <tr>
      <td><span style="font-family:monospace;color:#D1D5DB;">${b.booking}</span></td>
      <td>${b.kendaraan}</td>
      <td class="text-dim">${fmtD(b.mulai)}</td>
      <td>${renderStatusBadge(b.status)}</td>
      <td class="text-amber" style="text-align:right;font-weight:700;">${rp(b.total)}</td>
    </tr>`).join('');
}

/* ---------- RIWAYAT PEMESANAN ---------- */
async function initRiwayat() {
  const auth = requireAuth(['CUSTOMER'], '../../login.html');
  if (!auth) return;

  renderCustomerSidebar('cs-sidebar', { active: 'riwayat', rootPath: '../../' });
  renderToastMarkup('toast-root');

  const bookings = await fetchMyBookings();
  const list = qs('riwayat-list');

  if (!bookings.length) {
    list.innerHTML = `<div class="glass-card text-center text-dim" style="padding:50px;">Belum ada riwayat transaksi.</div>`;
    return;
  }

  list.innerHTML = bookings.map((b) => {
    const canExtend = b.status === 'AKTIF';
    return `
    <div class="glass-card riwayat-card">
      <div class="flex justify-between items-start flex-wrap gap-2">
        <div>
          <div class="flex items-center gap-2">
            <span style="font-family:monospace;font-weight:700;">${b.booking}</span>
            ${renderStatusBadge(b.status)}
          </div>
          <div class="text-faint mt-2" style="font-size:11px;">Dipesan pada ${fmtD(b.created_at || b.mulai)}</div>
        </div>
        <div style="text-align:right;">
          <div class="text-faint" style="font-size:11px;">TOTAL PEMBAYARAN</div>
          <div class="text-amber" style="font-size:18px;font-weight:700;">${rp(b.total)}</div>
        </div>
      </div>
      <div class="mt-3" style="font-weight:700;">${b.kendaraan}</div>
      <div class="text-dim" style="font-size:12px;margin-top:2px;">
        ${fmtD(b.mulai)} s/d ${fmtD(b.selesai_rencana)} (${b.durasi} hari)
      </div>
      <div class="flex gap-2 mt-4 flex-wrap">
        <button class="btn btn-outline" style="padding:8px 16px;font-size:12px;" onclick="printInvoice('${b.booking}')"><i class="ph ph-printer"></i> Cetak Invoice</button>
        ${canExtend ? `<button class="btn btn-ghost" style="padding:8px 16px;font-size:12px;" onclick="handleExtendClick('${b.booking}')"><i class="ph ph-timer"></i> Extend Sewa (Perpanjang)</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

/** FR terkait "Tambah Waktu Sewa" ADA di SRS & Use Case Diagram, tapi backend
 *  belum punya endpoint maupun kolom untuk ini sama sekali (lihat laporan
 *  Phase 1-2). Daripada berpura-pura berhasil, tombol ini jujur memberi tahu
 *  bahwa fitur belum tersedia. */
function handleExtendClick(nomorBooking) {
  showToast('<i class="ph-fill ph-traffic-cone" style="color: #F59E0B;"></i>', 'Belum Tersedia', `Perpanjangan sewa untuk ${nomorBooking} belum didukung backend saat ini.`);
}

/** Cetak invoice sederhana via window.print() — murni client-side, tidak
 *  bergantung pada endpoint backend manapun (pola sama seperti printReceipt()
 *  di pos-kasir.html). */
function printInvoice(nomorBooking) {
  const all = [...getDemoBookings(), ...DEMO_BOOKINGS];
  const b = all.find((x) => x.booking === nomorBooking);
  if (!b) { showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Data invoice tidak ditemukan.'); return; }
  const user = getCurrentUser();

  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`<html><head><title>Invoice ${b.booking}</title>
  <style>body{font-family:monospace;padding:20px;font-size:13px;}hr{border:1px dashed #000;}
  .r{text-align:right;}.t{font-size:16px;font-weight:bold;}</style></head><body>
  <div style="text-align:center"><b>AERORENT</b><br>Jl. Diponegoro No.123, Salatiga<br>
  Telp: +62 812-3456-7890</div><hr>
  <b>No. Booking:</b> ${b.booking}<br>
  <b>Pelanggan:</b> ${user?.nama || '—'}<br>
  <b>Kendaraan:</b> ${b.kendaraan}<br>
  <b>Periode:</b> ${fmtD(b.mulai)} s/d ${fmtD(b.selesai_rencana)}<br>
  <b>Durasi:</b> ${b.durasi} hari<hr>
  <b>TOTAL: <span class="r">${rp(b.total)}</span></b><br>
  <br>Status: ${b.status}<br><br>Terima kasih telah menggunakan AeroRent!
  </body></html>`);
  w.print();
}

/* ---------- PROFIL SAYA ---------- */
/* DEMO_PROFILE_KEY & getDemoProfile() sekarang ada di js/utils.js (dipakai
 * bersama dengan sewa.html untuk auto-isi Data Diri). */

async function initProfil() {
  const auth = requireAuth(['CUSTOMER'], '../../login.html');
  if (!auth) return;

  renderCustomerSidebar('cs-sidebar', { active: 'profil', rootPath: '../../' });
  renderToastMarkup('toast-root');

  const saved = getDemoProfile();
  const profile = {
    nama: saved?.nama || auth.user.nama || '',
    email: auth.user.email || '',
    telp: saved?.telp || '',
    alamat: saved?.alamat || '',
  };

  qs('pf-avatar').innerHTML = auth.user.foto_profil_url ? `<img src="${auth.user.foto_profil_url}" style="width:100%;height:100%;object-fit:cover;">` : (profile.nama || '?')[0].toUpperCase();
  qs('pf-nama-display').textContent = profile.nama;
  qs('pf-email-display').textContent = profile.email;
  qs('pf-nama').value = profile.nama;
  qs('pf-email').value = profile.email;
  qs('pf-telp').value = profile.telp;
  qs('pf-alamat').value = profile.alamat;

  qs('form-profil').addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfil();
  });
}

async function saveProfil() {
    const data = {
      nama: qs('pf-nama').value.trim(),
      telp: qs('pf-telp').value.trim(),
      alamat: qs('pf-alamat').value.trim(),
    };
    if (!data.nama || !data.telp) {
      showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Validasi', 'Nama dan nomor telepon wajib diisi.');
      return;
    }

    const btn = qs('pf-btn-save');
    if (btn) btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
    
    const res = await apiFetch('/pelanggan/saya', {
      method: 'PUT',
      body: JSON.stringify(data)
    });

    if (btn) btn.innerHTML = 'Simpan Perubahan';

    if (res && res.ok) {
      localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(data));
      qs('pf-nama-display').textContent = data.nama;
      qs('pf-avatar').textContent = data.nama[0].toUpperCase();
      showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil', 'Profil berhasil disimpan.');
    } else {
      showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Gagal menyimpan profil ke server.');
    }
  }

function showAvatarOptions() {
  const modal = document.getElementById('modal-avatar-options');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeAvatarOptions() {
  const modal = document.getElementById('modal-avatar-options');
  if (modal) {
    modal.classList.add('hidden');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  }
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const btnEdit = document.querySelector('.btn-edit-avatar');
  const originalHtml = btnEdit.innerHTML;
  btnEdit.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#111;"></span>';
  
  const formData = new FormData();
  formData.append('foto', file);

  const res = await apiFetch('/pelanggan/saya/avatar', {
    method: 'POST',
    body: formData
  });

  btnEdit.innerHTML = originalHtml;

  if (res && res.ok) {
    const data = await res.json();
    const user = getCurrentUser();
    if (user) {
      user.foto_profil_url = data.foto_profil_url;
      localStorage.setItem('aerorent_user', JSON.stringify(user));
    }
    
    document.getElementById('pf-avatar').innerHTML = `<img src="${data.foto_profil_url}" style="width:100%;height:100%;object-fit:cover;">`;
    showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil', 'Foto profil berhasil diperbarui.');
    
    // Update sidebar & navbar if functions exist
    if (typeof renderCustomerSidebar === 'function') renderCustomerSidebar('cs-sidebar', { active: 'profil', rootPath: '../../' });
    if (typeof renderNavbar === 'function') renderNavbar('navbar', { active: 'profil', rootPath: '../../' });
  } else {
    showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Gagal mengunggah foto profil.');
  }
}
