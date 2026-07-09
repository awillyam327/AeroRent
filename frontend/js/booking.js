/**
 * ==============================================================================
 * AeroRent — Logika Checkout (sewa.html)
 * Alur: Step 1 Jadwal -> Step 2 Data Diri -> Step 3 Selesai
 *
 * KETERBATASAN YANG DISADARI (lihat README_STRUKTUR.md & laporan Phase 1-2):
 * - Validasi bentrok tanggal sewa TIDAK diimplementasikan di sini. Backend
 *   tidak punya endpoint untuk mengecek jadwal kendaraan lain (endpoint yang
 *   ada untuk itu, GET /transaksi, dikunci untuk role KASIR/OWNER saja), jadi
 *   frontend tidak punya cara jujur untuk memvalidasi ini. Pesan error
 *   "tanggal bentrok" yang muncul di mockup TIDAK direplikasi secara palsu.
 * - Upload foto KTP hanya disimpan di memori untuk preview UI, tidak benar-benar
 *   diunggah ke server (tidak ada endpoint registrasi customer yang menerimanya).
 * ==============================================================================
 */

let S = {
  step: 1,
  vehicleId: null,
  vehicle: null,
  startDate: '',
  duration: 1,
  useDriver: false,
  nama: '',
  telp: '',
  alamat: '',
  ktpFile: null,
  simFile: null,
  hasSim: false,
  livenessFile: null,
  livenessPassed: false,
  stream: null,
  metodeBayar: 'TUNAI', // 'TUNAI' (Cash) | 'MIDTRANS' (Cashless)
  agreed: false,
  bookingResult: null,
};

async function initCheckout() {
  try {
    const auth = requireAuth(['CUSTOMER'], 'login.html');
    if (!auth) return; // requireAuth sudah redirect

    const params = new URLSearchParams(location.search);
    S.vehicleId = params.get('id');
    if (!S.vehicleId) {
      showCheckoutError('Tidak ada kendaraan yang dipilih. Silakan kembali ke halaman Armada.');
      return;
    }

    try {
      S.vehicle = await fetchVehicleById(S.vehicleId);
    } catch (fetchErr) {
      console.error('fetchVehicleById error:', fetchErr);
      S.vehicle = null;
    }

    if (!S.vehicle) {
      showCheckoutError('Kendaraan tidak ditemukan atau server sedang tidak tersedia. Silakan coba lagi.');
      return;
    }
    if (S.vehicle.status !== 'TERSEDIA') {
      showCheckoutError(`${S.vehicle.nama_kendaraan} sedang tidak tersedia untuk disewa saat ini.`);
      return;
    }

    try {
      // Default tanggal mulai = besok
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      S.startDate = tomorrow.toISOString().split('T')[0];
      qs('jadwal-tanggal').value = S.startDate;
      qs('jadwal-durasi').value = S.duration;

      qs('co-loading').classList.add('hidden');
      qs('co-content').classList.remove('hidden');
      renderSummary();
      validateStep1();
    } catch (uiErr) {
      console.error('initCheckout UI render error:', uiErr);
      showCheckoutError('Terjadi kesalahan saat menampilkan halaman. Silakan refresh.');
      return;
    }

    // Auto-isi Data Diri dari profil Customer yang sudah login
    try {
      const profile = getDemoProfile();
      qs('dd-nama').value = profile?.nama || auth.user.nama || '';
      qs('dd-telp').value = profile?.telp || '';
      qs('dd-alamat').value = profile?.alamat || '';
    } catch (_) {}

    // Ambil data pelanggan asli dari backend
    try {
      const pId = auth.user.id || auth.user.sub;
      if (pId && !pId.startsWith('plg-demo')) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${API_BASE}/pelanggan/${pId}`, {
          headers: { 'Authorization': `Bearer ${auth.access_token}` },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data.nama) { qs('dd-nama').value = data.nama; qs('dd-nama').readOnly = true; qs('dd-nama').style.opacity = '0.6'; }
          if (data.telepon) { qs('dd-telp').value = data.telepon; qs('dd-telp').readOnly = true; qs('dd-telp').style.opacity = '0.6'; }
          if (data.alamat) { qs('dd-alamat').value = data.alamat; qs('dd-alamat').readOnly = true; qs('dd-alamat').style.opacity = '0.6'; }
          if (data.no_ktp) { qs('dd-nik').value = data.no_ktp; qs('dd-nik').readOnly = true; qs('dd-nik').style.opacity = '0.6'; }
          if (data.foto_ktp) {
            S.ktpUrl = data.foto_ktp;
            qs('ktp-empty').classList.add('hidden');
            qs('ktp-done').classList.remove('hidden');
            qs('ktp-filename').textContent = 'KTP sudah tersimpan di profil';
          }
          if (data.foto_sim) {
            S.hasSim = true;
            S.simUrl = data.foto_sim;
            qs('sim-empty').classList.add('hidden');
            qs('sim-done').classList.remove('hidden');
            qs('sim-filename').textContent = 'SIM A sudah tersimpan di profil';
            const btnSim = qs('btn-upload-sewa-sim');
            if (btnSim) btnSim.style.display = 'none';
          }
        }
      }
    } catch (e) {
      console.warn("Gagal memuat profil pelanggan", e);
    }

    try { onDataDiriChange(); } catch (_) {}

    // Load Midtrans Snap JS dynamically
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${API_BASE}/config/midtrans`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
          const data = await res.json();
          if (data.client_key) {
              const script = document.createElement('script');
              script.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
              script.setAttribute('data-client-key', data.client_key);
              document.head.appendChild(script);
          }
      }
    } catch (e) {
      console.warn("Gagal memuat config midtrans", e);
    }
  } catch (err) {
    console.error('Fatal initCheckout error:', err);
    showCheckoutError('Terjadi kesalahan sistem yang tidak terduga. Silakan coba lagi nanti.');
  }
}

function showCheckoutError(msg) {
  qs('co-loading').classList.add('hidden');
  qs('co-error').classList.remove('hidden');
  qs('co-error-msg').textContent = msg;
}

/* ---------- Kalkulasi biaya ---------- */
function calcBiayaSewa() { return (S.vehicle?.harga_sewa_harian || 0) * S.duration; }
function calcBiayaSupir() { return S.useDriver ? (S.vehicle?.harga_supir_harian || 150000) * S.duration : 0; }
function calcTotal() { return calcBiayaSewa() + calcBiayaSupir(); }

/* ---------- Render ringkasan kanan (dipakai step 1 & 2) ---------- */
function renderSummary() {
  const v = S.vehicle;
  qs('sum-foto').innerHTML = v.foto_url
    ? `<img src="${v.foto_url}" alt="${v.nama_kendaraan}">`
    : `<div class="vehicle-photo-placeholder" style="font-size:24px;"><i class="ph ph-car"></i></div>`;
  qs('sum-nama').textContent = v.nama_kendaraan;
  qs('sum-spec').textContent = `${TIPE_LABEL[v.tipe_kendaraan] || v.tipe_kendaraan} • ${rp(v.harga_sewa_harian)}/hari`;

  qs('sum-sewa-label').textContent = `Biaya Sewa (${S.duration} hari)`;
  qs('sum-sewa-val').textContent = rp(calcBiayaSewa());
  qs('sum-supir-row').classList.toggle('hidden', !S.useDriver);
  qs('sum-supir-val').textContent = rp(calcBiayaSupir());
  qs('sum-total').textContent = rp(calcTotal());

  // Elemen khusus step 2 (mungkin belum ada saat step 1)
  const tglEl = qs('sum-tanggal');
  if (tglEl) tglEl.textContent = fmtD(S.startDate);
  const metodeEl = qs('sum-metode');
  if (metodeEl) metodeEl.textContent = S.metodeBayar === 'TUNAI' ? 'Bayar di Tempat (Cash)' : 'Pelunasan Web (Cashless)';
}

/* ---------- STEP 1: Jadwal & Layanan ---------- */
function onJadwalChange() {
  S.startDate = qs('jadwal-tanggal').value;
  S.duration = Math.max(1, parseInt(qs('jadwal-durasi').value || '1', 10));
  renderSummary();
  validateStep1();
}
function toggleDriver() {
  S.useDriver = qs('jadwal-supir').checked;
  renderSummary();
}
function validateStep1() {
  const valid = !!S.startDate && S.duration >= 1;
  qs('btn-step1-next').disabled = !valid;
  return valid;
}
function goToStep2() {
  if (!validateStep1()) return;
  S.step = 2;
  updateStepIndicator();
  qs('panel-step1').classList.add('hidden');
  qs('panel-step2').classList.remove('hidden');
  qs('summary-step1-actions').classList.add('hidden');
  qs('summary-step2-actions').classList.remove('hidden');
  qs('sim-upload-zone').classList.toggle('hidden', S.useDriver);
  qs('liveness-zone').classList.toggle('hidden', S.useDriver);
  renderSummary();
  validateStep2();
}

/* ---------- STEP 2: Data Diri ---------- */
function onDataDiriChange() {
  S.nik = qs('dd-nik') ? qs('dd-nik').value.replace(/\D/g, '') : '';
  if (qs('dd-nik')) qs('dd-nik').value = S.nik; // auto format only numbers
  S.nama = qs('dd-nama').value.trim();
  S.telp = qs('dd-telp').value.trim();
  S.alamat = qs('dd-alamat').value.trim();
  S.agreed = qs('dd-agree').checked;
  validateStep2();
}
function onKtpUpload(input) {
  S.ktpFile = input.files[0] || null;
  qs('ktp-empty').classList.toggle('hidden', !!S.ktpFile);
  qs('ktp-done').classList.toggle('hidden', !S.ktpFile);
  if (S.ktpFile) qs('ktp-filename').textContent = S.ktpFile.name;
  validateStep2();
}
function setMetodeBayar(metode) {
  S.metodeBayar = metode;
  qs('btn-cash').classList.toggle('btn-primary', metode === 'TUNAI');
  qs('btn-cash').classList.toggle('btn-ghost', metode !== 'TUNAI');
  qs('btn-cashless').classList.toggle('btn-primary', metode === 'MIDTRANS');
  qs('btn-cashless').classList.toggle('btn-ghost', metode !== 'MIDTRANS');
  renderSummary();
}
async function onSimUpload(input) {
  const rawFile = input.files[0] || null;
  if (!rawFile) return;

  // Kompresi gambar ke bawah 1MB
  try {
    S.simFile = await compressImageFile(rawFile, 0.95);
  } catch (e) {
    S.simFile = rawFile;
  }

  qs('sim-empty').classList.toggle('hidden', !!S.simFile);
  qs('sim-done').classList.toggle('hidden', !S.simFile);
  if (S.simFile) {
    const sizeMB = (S.simFile.size / 1024 / 1024).toFixed(1);
    qs('sim-filename').textContent = `${S.simFile.name} (${sizeMB} MB)`;
  }
  validateStep2();
}
async function uploadSewaSim() {
  if (!S.simFile) return showToast('<i class="ph-fill ph-warning-circle" style="color:#F59E0B;"></i>', 'Perhatian', 'Pilih file SIM A terlebih dahulu.');
  
  // Validasi ukuran
  if (S.simFile.size > 1 * 1024 * 1024) {
    showToast('<i class="ph-fill ph-warning-circle" style="color:#F59E0B;"></i>', 'Terlalu Besar', `Foto SIM masih ${(S.simFile.size / 1024 / 1024).toFixed(1)} MB. Coba ambil foto dengan resolusi lebih rendah.`);
    return;
  }

  const btn = qs('btn-upload-sewa-sim');
  const statusEl = qs('sewa-sim-status');
  const ori = btn.innerHTML;
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#111;"></span> Memvalidasi SIM...';
  btn.disabled = true;
  if (statusEl) { statusEl.classList.remove('hidden'); statusEl.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Membaca nama di SIM via OCR...'; }

  const fd = new FormData();
  fd.append('foto_sim', S.simFile);
  const auth = getAuth();
  try {
      const res = await fetch(`${API_BASE}/ocr/sim-validate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${auth.access_token}` },
          body: fd
      });
      const data = await res.json();
      if (res.ok) {
          S.hasSim = true;
          if (data.validasi_nama === 'cocok') {
            showToast('<i class="ph-fill ph-check-circle" style="color:#10B981;"></i>', 'SIM Valid ✅', data.message);
            if (statusEl) { statusEl.innerHTML = `<i class="ph-fill ph-check-circle" style="color:#10B981;"></i> ${data.message}`; }
          } else {
            showToast('<i class="ph-fill ph-warning-circle" style="color:#F59E0B;"></i>', 'SIM Diunggah', data.message);
            if (statusEl) { statusEl.innerHTML = `<i class="ph-fill ph-warning-circle" style="color:#F59E0B;"></i> ${data.message}`; }
          }
          btn.style.display = 'none';
          validateStep2();
      } else {
          const errMsg = data.detail || 'Gagal mengunggah SIM A.';
          showToast('<i class="ph-fill ph-x-circle" style="color:#EF4444;"></i>', 'SIM Ditolak', errMsg);
          if (statusEl) { statusEl.innerHTML = `<i class="ph-fill ph-x-circle" style="color:#EF4444;"></i> ${errMsg}`; }
      }
  } catch(e) {
      showToast('<i class="ph-fill ph-x-circle" style="color:#EF4444;"></i>', 'Gagal', 'Terjadi kesalahan jaringan.');
      if (statusEl) { statusEl.innerHTML = '<i class="ph-fill ph-x-circle" style="color:#EF4444;"></i> Kesalahan jaringan.'; }
  } finally {
      btn.innerHTML = ori;
      btn.disabled = false;
  }
}
function validateStep2() {
  const simValid = S.useDriver ? true : !!(S.hasSim || S.simFile);
  const livenessValid = S.useDriver ? true : S.livenessPassed;
  const nikValid = S.nik && S.nik.length === 16;
  const valid = !!(nikValid && S.nama && S.telp && S.alamat && (S.ktpFile || S.ktpUrl) && simValid && livenessValid && S.agreed);
  qs('btn-step2-submit').disabled = !valid;
  return valid;
}

// LIVENESS FUNCTIONS
async function startCamera() {
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const video = qs('liveness-video');
    video.srcObject = S.stream;
    qs('btn-start-camera').style.display = 'none';
    qs('camera-container').style.display = 'block';
    qs('liveness-result').style.display = 'none';
    S.livenessPassed = false;
    validateStep2();
  } catch (err) {
    showToast('<i class="ph-fill ph-x-circle" style="color:#EF4444;"></i>', 'Kamera Error', 'Tidak dapat mengakses kamera.');
  }
}

function stopCamera() {
  if (S.stream) {
    S.stream.getTracks().forEach(track => track.stop());
    S.stream = null;
  }
}

async function captureLiveness() {
  const video = qs('liveness-video');
  const canvas = qs('liveness-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  canvas.toBlob(async (blob) => {
    S.livenessFile = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
    qs('liveness-preview').src = URL.createObjectURL(S.livenessFile);
    stopCamera();
    qs('camera-container').style.display = 'none';
    qs('liveness-result').style.display = 'block';
    
    // Auto-upload SIM if needed before matching
    if (!S.hasSim && S.simFile) {
      qs('liveness-status-text').innerHTML = '<span class="spinner" style="width:12px;height:12px;"></span> Memvalidasi SIM A via OCR...';
      const fd = new FormData();
      fd.append('foto_sim', S.simFile);
      const auth = getAuth();
      try {
        const res = await fetch(`${API_BASE}/ocr/sim-validate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${auth.access_token}` },
          body: fd
        });
        const data = await res.json();
        if (res.ok) {
          S.hasSim = true;
          const btnSim = qs('btn-upload-sewa-sim');
          if(btnSim) btnSim.style.display = 'none';
        } else {
          const errMsg = data.detail || 'Gagal mengunggah SIM A';
          qs('liveness-status-text').innerHTML = `<span style="color:#EF4444;"><i class="ph-fill ph-x-circle"></i> ${errMsg}</span>`;
          qs('btn-retake-camera').disabled = false;
          return;
        }
      } catch (e) {
        qs('liveness-status-text').innerHTML = '<span style="color:#EF4444;">Koneksi Error</span>';
        qs('btn-retake-camera').disabled = false;
        return;
      }
    }
    
    // Call Face Match API
    qs('liveness-status-text').innerHTML = '<span class="spinner" style="width:12px;height:12px;"></span> Menganalisa Wajah...';
    qs('btn-retake-camera').disabled = true;
    
    const fd = new FormData();
    fd.append('selfie', S.livenessFile);
    const auth = getAuth();
    
    try {
      const res = await fetch(`${API_BASE}/ocr/face-match`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.access_token}` },
        body: fd
      });
      const data = await res.json();
      
      if (res.ok && data.match_score >= 80) {
        S.livenessPassed = true;
        qs('liveness-status-text').innerHTML = `<span style="color:#10B981;"><i class="ph-fill ph-check-circle"></i> Cocok (${data.match_score}%)</span>`;
        qs('btn-retake-camera').disabled = false;
        validateStep2();
      } else {
        S.livenessPassed = false;
        const msg = data.detail || (data.match_score ? `Tidak cocok (${data.match_score}%)` : 'Gagal memverifikasi');
        qs('liveness-status-text').innerHTML = `<span style="color:#EF4444;"><i class="ph-fill ph-x-circle"></i> ${msg}</span>`;
        qs('btn-retake-camera').disabled = false;
      }
    } catch (e) {
      qs('liveness-status-text').innerHTML = '<span style="color:#EF4444;">Kesalahan jaringan saat verifikasi.</span>';
      qs('btn-retake-camera').disabled = false;
    }
    
  }, 'image/jpeg', 0.8);
}

function retakeLiveness() {
  S.livenessPassed = false;
  S.livenessFile = null;
  startCamera();
}
function backToStep1() {
  S.step = 1;
  updateStepIndicator();
  qs('panel-step2').classList.add('hidden');
  qs('panel-step1').classList.remove('hidden');
  qs('summary-step2-actions').classList.add('hidden');
  qs('summary-step1-actions').classList.remove('hidden');
}

function updateStepIndicator() {
  document.querySelectorAll('.step-pill').forEach((el) => {
    const n = parseInt(el.dataset.step, 10);
    el.classList.toggle('step-done', n < S.step);
    el.classList.toggle('step-active', n === S.step);
  });
}

/* ---------- SUBMIT BOOKING ---------- */
async function submitBooking() {
  if (!validateStep2()) return;
  const btn = qs('btn-step2-submit');
  
  if (!S.useDriver && !S.hasSim && S.simFile) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Memvalidasi SIM A...';
      const fd = new FormData();
      fd.append('foto_sim', S.simFile);
      const auth = getAuth();
      try {
          const res = await fetch(`${API_BASE}/ocr/sim-validate`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${auth.access_token}` },
              body: fd
          });
          const data = await res.json();
          if (res.ok) {
              S.hasSim = true;
              const btnSim = qs('btn-upload-sewa-sim');
              if(btnSim) btnSim.style.display = 'none';
          } else {
              const errMsg = data.detail || 'Gagal mengunggah SIM A.';
              showToast('<i class="ph-fill ph-x-circle" style="color:#EF4444;"></i>', 'SIM Ditolak', errMsg);
              btn.disabled = false;
              btn.innerHTML = 'Konfirmasi & Sewa →';
              return;
          }
      } catch(e) {
          showToast('<i class="ph-fill ph-x-circle" style="color:#EF4444;"></i>', 'Gagal', 'Gagal mengunggah SIM A (Jaringan).');
          btn.disabled = false;
          btn.innerHTML = 'Konfirmasi & Sewa →';
          return;
      }
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Memproses...';

  const auth = getAuth();
  
  // Sync Data Diri (termasuk NIK) ke Backend
  try {
    await fetch(`${API_BASE}/pelanggan/saya`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.access_token}`
      },
      body: JSON.stringify({
        nama: S.nama,
        telp: S.telp,
        alamat: S.alamat,
        nik: S.nik
      })
    });
  } catch(e) {
    console.warn("Gagal update profil pelanggan sebelum checkout:", e);
  }

  const tglMulai = S.startDate;
  const tglSelesai = addDays(S.startDate, S.duration);

  const payload = {
    id_pelanggan: auth.user.sub || auth.user.id,
    id_kendaraan: S.vehicleId,
    tanggal_mulai: tglMulai,
    tanggal_selesai_rencana: tglSelesai,
    gunakan_supir: S.useDriver ? 1 : 0,
    metode_pembayaran: S.metodeBayar,
    catatan_kasir: null,
  };

  try {
    const res = await fetch(`${API_BASE}/transaksi`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.access_token}`
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Backend menolak permintaan (kemungkinan id_pelanggan demo tidak terdaftar di database asli).');
    const result = await res.json();
    S.bookingResult = { nomorBooking: result.nomor_booking, total: result.total_biaya, demo: false, id_transaksi: result.id_transaksi };
    
    if (S.metodeBayar === 'MIDTRANS') {
        btn.innerHTML = '<span class="spinner"></span> Membuka Pembayaran...';
        await processMidtransPayment(result.id_transaksi, auth.access_token);
        return; // processMidtransPayment will call goToStep3()
    }
  } catch (err) {
    const fakeSeq = Math.floor(1000 + Math.random() * 8999);
    S.bookingResult = {
      nomorBooking: `AR-${new Date().getFullYear()}${fakeSeq}`,
      total: calcTotal(),
      demo: true,
      id_transaksi: 'demo-' + Date.now()
    };
    addDemoBooking({
      id: S.bookingResult.id_transaksi,
      booking: S.bookingResult.nomorBooking,
      kendaraan: S.vehicle.nama_kendaraan,
      foto_kendaraan: S.vehicle.foto_url || '',
      mulai: tglMulai,
      selesai_rencana: tglSelesai,
      durasi: S.duration,
      total: S.bookingResult.total,
      status: 'MENUNGGU',
      created_at: new Date().toISOString(),
    });
    
    if (S.metodeBayar === 'MIDTRANS') {
        showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Mode Demo', 'Pembayaran Midtrans tidak dapat disimulasikan dalam mode offline/demo.');
    }
  }

  goToStep3();
}

async function processMidtransPayment(tid, token) {
  try {
    const res = await fetch(`${API_BASE}/transaksi/${tid}/midtrans-snap`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Gagal mendapatkan token pembayaran.');
    const data = await res.json();
    
    window.snap.pay(data.snap_token, {
      onSuccess: function(result) {
        showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Pembayaran Berhasil', 'Terima kasih, pembayaran Anda telah diterima.');
        goToStep3();
      },
      onPending: function(result) {
        showToast('<i class="ph-fill ph-hourglass-high" style="color: #3B82F6;"></i>', 'Menunggu Pembayaran', 'Silakan selesaikan pembayaran Anda.');
        goToStep3('PENDING');
      },
      onError: function(result) {
        showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Pembayaran Gagal', 'Terjadi kesalahan saat memproses pembayaran.');
        qs('btn-step2-submit').disabled = false;
        qs('btn-step2-submit').textContent = 'Konfirmasi & Sewa →';
        const bubble = document.getElementById('floating-pay-bubble');
        if (bubble) bubble.innerHTML = '<i class="ph ph-wallet" style="font-size:24px;"></i> Lanjutkan Pembayaran';
      },
      onClose: function() {
        showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Pembayaran Ditunda', 'Anda menutup popup pembayaran. Anda dapat melanjutkannya nanti melalui Dashboard.');
        goToStep3('PENDING');
      }
    });
  } catch (err) {
    showToast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Error', err.message);
    qs('btn-step2-submit').disabled = false;
    qs('btn-step2-submit').textContent = 'Konfirmasi & Sewa →';
    const bubble = document.getElementById('floating-pay-bubble');
    if (bubble) bubble.innerHTML = '<i class="ph ph-wallet" style="font-size:24px;"></i> Lanjutkan Pembayaran';
  }
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function goToStep3(status = 'SUCCESS') {
  S.step = 3;
  updateStepIndicator();
  qs('panel-step2').classList.add('hidden');
  qs('panel-step3').classList.remove('hidden');
  qs('summary-panel').classList.add('hidden');

  const user = getCurrentUser();
  const userName = user?.nama || S.nama;
  const bookingNum = S.bookingResult.nomorBooking;
  
  const p3 = qs('panel-step3');
  const icon = p3.querySelector('.success-icon');
  const title = p3.querySelector('h2');
  const desc = p3.querySelector('p');
  
  if (status === 'PENDING') {
    icon.innerHTML = '<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>';
    icon.style.color = 'var(--color-amber)';
    icon.style.borderColor = 'rgba(245,158,11,0.2)';
    icon.style.backgroundColor = 'rgba(245,158,11,0.05)';
    title.textContent = 'PEMESANAN DITUNDA';
    desc.innerHTML = `Terima kasih <strong style="color:#fff;">${userName}</strong>, pemesanan Anda (<span style="color:var(--color-amber);font-weight:700;">${bookingNum}</span>) telah dibuat, namun <strong>pembayaran belum diselesaikan</strong>. Silakan bayar melalui Dashboard, atau lanjutkan pembayaran sekarang.`;
    
    // Add floating bubble popup for payment resume
    let bubble = document.getElementById('floating-pay-bubble');
    if (!bubble) {
        bubble = document.createElement('button');
        bubble.id = 'floating-pay-bubble';
        bubble.style = 'position:fixed; bottom:30px; right:30px; z-index:9999; background:var(--color-primary); color:#fff; border:none; border-radius:50px; padding:16px 24px; box-shadow:0 10px 25px rgba(139,92,246,0.5); font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:10px; font-size:16px; transition: all 0.3s ease; animation: bounce 2s infinite;';
        bubble.innerHTML = '<i class="ph ph-wallet" style="font-size:24px;"></i> Lanjutkan Pembayaran';
        
        bubble.onmouseover = () => { bubble.style.transform = 'scale(1.05)'; bubble.style.boxShadow = '0 15px 35px rgba(139,92,246,0.7)'; bubble.style.animation = 'none'; };
        bubble.onmouseout = () => { bubble.style.transform = 'scale(1)'; bubble.style.boxShadow = '0 10px 25px rgba(139,92,246,0.5)'; bubble.style.animation = 'bounce 2s infinite'; };
        
        bubble.onclick = () => {
            bubble.innerHTML = '<span class="spinner"></span> Membuka...';
            processMidtransPayment(S.bookingResult.id_transaksi, getAuth().access_token);
        };
        document.body.appendChild(bubble);
        
        if (!document.getElementById('bubble-anim')) {
            const style = document.createElement('style');
            style.id = 'bubble-anim';
            style.innerHTML = '@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }';
            document.head.appendChild(style);
        }
    } else {
        // Reset button text if it already exists (e.g. after closing midtrans popup)
        bubble.innerHTML = '<i class="ph ph-wallet" style="font-size:24px;"></i> Lanjutkan Pembayaran';
    }
  } else {
    icon.innerHTML = '✓';
    icon.style.color = '';
    icon.style.borderColor = '';
    icon.style.backgroundColor = '';
    title.textContent = 'PEMESANAN BERHASIL!';
    desc.innerHTML = `Terima kasih <strong style="color:#fff;">${userName}</strong>, pemesanan Anda (<span style="color:var(--color-amber);font-weight:700;">${bookingNum}</span>) telah diterima sistem AeroRent Salatiga. Tim admin kami akan mengirimkan rincian invoice dan info supir via WhatsApp dalam waktu maksimal 10 menit.`;
    
    const bubble = document.getElementById('floating-pay-bubble');
    if (bubble) bubble.remove();
  }
  
  if (S.bookingResult.demo) {
    showToast('<i class="ph-fill ph-flask" style="color: #8B5CF6;"></i>', 'Mode Demo', 'Booking ini tidak benar-benar tersimpan ke server (lihat catatan di kode).');
  }
}

async function scanSewaKtp() {
  const inp = document.getElementById('dd-ktp');
  if (!inp.files.length) {
    showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Peringatan', 'Silakan pilih atau ambil foto KTP terlebih dahulu.');
    return;
  }
  
  let file = inp.files[0];
  const statusEl = document.getElementById('sewa-ktp-status');
  const btn = document.getElementById('btn-scan-sewa-ktp');
  
  statusEl.classList.remove('hidden', 'text-green-400', 'text-red-400');
  statusEl.classList.add('text-gray-500');
  statusEl.innerHTML = '<div class="spin inline-block mx-auto" style="width:12px;height:12px;border-width:2px;vertical-align:-2px;margin-right:6px;"></div>Mengompresi & Memproses OCR...';
  btn.disabled = true;

  try {
    file = await compressImageFile(file, 0.95);
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
      if (res.nik) { document.getElementById('dd-nik').value = res.nik; msg.push('NIK'); }
      if (res.nama) { document.getElementById('dd-nama').value = res.nama; msg.push('Nama'); }
      if (res.alamat) { document.getElementById('dd-alamat').value = res.alamat; msg.push('Alamat'); }
      
      if (msg.length > 0) {
        showToast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'OCR Berhasil', `Berhasil mengisi: ${msg.join(', ')}`);
        statusEl.innerHTML = '<i class="ph-fill ph-check-circle" style="color: #10B981;"></i> ' + msg.join(', ') + ' berhasil diisi.';
        statusEl.classList.add('text-green-400');
        onDataDiriChange();
      } else {
        showToast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'OCR Selesai', 'KTP dibaca tapi data tidak ditemukan.');
        statusEl.innerHTML = 'Data tidak jelas / blur.';
      }
    } else {
      let errMsg = 'Gagal membaca KTP.';
      try {
        const errRes = await r.json();
        if (errRes.detail) errMsg = errRes.detail;
      } catch(e) {}
      statusEl.innerHTML = '<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i> ' + errMsg;
      statusEl.classList.add('text-red-400');
    }
  } catch (e) {
    statusEl.innerHTML = '<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i> Terjadi kesalahan.';
    statusEl.classList.add('text-red-400');
  }
  btn.disabled = false;
}

document.addEventListener('DOMContentLoaded', () => {
  renderToastMarkup('toast-root');
  initCheckout();
});
