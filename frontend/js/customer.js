

const DEMO_BOOKINGS = [];

let _cachedBookings = [];

async function fetchMyBookings() {
  const real = await apiJson('/transaksi/saya', {}, '../../login.html');
  const seed = Array.isArray(real) ? real : DEMO_BOOKINGS;
  const localDemo = getDemoBookings(); // booking yang baru dibuat di sesi ini (lihat utils.js)
  _cachedBookings = [...localDemo, ...seed];
  return _cachedBookings;
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

  renderNavbar('navbar', { active: 'dashboard', rootPath: '../../' });
  renderToastMarkup('toast-root');

  qs('cs-greeting').innerHTML = `HALO, ${auth.user.nama.toUpperCase()}! <i class="ph-fill ph-hand-waving"></i>`;

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
      <td class="text-dim">${fmtDT(b.mulai)}</td>
      <td>${renderStatusBadge(b.status)}</td>
      <td class="text-amber" style="text-align:right;font-weight:700;">${rp(b.total)}</td>
      <td style="white-space: nowrap;">
        <div style="display:flex; gap:6px; justify-content:flex-end; align-items:center;">
          ${(b.status_bayar === 'BELUM_LUNAS' && (b.status === 'MENUNGGU' || b.status === 'DIKONFIRMASI')) ? `<button class="btn btn-primary" style="padding:4px 8px;font-size:12px;" onclick="handlePayClick('${b.booking}', event)" title="Bayar Sekarang"><i class="ph ph-wallet"></i> Bayar</button><button class="btn btn-ghost" style="padding:4px 8px;font-size:12px;color:#EF4444;" onclick="handleCancelClick('${b.booking}')" title="Batalkan Pesanan"><i class="ph ph-x-circle"></i></button>` : ''}
          ${b.status === 'AKTIF' || b.status === 'DIKONFIRMASI' ? `<button class="btn btn-ghost" style="padding:4px 8px;font-size:12px;" onclick="openExtendModal('${b.booking}')" title="Perpanjang Sewa"><i class="ph ph-timer"></i> Extend</button>
          ${!b.gunakan_supir ? `<button class="btn btn-outline" style="padding:4px 8px;font-size:12px;" onclick="openSupirModal('${b.booking}')" title="Tambah Supir"><i class="ph ph-steering-wheel"></i> +Supir</button>` : ''}` : ''}
        </div>
      </td>
    </tr>`).join('');
}

async function initRiwayat() {
  const auth = requireAuth(['CUSTOMER'], '../../login.html');
  if (!auth) return;

  renderNavbar('navbar', { active: 'riwayat', rootPath: '../../' });
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
        ${fmtDT(b.mulai)} s/d ${fmtDT(b.selesai_rencana)} (${b.durasi} hari)
      </div>
      <div class="flex gap-2 mt-4 flex-wrap">
        <button class="btn btn-outline" style="padding:8px 16px;font-size:12px;" onclick="sendInvoiceWA('${b.booking}', this)"><i class="ph ph-whatsapp-logo"></i> Invoice</button>
        ${canExtend ? `<button class="btn btn-ghost" style="padding:8px 16px;font-size:12px;" onclick="openExtendModal('${b.booking}')"><i class="ph ph-timer"></i> Extend Sewa (Perpanjang)</button>` : ''}
        ${canExtend && !b.gunakan_supir ? `<button class="btn btn-primary" style="padding:8px 16px;font-size:12px;" onclick="openSupirModal('${b.booking}')"><i class="ph ph-steering-wheel"></i> Sewa Sopir Tambahan</button>` : ''}
        ${(b.status_bayar === 'BELUM_LUNAS' && (b.status === 'MENUNGGU' || b.status === 'DIKONFIRMASI')) ? `<button class="btn btn-primary" style="padding:8px 16px;font-size:12px;" onclick="handlePayClick('${b.booking}', event)"><i class="ph ph-wallet"></i> Bayar Online / Cashless</button><button class="btn btn-ghost" style="padding:8px 16px;font-size:12px;color:#EF4444;" onclick="handleCancelClick('${b.booking}')"><i class="ph ph-x-circle"></i> Batalkan Pesanan</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

let currentExtendId = null;
let currentExtPaket = 'HARIAN';

function openExtendModal(nomorBooking) {
  currentExtendId = nomorBooking;
  currentExtPaket = 'HARIAN';
  setExtPaket('HARIAN');
  qs('ext-hari').value = '1';
  qs('extend-modal').classList.remove('hidden');
}

function setExtPaket(paket) {
  currentExtPaket = paket;
  qs('btn-ext-harian').classList.toggle('btn-primary', paket === 'HARIAN');
  qs('btn-ext-harian').classList.toggle('btn-ghost', paket !== 'HARIAN');
  qs('btn-ext-bulanan').classList.toggle('btn-primary', paket === 'BULANAN');
  qs('btn-ext-bulanan').classList.toggle('btn-ghost', paket !== 'BULANAN');

  qs('group-ext-harian').classList.toggle('hidden', paket === 'BULANAN');
  qs('group-ext-bulanan').classList.toggle('hidden', paket === 'HARIAN');
}

async function submitExtend() {
  if (!currentExtendId) return;

  const btn = qs('btn-ext-submit');
  btn.disabled = true;
  btn.innerHTML = 'Memproses...';
  qs('ext-err').classList.add('hidden');

  let tambahan_hari = parseInt(qs('ext-hari').value || '1', 10);
  if (currentExtPaket === 'BULANAN') {
    tambahan_hari = parseInt(qs('ext-bulan').value, 10);
  }

  try {
    const payload = {
      paket_sewa: currentExtPaket,
      tambahan_hari: tambahan_hari
    };

    const res = await apiFetch(`/transaksi/${currentExtendId}/perpanjang`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res && res.ok) {
      const data = await res.json();
      showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil', data.message);
      qs('extend-modal').classList.add('hidden');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      const data = await res.json();
      qs('ext-err').textContent = data.detail || 'Gagal memperpanjang sewa';
      qs('ext-err').classList.remove('hidden');
    }
  } catch (err) {
    qs('ext-err').textContent = err.message;
    qs('ext-err').classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Proses';
  }
}

let currentSupirId = null;

function openSupirModal(nomorBooking) {
  currentSupirId = nomorBooking;
  qs('supir-hari').value = '1';
  qs('supir-modal').classList.remove('hidden');
}

async function submitSupir() {
  if (!currentSupirId) return;

  const btn = qs('btn-supir-submit');
  btn.disabled = true;
  btn.innerHTML = 'Memproses...';
  qs('supir-err').classList.add('hidden');

  const durasi_hari = parseInt(qs('supir-hari').value || '1', 10);

  try {
    const payload = {
      durasi_hari: durasi_hari
    };

    const res = await apiFetch(`/transaksi/${currentSupirId}/tambah-supir`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res && res.ok) {
      const data = await res.json();
      showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil', data.message);
      qs('supir-modal').classList.add('hidden');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      const data = await res.json();
      qs('supir-err').textContent = data.detail || 'Gagal menambahkan supir';
      qs('supir-err').classList.remove('hidden');
    }
  } catch (err) {
    qs('supir-err').textContent = err.message;
    qs('supir-err').classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Proses';
  }
}

async function handleCancelClick(nomorBooking) {
  if (!confirm(`Apakah Anda yakin ingin membatalkan pesanan ${nomorBooking}?`)) return;

  try {
    const res = await apiFetch(`/transaksi/${nomorBooking}/cancel`, { method: 'PUT' });
    if (res && res.ok) {
      showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Dibatalkan', `Pesanan ${nomorBooking} berhasil dibatalkan.`);
      setTimeout(() => window.location.reload(), 1500);
    } else {
      const data = await res.json();
      showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Gagal', data.detail || 'Gagal membatalkan pesanan.');
    }
  } catch (err) {
    showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Error', err.message);
  }
}

async function loadMidtransScript() {
  if (window.snap) return true;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/config/midtrans`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
        const data = await res.json();
        if (data.client_key) {
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
                script.setAttribute('data-client-key', data.client_key);
                script.onload = resolve;
                document.head.appendChild(script);
            });
            return true;
        }
    }
  } catch (e) {
    console.warn("Gagal memuat config midtrans", e);
  }
  return false;
}

async function handlePayClick(tid, event) {
  if (event) event.stopPropagation();
  const btn = event.currentTarget;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;margin-right:4px;"></span> Tunggu...';
  btn.disabled = true;

  try {
    const loaded = await loadMidtransScript();
    if (!loaded) throw new Error("Sistem pembayaran belum siap, silakan coba lagi.");

    const auth = getAuth();
    if (!auth || !auth.access_token) throw new Error("Sesi telah habis, silakan login kembali.");

    const res = await fetch(`${API_BASE}/transaksi/${tid}/midtrans-snap`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.access_token}` }
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal mendapatkan token pembayaran.');
    }
    const data = await res.json();

    window.snap.pay(data.snap_token, {
      onSuccess: async function(result) {
          showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Pembayaran Berhasil', 'Terima kasih, pembayaran Anda telah diterima.');
          try { await fetch(`${API_BASE}/transaksi/${tid}/midtrans-sync`, { headers: { 'Authorization': `Bearer ${token}` }}); } catch(e){}
          setTimeout(() => window.location.reload(), 1500);
        },
      onPending: function(result) {
        showToast('<i class="ph-fill ph-hourglass-high" style="color: #3B82F6;"></i>', 'Menunggu Pembayaran', 'Silakan selesaikan pembayaran Anda.');
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      },
      onError: function(result) {
        showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Pembayaran Gagal', 'Terjadi kesalahan saat memproses pembayaran.');
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      },
      onClose: function() {
        showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Pembayaran Ditunda', 'Anda menutup popup pembayaran.');
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
    });
  } catch (err) {
    showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Error', err.message);
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

async function sendInvoiceWA(nomorBooking, btnEl) {
  const originalHtml = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;margin-right:4px;"></span> Mengunduh...';

  try {
    const res = await apiFetch(`/transaksi/${nomorBooking}/invoice-wa`, {
      method: 'POST'
    });

    if (res && res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `Invoice_${nomorBooking}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      showToast('<i class="ph-fill ph-check-circle" style="color: #25D366;"></i>', 'Berhasil', 'Invoice PDF berhasil diunduh dan detail telah dikirim ke WhatsApp Anda.');
    } else {
      let msg = 'Gagal memproses invoice.';
      try { const err = await res.json(); msg = err.detail || msg; } catch(_) {}
      showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', msg);
    }
  } catch (err) {
    showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Error', err.message || 'Terjadi kesalahan jaringan.');
  } finally {
    btnEl.disabled = false;
    btnEl.innerHTML = originalHtml;
  }
}

async function initProfil() {
  const auth = requireAuth(['CUSTOMER'], '../../login.html');
  if (!auth) return;

  renderNavbar('navbar', { active: 'profil', rootPath: '../../' });
  renderToastMarkup('toast-root');

  const saved = getDemoProfile();
  let profile = {
    nama: auth.user.nama || '',
    email: auth.user.email || '',
    telp: saved?.telp || '',
    alamat: saved?.alamat || '',
    nik: '',
  };

  const pid = auth.user.sub || auth.user.id;
  if (pid && !pid.startsWith('plg-demo')) {
    try {
      const res = await apiFetch(`/pelanggan/${pid}`, {}, '../../login.html');
      if (res && res.ok) {
        const data = await res.json();
        profile.nama = data.nama || profile.nama;
        profile.email = data.email || profile.email;
        profile.telp = data.telepon || profile.telp;
        profile.alamat = data.alamat || profile.alamat;
        profile.nik = data.no_ktp || '';
        if (data.foto_sim) {
            const badgeSim = qs('badge-sim');
            const btnUploadSim = qs('btn-upload-sim');
            if (badgeSim) {
                badgeSim.textContent = 'Terverifikasi';
                badgeSim.className = 'badge badge-aktif';
            }
            if (btnUploadSim) {
                btnUploadSim.style.display = 'none';
            }
        }
      }
    } catch (err) {
      console.warn("Gagal memuat profil pelanggan dari server", err);
    }
  }

  qs('pf-avatar').innerHTML = auth.user.foto_profil_url ? `<img src="${auth.user.foto_profil_url}" style="width:100%;height:100%;object-fit:cover;">` : (profile.nama || '?')[0].toUpperCase();
  qs('pf-nama-display').textContent = profile.nama;
  qs('pf-email-display').textContent = profile.email;
  qs('pf-nama').value = profile.nama;
  qs('pf-email').value = profile.email;
  qs('pf-telp').value = profile.telp;
  qs('pf-alamat').value = profile.alamat;
  if (qs('pf-nik')) qs('pf-nik').value = profile.nik || 'Belum terisi';

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
    if (typeof renderCustomerSidebar === 'function') renderCustomerSidebar('cs-sidebar', { active: 'profil', rootPath: '../../' });
    if (typeof renderNavbar === 'function') renderNavbar('navbar', { active: 'profil', rootPath: '../../' });
  } else {
    showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Gagal mengunggah foto profil.');
  }
}

async function handleSimUploadProfil(event) {
  const file = event.target.files[0];
  if (!file) return;

  const btnUpload = document.getElementById('btn-upload-sim');
  const badgeSim = document.getElementById('badge-sim');
  const originalHtml = btnUpload.innerHTML;
  btnUpload.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#111;"></span> Mengompresi...';
  btnUpload.disabled = true;
  let compressedFile;
  try {
    compressedFile = await compressImageFile(file, 0.95);
  } catch (e) {
    console.error('Gagal kompresi SIM:', e);
    compressedFile = file;
  }
  if (compressedFile.size > 1 * 1024 * 1024) {
    showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Terlalu Besar', `Foto SIM masih ${(compressedFile.size / 1024 / 1024).toFixed(1)} MB setelah kompresi. Coba ambil foto dengan resolusi lebih rendah.`);
    btnUpload.innerHTML = originalHtml;
    btnUpload.disabled = false;
    return;
  }

  btnUpload.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#111;"></span> Memvalidasi SIM...';

  const formData = new FormData();
  formData.append('foto_sim', compressedFile);

  const res = await apiFetch('/ocr/sim-validate', {
    method: 'POST',
    body: formData
  });

  btnUpload.innerHTML = originalHtml;
  btnUpload.disabled = false;

  if (res && res.ok) {
    const data = await res.json();
    if (data.validasi_nama === 'cocok') {
      showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'SIM Valid ✅', data.message);
    } else {
      showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'SIM Diunggah', data.message);
    }
    if (badgeSim) {
      badgeSim.textContent = 'Terverifikasi';
      badgeSim.className = 'badge badge-aktif';
    }
    btnUpload.style.display = 'none';
  } else {
    let errMsg = 'Gagal mengunggah foto SIM A.';
    try {
      const errData = await res.json();
      if (errData.detail) errMsg = errData.detail;
    } catch (_) {}
    showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', errMsg);
  }
}
