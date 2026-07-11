'use strict';
    // ============================================================
    // KONFIGURASI & GLOBAL STATE
    // ============================================================
    const API = API_BASE;
    const AUTH_KEY = 'aerorent_auth';
    const IDB_NAME = 'aerorent-pos-idb';

    let S = {
      user: null, token: null, online: navigator.onLine,
      list: [], filtered: [], selected: null,
      filter: 'semua', files: { d: null, s: null, b: null },
      fotoJenis: null, idb: null, dendaTLbt: 0,
    };

    // ============================================================
    // INISIALISASI
    // ============================================================
    async function init() {
      const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      if (!auth?.access_token) { window.location.href = 'login.html'; return; }
      S.token = auth.access_token;
      S.user = auth.user;

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
          .then(() => navigator.serviceWorker.addEventListener('message', onSwMsg))
          .catch(e => console.warn('[SW] Gagal registrasi:', e));
      }

      document.head.insertAdjacentHTML('beforeend', '<link rel="manifest" id="pwa-m">');
      const mblob = new Blob([JSON.stringify({
        name: 'AeroRent POS', short_name: 'AeroPOS', start_url: './',
        display: 'standalone', background_color: '#0A0A14', theme_color: '#7C3AED'
      })], { type: 'application/json' });
      document.getElementById('pwa-m').href = URL.createObjectURL(mblob);

      document.getElementById('hdr-user').textContent = auth.user?.nama || '—';
      document.getElementById('hdr-date').textContent = new Date().toLocaleDateString('id-ID',
        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

      S.idb = await openIDB();
      window.addEventListener('online', onConn);
      window.addEventListener('offline', onConn);
      onConn();
      await loadList();
    }
    window.addEventListener('load', init);


    // ============================================================
    // IndexedDB
    // ============================================================
    function openIDB() {
      return new Promise((res, rej) => {
        const r = indexedDB.open(IDB_NAME, 1);
        r.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('transaksi')) {
            const s = db.createObjectStore('transaksi', { keyPath: 'id_transaksi' });
            s.createIndex('by_nb', 'nomor_booking', { unique: false });
            s.createIndex('by_st', 'status', { unique: false });
          }
          if (!db.objectStoreNames.contains('offline_queue')) {
            db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true });
          }
        };
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
    }
    const idbPut = (st, d) => new Promise((res, rej) => { const tx = S.idb.transaction(st, 'readwrite'); const r = tx.objectStore(st).put(d); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
    const idbGet = (st, k) => new Promise((res, rej) => { const tx = S.idb.transaction(st, 'readonly'); const r = tx.objectStore(st).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const idbAll = (st) => new Promise((res, rej) => { const tx = S.idb.transaction(st, 'readonly'); const r = tx.objectStore(st).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
    const idbAdd = (st, d) => new Promise((res, rej) => { const tx = S.idb.transaction(st, 'readwrite'); const r = tx.objectStore(st).add(d); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const idbDel = (st, k) => new Promise((res, rej) => { const tx = S.idb.transaction(st, 'readwrite'); const r = tx.objectStore(st).delete(k); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });


    // ============================================================
    // KONEKSI & SYNC
    // ============================================================
    function onConn() {
      S.online = navigator.onLine;
      el('conn-dot').style.background = S.online ? '#10B981' : '#EF4444';
      el('conn-lbl').textContent = S.online ? 'Online' : 'Offline';
      if (S.online) syncQueue();
      refreshQueueBadge();
    }

    async function refreshQueueBadge() {
      const q = await idbAll('offline_queue');
      el('queue-badge').classList.toggle('hidden', q.length === 0);
      el('btn-sync').classList.toggle('hidden', q.length === 0);
      if (q.length) el('queue-n').textContent = q.length;
    }

    async function syncQueue() {
      const q = await idbAll('offline_queue');
      for (const item of q) {
        try {
          const r = await fetch(API + item.endpoint, {
            method: item.method,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
            body: JSON.stringify(item.body)
          });
          if (r.ok) { await idbDel('offline_queue', item.id); toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Sync OK', `${item.nb || item.endpoint} tersinkronisasi.`); }
        } catch (err) {
          if (err.name === 'TypeError' || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('fetch')) {
            toast('<i class="ph-fill ph-wifi-slash" style="color: #EF4444;"></i>', 'Koneksi Error', 'Terjadi kesalahan saat sinkronisasi ke server.');
          }
        }
      }
      refreshQueueBadge();
    }
    function manualSync() { syncQueue(); }
    function onSwMsg(ev) { if (ev.data?.type === 'SYNC_SUCCESS') { toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Sync OK', `${ev.data.nomor_booking} berhasil.`); loadList(); } }


    // ============================================================
    // API HELPER (ANTI-CACHE VERSION)
    // ============================================================
    async function api(path, opts = {}) {
      const headers = {
        'Content-Type': 'application/json',
        ...(S.token ? { 'Authorization': 'Bearer ' + S.token } : {}),
        ...(opts.headers || {})
      };
      try {
        // Tambahan cache: 'no-store' agar browser selalu meminta data segar ke server
        const r = await fetch(API + path, { ...opts, headers, cache: 'no-store' });
        if (r.status === 401) {
          localStorage.removeItem(AUTH_KEY);
          window.location.href = 'login.html';
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

    // ============================================================
    // LOAD & RENDER LIST TRANSAKSI (Panel Kiri)
    // ============================================================
    async function loadList() {
      el('list-loading').classList.remove('hidden');
      el('list-empty').classList.add('hidden');
      clearCards();

      let rows = [];
      if (S.online) {
        const param = S.filter !== 'semua' ? `?status=${S.filter}` : '';
        const r = await api(`/transaksi${param}`);
        if (r?.ok) {
          rows = await r.json();
          for (const t of rows) await idbPut('transaksi', mapToIdb(t)).catch(() => { });
        } else {
          toast('<i class="ph ph-broadcast"></i>', 'Memuat dari cache', 'Tidak dapat menjangkau server.');
          rows = (await idbAll('transaksi')).map(idbToRow);
        }
      } else {
        rows = (await idbAll('transaksi')).map(idbToRow);
      }

      S.list = rows;
      applyFilter();
      el('list-loading').classList.add('hidden');
      renderList(S.filtered);
      refreshQueueBadge();
    }

    function applyFilter() {
      S.filtered = S.filter === 'semua'
        ? [...S.list]
        : S.list.filter(t => t.status === S.filter);
    }

    function mapToIdb(t) {
      return {
        id_transaksi: t.id || t.id_transaksi,
        nomor_booking: t.booking || t.nomor_booking,
        pelanggan_nama: t.pelanggan || t.pelanggan?.nama,
        kendaraan_nama: t.kendaraan || t.kendaraan?.nama,
        status: t.status, mulai: t.mulai || t.tanggal_mulai,
        selesai: t.selesai_rencana || t.tanggal_selesai_rencana,
        durasi: t.durasi || t.durasi_hari_rencana,
        total: t.total || t.total_biaya,
        foto: t.foto_kendaraan || t.kendaraan?.foto,
        cached_at: new Date().toISOString()
      };
    }
    function idbToRow(c) {
      return {
        id: c.id_transaksi, booking: c.nomor_booking,
        pelanggan: c.pelanggan_nama, kendaraan: c.kendaraan_nama,
        status: c.status, mulai: c.mulai, selesai_rencana: c.selesai,
        durasi: c.durasi, total: c.total, foto_kendaraan: c.foto
      };
    }

    function clearCards() {
      const l = el('trx-list');
      [...l.children].forEach(c => { if (c.id !== 'list-empty' && c.id !== 'list-loading') c.remove(); });
    }

    function renderList(list) {
      clearCards();
      el('list-empty').classList.toggle('hidden', list.length > 0);
      const l = el('trx-list');

      list.forEach(t => {
        const isLate = t.status === 'AKTIF' && t.selesai_rencana && new Date(t.selesai_rencana) < new Date();
        const d = document.createElement('div');
        d.className = 'trx-card px-4 py-3 border-b border-white/5';
        d.dataset.id = t.id;
        d.onclick = () => selectTrx(t.id);
        d.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-mono font-bold text-sm">${t.booking || '—'}</span>
            ${badge(t.status)}
            ${isLate ? '<span class="badge b-dibatalkan">⚠ Telat</span>' : ''}
          </div>
          <div class="text-sm font-medium text-gray-200 truncate mt-0.5">${t.kendaraan || '—'}</div>
          <div class="text-xs text-gray-500 mt-0.5 truncate">${t.pelanggan || '—'}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-xs font-bold" style="color:#F59E0B;">${rp(t.total || 0)}</div>
          <div class="text-xs text-gray-600 mt-0.5">${fmtDT(t.mulai)}</div>
        </div>
      </div>`;
        l.appendChild(d);
      });
    }


    // ============================================================
    // SEARCH & FILTER (Panel Kiri)
    // ============================================================
    function onSearchInput(v) {
      if (!v.trim()) { applyFilter(); renderList(S.filtered); return; }
      const q = v.toLowerCase();
      S.filtered = S.list.filter(t =>
        (t.booking || '').toLowerCase().includes(q) ||
        (t.pelanggan || '').toLowerCase().includes(q) ||
        (t.kendaraan || '').toLowerCase().includes(q)
      );
      renderList(S.filtered);
    }
    function searchTrx() { onSearchInput(el('search-in').value); }

    function setFilter(f) {
      S.filter = f;
      document.querySelectorAll('.ftab').forEach(b => {
        const active = b.dataset.f === f;
        b.style.background = active ? '#7C3AED' : '';
        b.style.color = active ? 'white' : '';
        b.classList.toggle('active', active);
      });
      loadList();
    }


    // ============================================================
    // SELECT & RENDER DETAIL TRANSAKSI (Panel Kanan)
    // ============================================================
    async function selectTrx(id) {
      document.querySelectorAll('.trx-card').forEach(c => c.classList.remove('selected'));
      const card = document.querySelector(`.trx-card[data-id="${id}"]`);
      if (card) card.classList.add('selected');

      el('det-empty').classList.add('hidden');
      el('det-content').classList.remove('hidden');
      el('action-bar').innerHTML = `<div class="flex items-center justify-center gap-2 py-2 text-gray-600 text-sm"><div class="spin"></div>Memuat...</div>`;

      let trx = null;
      if (S.online) {
        const r = await api(`/transaksi/${id}`);
        if (r?.ok) {
          trx = await r.json();
          await idbPut('transaksi', { ...trx, cached_at: new Date().toISOString() }).catch(() => { });
        }
      }
      if (!trx) trx = await idbGet('transaksi', id);
      if (!trx) { el('action-bar').innerHTML = `<p class="text-red-400 text-sm text-center py-2">Data tidak ditemukan.</p>`; return; }

      S.selected = trx;
      renderDetail(trx);
      renderActions(trx);
      el('right-panel').classList.add('show');
    }

    function closeDetail() { el('right-panel').classList.remove('show'); }

    function renderDetail(t) {
      const p = t.pelanggan || {}, k = t.kendaraan || {};
      el('det-nb').textContent = t.nomor_booking || '—';
      el('det-badge').innerHTML = badge(t.status);
      el('det-created').textContent = t.created_at ? 'Dibuat: ' + fmtDT(t.created_at) : '';

      el('det-kend-foto').src = k.foto || k.foto_url || '';
      el('det-kend-nama').textContent = k.nama || k.nama_kendaraan || '—';
      el('det-kend-plat').textContent = k.plat || k.nomor_plat || '—';
      el('det-kend-tipe').textContent = [(k.tipe || k.tipe_kendaraan || '').replace('_', ' '), k.transmisi].filter(Boolean).join(' • ');

      const initPlg = (p.nama || p.nama_lengkap || '?')[0].toUpperCase();
      el('det-plg-av').textContent = initPlg;
      el('det-plg-nama').textContent = p.nama || p.nama_lengkap || '—';
      el('det-plg-telp').textContent = p.telepon || p.no_telepon || '—';
      const ktpEl = el('det-plg-ktp');
      if (p.foto_ktp || p.foto_ktp_url) { ktpEl.classList.remove('hidden'); ktpEl.href = p.foto_ktp || p.foto_ktp_url; }
      else ktpEl.classList.add('hidden');

      el('det-tgl-mulai').textContent = fmtDT(t.tanggal_mulai);
      el('det-tgl-selesai').textContent = fmtDT(t.tanggal_selesai_rencana);
      el('det-durasi').textContent = (t.durasi_hari || t.durasi_hari_rencana || '?') + ' hari';
      el('det-supir').textContent = t.gunakan_supir ? (t.id_supir ? `Supir = ${t.nama_supir || t.id_supir}` : 'Dengan Supir (Belum Ditentukan)') : 'Mandiri';
      el('det-supir').style.color = t.gunakan_supir ? '#34D399' : '#9CA3AF';

      // Alert keterlambatan
      const alertEl = el('alert-late');
      if (t.status === 'AKTIF' && t.tanggal_selesai_rencana) {
        const r = new Date(t.tanggal_selesai_rencana); r.setHours(0, 0, 0, 0);
        const n = new Date(); n.setHours(0, 0, 0, 0);
        if (n > r) {
          const hari = Math.floor((n - r) / 864e5);
          const dend = hari * (k.harga_harian || k.harga_sewa_harian || 0) * 1.5;
          S.dendaTLbt = dend;
          alertEl.classList.remove('hidden');
          el('alert-late-txt').textContent = `${hari} hari terlambat — estimasi denda: ${rp(dend)}`;
        } else { alertEl.classList.add('hidden'); S.dendaTLbt = 0; }
      } else { alertEl.classList.add('hidden'); S.dendaTLbt = 0; }

      // Biaya
      el('lbl-sewa').textContent = `Biaya Sewa (${t.durasi_hari || t.durasi_hari_rencana || '?'} hari)`;
      el('det-sewa').textContent = rp(t.biaya_sewa);
      el('det-total').textContent = rp(t.total_biaya);
      show('row-supir', t.gunakan_supir && (t.biaya_supir || 0) > 0);
      el('det-supir-cost').textContent = rp(t.biaya_supir);
      show('row-denda-t', (t.denda_terlambat || t.biaya_denda_terlambat || 0) > 0);
      el('det-denda-t').textContent = rp(t.denda_terlambat || t.biaya_denda_terlambat || 0);
      show('row-denda-k', (t.denda_kerusakan || t.biaya_denda_kerusakan || 0) > 0);
      el('det-denda-k').textContent = rp(t.denda_kerusakan || t.biaya_denda_kerusakan || 0);
      el('det-metode').textContent = t.metode_bayar || t.metode_pembayaran ? `Pembayaran: ${t.metode_bayar || t.metode_pembayaran} · ${t.status_bayar || t.status_pembayaran || '—'}` : '';

      renderFotoGrid('foto-before', t.foto_sebelum || []);
      renderFotoGrid('foto-after', t.foto_sesudah || []);
    }

    function renderFotoGrid(id, list) {
      const g = el(id);
      if (!list.length) {
        g.innerHTML = `<div class="col-span-3 h-12 rounded-lg bg-white/5 flex items-center justify-center text-xs text-gray-600">Belum ada foto</div>`;
        return;
      }
      g.innerHTML = list.map(f =>
        `<div class="rounded-lg overflow-hidden cursor-pointer" onclick="window.open('${f.url}','_blank')">
      <img src="${f.url}" alt="${f.posisi}" class="w-full h-12 object-cover" title="${f.posisi}">
    </div>`
      ).join('');
    }


    // ============================================================
    // RENDER ACTION BUTTONS
    // ============================================================
    function renderActions(t) {
      const bar = el('action-bar');
      const id = t.id_transaksi || t.id;
      const nb = t.nomor_booking;
      const cls = 'w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2';
      bar.innerHTML = '';

      let btnSupir = '';
      if (t.gunakan_supir === 1) {
        if (!t.id_supir && ['MENUNGGU', 'DIKONFIRMASI'].includes(t.status)) {
          btnSupir = `
          <button class="${cls} mb-2" style="background:#3B82F6; color:white;" onclick="openSupirModal('${id}')">
            <i class="ph-bold ph-user-circle text-lg"></i> Tugaskan Supir
          </button>`;
        } else if (t.id_supir) {
          btnSupir = `
          <div class="w-full mb-2 p-2 rounded-xl border border-blue-200 bg-blue-50/50 flex flex-col items-center justify-center text-xs text-blue-700">
            <span class="font-semibold mb-0.5"><i class="ph-bold ph-steering-wheel align-middle"></i> Supir Ditugaskan:</span>
            <span>${t.nama_supir || 'ID: ' + t.id_supir}</span>
          </div>`;
        }
      }

      if (t.status === 'MENUNGGU') {
        bar.innerHTML = btnSupir + `
      <button class="${cls} btn-p"
        onclick="doKonfirm('Konfirmasi Booking?','Booking ${nb} akan dikonfirmasi.',()=>updateStatus('${id}','DIKONFIRMASI'))">
        ✓ Konfirmasi Booking
      </button>`;
      } else if (t.status === 'DIKONFIRMASI') {
        bar.innerHTML = btnSupir + `
      <button class="${cls} btn-g" onclick="openFotoModal('sebelum')">
        <i class="ph ph-car"></i> Serahkan Kendaraan (Upload Foto Kondisi)
      </button>`;
      } else if (t.status === 'AKTIF') {
        bar.innerHTML = btnSupir + `
      <button class="${cls} btn-a" onclick="openFotoModal('sesudah')">
        <i class="ph ph-package"></i> Proses Pengembalian (Upload Foto Kondisi)
      </button>
      <button class="${cls} mt-1" style="background:#10B981; color:white;" onclick="sendWaReminder('${id}')">
        <i class="ph ph-whatsapp-logo"></i> Kirim Reminder WA
      </button>
      <button class="${cls} mt-1" style="background:#2563EB; color:white;" onclick="trackGps('${t.id_kendaraan}')">
        <i class="ph ph-map-pin"></i> Track GPS Kendaraan
      </button>`;
      } else if (['SELESAI', 'DIBATALKAN'].includes(t.status)) {
        bar.innerHTML = btnSupir + `<div class="text-center text-xs text-gray-500 py-2">Tidak ada aksi tersedia</div>`;
        return;
      }

      if (!['SELESAI', 'DIBATALKAN'].includes(t.status)) {
        const btn = document.createElement('button');
        btn.className = `${cls} btn-r mt-1`;
        btn.textContent = '✕ Batalkan Transaksi';
        btn.onclick = () => doKonfirm('Batalkan Transaksi?', `Booking ${nb} akan dibatalkan secara permanen.`, () => updateStatus(id, 'DIBATALKAN'));
        bar.appendChild(btn);
      }
    }


    // ============================================================
    // UPDATE STATUS TRANSAKSI
    // ============================================================
    async function updateStatus(id, statusBaru, extra = {}) {
      const payload = { status: statusBaru, ...extra };
      if (S.online) {
        const r = await api(`/transaksi/${id}/status`, { method: 'PUT', body: JSON.stringify(payload) });
        if (r?.ok) {
          const res = await r.json();
          toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Status Diperbarui', `${res.nomor_booking}: ${statusBaru}`);
          await loadList();
          if (S.selected) await selectTrx(S.selected.id_transaksi || id);
        } else {
          const err = r ? await r.json().catch(() => ({})) : {};
          toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', err.detail || 'Tidak dapat memperbarui status.');
        }
      } else {
        await idbAdd('offline_queue', {
          endpoint: `/transaksi/${id}/status`, method: 'PUT', body: payload,
          nb: S.selected?.nomor_booking || id, created_at: new Date().toISOString()
        });
        toast('<i class="ph ph-broadcast"></i>', 'Disimpan Offline', 'Aksi akan disinkronisasi saat online.');
        refreshQueueBadge();
      }
      closeKonfirm();
    }

    async function sendWaReminder(id) {
      if (!confirm('Kirim pengingat WhatsApp ke kustomer?')) return;
      if (S.online) {
        toast('<div class="spin" style="width:14px;height:14px;"></div>', 'Memproses', 'Mengirim pesan WA...');
        const r = await api(`/transaksi/${id}/remind-wa`, { method: 'POST' });
        if (r?.ok) {
          toast('<i class="ph-fill ph-whatsapp-logo" style="color: #10B981;"></i>', 'Terkirim', 'Reminder WA berhasil dikirim.');
        } else {
          toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal', 'Gagal mengirim WA. Pastikan token Fonnte sudah di-set.');
        }
      } else {
        toast('<i class="ph-fill ph-wifi-slash"></i>', 'Offline', 'Fitur ini membutuhkan koneksi internet.');
      }
    }


    // ============================================================
    // MODAL: FOTO KONDISI KENDARAAN
    // ============================================================
    function openFotoModal(jenis) {
      S.fotoJenis = jenis; S.files = { d: null, sk: null, ski: null, b: null, dlm: null, tambahan: [] };
      ['d', 'sk', 'ski', 'b', 'dlm'].forEach(k => {
        const zone = el(`zone-${k}`);
        if(zone) {
          zone.classList.remove('done');
          el(`zone-${k}-e`).classList.remove('hidden');
          el(`zone-${k}-p`).classList.add('hidden');
          el(`inp-${k}`).value = '';
        }
      });
      el('tambahan-preview').innerHTML = '';
      el('tambahan-preview').classList.add('hidden');
      el('inp-tambahan').value = '';
      
      el('mfoto-title').textContent = jenis === 'sebelum' ? 'Upload Kondisi: Sebelum Diserahkan' : 'Upload Kondisi: Saat Dikembalikan';
      el('sect-catatan').classList.toggle('hidden', jenis === 'sebelum');
      el('btn-submit-foto').disabled = true;
      el('modal-foto').classList.remove('hidden');
    }
    function closeFotoModal() { el('modal-foto').classList.add('hidden'); }
    function pickFile(id) { el(id).click(); }
    
    function compressImageFile(file, maxSizeMB = 0.8) {
      return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) return resolve(file);
        if (file.size <= maxSizeMB * 1024 * 1024) return resolve(file);
    
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image();
          img.src = e.target.result;
          img.onload = () => {
            let w = img.width, h = img.height;
            const max = 1600;
            if (w > h && w > max) { h = Math.round((h * max) / w); w = max; }
            else if (h > w && h > max) { w = Math.round((w * max) / h); h = max; }
    
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
    
            canvas.toBlob(b => {
              if (!b) return resolve(file);
              resolve(new File([b], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            }, 'image/jpeg', 0.7);
          };
          img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
      });
    }
    
    async function onFile(k, inp) {
      if (!inp.files.length) return;
      const file = inp.files[0];
      const compressed = await compressImageFile(file, 0.8);
      S.files[k] = compressed;
      
      const reader = new FileReader();
      reader.onload = e => {
        el(`img-${k}`).src = e.target.result;
        el(`zone-${k}-e`).classList.add('hidden');
        el(`zone-${k}-p`).classList.remove('hidden');
        el(`zone-${k}`).classList.add('done');
        el('btn-submit-foto').disabled = !(S.files.d && S.files.sk && S.files.ski && S.files.b && S.files.dlm);
      };
      reader.readAsDataURL(compressed);
    }

    async function onFileTambahan(inp) {
      if (!inp.files.length) return;
      for (let f of inp.files) {
        const compressed = await compressImageFile(f, 0.8);
        S.files.tambahan.push(compressed);
        const reader = new FileReader();
        reader.onload = e => {
          const div = document.createElement('div');
          div.className = 'relative rounded-lg overflow-hidden h-14';
          div.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">
                           <button onclick="removeTambahan(this)" class="absolute top-0 right-0 bg-red-500/80 text-white p-0.5 text-[10px]">✕</button>`;
          el('tambahan-preview').appendChild(div);
          el('tambahan-preview').classList.remove('hidden');
        };
        reader.readAsDataURL(compressed);
      }
    }
    window.removeTambahan = function(btn) {
      const div = btn.parentElement;
      const idx = Array.from(div.parentElement.children).indexOf(div);
      if(idx > -1) S.files.tambahan.splice(idx, 1);
      div.remove();
      if(S.files.tambahan.length === 0) el('tambahan-preview').classList.add('hidden');
    }

    async function submitFoto() {
      const jenis = S.fotoJenis, t = S.selected;
      if (!jenis || !t) return;
      const btn = el('btn-submit-foto');
      btn.disabled = true;
      el('up-status').classList.remove('hidden');
      const id = t.id_transaksi || t.id;

      if (!S.online) { toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Offline', 'Upload foto memerlukan koneksi internet.'); btn.disabled = false; el('up-status').classList.add('hidden'); return; }

      const fd = new FormData();
      fd.append('jenis', jenis);
      fd.append('file_depan', S.files.d);
      fd.append('file_samping_kanan', S.files.sk);
      fd.append('file_samping_kiri', S.files.ski);
      fd.append('file_belakang', S.files.b);
      fd.append('file_dalam', S.files.dlm);
      
      S.files.tambahan.forEach(f => {
        fd.append('file_tambahan', f);
      });

      if (jenis === 'sesudah') {
        const cat = el('inp-catatan').value;
        const dk = parseFloat(el('inp-denda-k').value || '0');
        if (cat) fd.append('catatan_kerusakan', cat);
        if (dk) fd.append('biaya_denda_kerusakan', dk.toString());
      }

      try {
        const r = await fetch(`${API}/transaksi/${id}/foto-kondisi`, {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + S.token }, body: fd
        });
        if (r.ok) {
          closeFotoModal();
          toast('<i class="ph ph-camera"></i>', 'Foto Terupload', 'Dokumentasi kondisi kendaraan tersimpan.');
          if (jenis === 'sebelum') {
            await updateStatus(id, 'AKTIF', { catatan_kasir: 'Kendaraan diserahkan ke pelanggan.' });
          } else {
            openSelesaiModal();
          }
        } else {
          const e = await r.json().catch(() => ({}));
          toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Upload Gagal', e.detail || 'Terjadi kesalahan saat upload.');
          btn.disabled = false;
        }
      } catch (_) { toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Upload Gagal', 'Periksa koneksi internet Anda.'); btn.disabled = false; }
      el('up-status').classList.add('hidden');
    }


    // ============================================================
    // MODAL: SELESAIKAN TRANSAKSI (dengan denda)
    // ============================================================
    function openSelesaiModal() {
      const t = S.selected, k = t?.kendaraan || {};
      const rencana = new Date(t?.tanggal_selesai_rencana || 0);
      const today = new Date(); today.setHours(0, 0, 0, 0); rencana.setHours(0, 0, 0, 0);
      const hari = Math.max(0, Math.floor((today - rencana) / 864e5));
      const hrgHarian = k.harga_harian || k.harga_sewa_harian || 0;
      const dendaT = hari * hrgHarian * 1.5;
      S.dendaTLbt = dendaT;

      el('ms-denda-t').textContent = rp(dendaT);
      el('ms-denda-detail').textContent = `${hari} hari × ${rp(hrgHarian)} × 150%`;
      el('ms-denda-k').value = '0';
      el('ms-tambahan').value = '0';
      el('ms-catatan').value = '';
      recalcTotal();
      el('modal-selesai').classList.remove('hidden');
    }
    function closeSelesai() { el('modal-selesai').classList.add('hidden'); }
    function recalcTotal() {
      const t = S.selected;
      const dk = parseFloat(el('ms-denda-k').value || 0);
      const tb = parseFloat(el('ms-tambahan').value || 0);
      const tot = (t?.biaya_sewa || 0) + (t?.biaya_supir || 0) + S.dendaTLbt + dk + tb;
      el('ms-total').textContent = rp(tot);
    }
    async function submitSelesai() {
      const t = S.selected, id = t.id_transaksi || t.id;
      const dk = parseFloat(el('ms-denda-k').value || 0);
      const tb = parseFloat(el('ms-tambahan').value || 0);
      const cat = el('ms-catatan').value;
      closeSelesai();
      await updateStatus(id, 'SELESAI', { biaya_denda_kerusakan: dk, biaya_tambahan_lain: tb, catatan_kasir: cat || null });
    }

    // ============================================================
    // MODAL: PILIH SUPIR
    // ============================================================
    let activeSupirTxId = null;

    async function openSupirModal(id) {
      activeSupirTxId = id;
      const m = el('modal-pilih-supir');
      const sel = el('msupir-select');
      sel.innerHTML = '<option value="">-- Memuat Data --</option>';
      m.classList.remove('hidden');

      const resAPI = await api('/karyawan/supir-aktif');
      const data = resAPI && resAPI.ok ? await resAPI.json() : null;
      if (!data || data.length === 0) {
        sel.innerHTML = '<option value="">-- Tidak ada supir tersedia --</option>';
        return;
      }
      sel.innerHTML = '<option value="">-- Pilih Supir --</option>' + data.map(k => `<option value="${k.id}">${k.nama} (${k.no_telepon || '-'})</option>`).join('');
    }

    function closeSupirModal() {
      el('modal-pilih-supir').classList.add('hidden');
      activeSupirTxId = null;
      el('msupir-select').innerHTML = '<option value="">-- Memuat Data --</option>';
    }

    async function doSupirModal() {
      if (!activeSupirTxId) return;
      const idSupir = el('msupir-select').value;
      if (!idSupir) {
        toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Validasi', 'Silakan pilih supir terlebih dahulu.');
        return;
      }

      el('modal-pilih-supir').classList.add('hidden');
      const res = await api(`/transaksi/${activeSupirTxId}/supir`, {
        method: 'PUT',
        body: JSON.stringify({ id_supir: idSupir })
      });
      if (res && res.ok) {
        toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Berhasil', 'Supir berhasil ditugaskan.');
        await loadList();
        if (activeSupirTxId) {
          await selectTrx(activeSupirTxId);
        }
        closeSupirModal();
      }
    }


    // ============================================================
    // MODAL: KONFIRMASI UMUM
    // ============================================================
    function doKonfirm(title, body, cb) {
      el('mk-title').textContent = title;
      el('mk-body').textContent = body;
      el('btn-ok').onclick = cb;
      el('modal-konfirm').classList.remove('hidden');
    }
    function closeKonfirm() { el('modal-konfirm').classList.add('hidden'); }


    // ============================================================
    // ══════════════════════════════════════════════════════════
    // MODAL: BUAT TRANSAKSI BARU — MULTI-STEP WIZARD
    // ══════════════════════════════════════════════════════════
    // ============================================================
    const BT = {
      step: 1,
      pelanggan: null,   // {id, nama, telepon}
      kendaraan: null,   // {id, nama, harga_harian, harga_supir, foto, ...}
      daftarKend: [],    // hasil GET /kendaraan?status=TERSEDIA
      filterTipe: 'semua',
      _plgTimer: null,
      _allPlg: [],       // cache daftar pelanggan
    };

    // ── Buka Modal ──────────────────────────────────────────────
    async function bukaModalTransaksi() {
      // 1. Reset state
      BT.step = 1; BT.pelanggan = null; BT.kendaraan = null; BT.filterTipe = 'semua';

      // 2. Reset form
      ['bt-plg-q', 'bt-np-nama', 'bt-np-telp', 'bt-np-alamat', 'bt-catatan'].forEach(id => {
        const e = el(id); if (e) e.value = '';
      });
      el('bt-durasi').value = '1';
      el('bt-tgl-mulai').value = new Date().toISOString().split('T')[0];
      el('bt-supir-chk').checked = false;
      el('bt-metode').value = 'TUNAI';
      el('bt-new-plg-form').classList.add('hidden');

      // 3. Reset UI pelanggan
      el('bt-plg-selected').classList.add('hidden');
      el('bt-plg-results').innerHTML = '<div class="text-xs text-gray-600 text-center py-4">Ketik minimal 2 karakter untuk mencari.</div>';

      el('bt-modal').classList.remove('hidden');
  el('bt-modal').classList.add('flex');
      btGotoStep(1);

      // 4. Ambil data dari server
      const [rKend, rPlg, rSupir] = await Promise.all([
        api('/kendaraan?status=TERSEDIA'),
        api('/pelanggan'),
        api('/karyawan/supir-aktif')
      ]);

      if (rKend?.ok) BT.daftarKend = await rKend.json();
      if (rPlg?.ok) BT._allPlg = await rPlg.json();
      if (rSupir?.ok) {
         BT.daftarSupir = await rSupir.json();
         const sel = el('bt-supir-select');
         if(sel) {
            if(BT.daftarSupir.length === 0) {
               sel.innerHTML = '<option value="">-- Tidak Ada Supir Tersedia --</option>';
            } else {
               sel.innerHTML = '<option value="">-- Pilih Supir --</option>' + BT.daftarSupir.map(s => `<option value="${s.id}">${s.nama}</option>`).join('');
            }
         }
      }
    }

    function tutupBuatTrx() { el('bt-modal').classList.add('hidden'); el('bt-modal').classList.remove('flex'); }

    // ── Navigasi Step ───────────────────────────────────────────
    function btGotoStep(n) {
      BT.step = n;
      [1, 2, 3].forEach(i => el(`bt-s${i}`).classList.toggle('hidden', i !== n));

      // Update step dots
      [1, 2, 3].forEach(i => {
        const d = el(`bt-sd${i}`);
        if (!d) return;
        if (i < n) {
          d.className = 'bt-dot done'; d.innerHTML = '✓';
        } else if (i === n) {
          d.className = 'bt-dot active'; d.innerHTML = i;
        } else {
          d.className = 'bt-dot upcoming'; d.innerHTML = i;
        }
        // Line colors
        const l = el(`bt-sl${i}`);
        if (l) l.className = `bt-line ${i < n ? 'done' : 'upcoming'}`;
      });

      const labels = ['', 'Pilih Pelanggan', 'Pilih Kendaraan', 'Jadwal & Konfirmasi'];
      el('bt-step-lbl').textContent = labels[n];
      el('bt-subtitle').textContent = `Langkah ${n} dari 3 — ${labels[n]}`;

      // Tombol kembali
      el('bt-btn-back').style.display = n > 1 ? '' : 'none';

      // Tombol lanjut / submit
      const btnNext = el('bt-btn-next');
      if (n === 3) {
        btnNext.className = 'flex-1 btn-p py-2.5 rounded-xl text-sm font-bold';
        btnNext.textContent = '✓ Buat Transaksi';
      } else {
        btnNext.className = 'flex-1 btn-a py-2.5 rounded-xl text-sm font-bold';
        btnNext.textContent = 'Selanjutnya →';
      }
      btnNext.disabled = false;

      if (n === 2) btRenderKendaraan();
      if (n === 3) btRenderSummary();
    }

    function btNext() {
      if (BT.step === 1) {
        if (!BT.pelanggan) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Pilih Pelanggan', 'Cari dan pilih atau daftarkan pelanggan terlebih dahulu.'); return; }
        btGotoStep(2);
      } else if (BT.step === 2) {
        if (!BT.kendaraan) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Pilih Kendaraan', 'Pilih salah satu kendaraan yang tersedia.'); return; }
        btGotoStep(3); btHitung();
      } else {
        btSubmit();
      }
    }
    function btPrev() { if (BT.step > 1) btGotoStep(BT.step - 1); }


    // ── STEP 1: PELANGGAN ───────────────────────────────────────
    function btCariPlg(q) {
      clearTimeout(BT._plgTimer);
      const res = el('bt-plg-results');

      if (q.length < 2) {
        res.innerHTML = '<div class="text-xs text-gray-600 text-center py-4">Ketik minimal 2 karakter untuk mencari.</div>';
        return;
      }

      res.innerHTML = '<div class="text-xs text-gray-600 text-center py-3"><div class="spin mx-auto mb-1" style="width:14px;height:14px;border-width:2px;"></div>Mencari...</div>';

      BT._plgTimer = setTimeout(() => {
        const ql = q.toLowerCase();

        // PERBAIKAN DI SINI: Sistem sekarang membaca 'p.nama_lengkap' dari pangkalan data!
        const found = BT._allPlg.filter(p =>
          (p.nama || p.nama_lengkap || '').toLowerCase().includes(ql) ||
          (p.telepon || p.no_telepon || '').includes(q)
        ).slice(0, 6);

        if (!found.length) {
          res.innerHTML = `<div class="text-xs text-gray-600 text-center py-3">Tidak ditemukan. Silakan daftarkan di bawah.</div>`;
          return;
        }

        res.innerHTML = found.map(p => {
          const nama = p.nama || p.nama_lengkap || '?';
          const telp = p.telepon || p.no_telepon || '—';
          const data = JSON.stringify({
            id: p.id || p.id_pelanggan,
            nama: nama, telepon: telp,
            email: p.email || ''
          });

          return `
        <button onclick='btPilihPlg(${data.replace(/'/g, "&#39;")})'
                class="w-full text-left p-3 rounded-xl transition-colors flex items-center gap-3"
                style="border:1px solid rgba(255,255,255,.06);"
                onmouseover="this.style.background='rgba(255,255,255,.05)'"
                onmouseout="this.style.background=''">
          <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
               style="background:rgba(124,58,237,.2);color:#C084FC;">${nama[0].toUpperCase()}</div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm text-white truncate">${nama}</div>
            <div class="text-xs text-gray-500">${telp}</div>
          </div>
          ${p.is_verified ? '<span class="text-xs text-green-400 shrink-0">✓ KTP</span>' : ''}
        </button>`;
        }).join('');
      }, 350);
    }

    function btPilihPlg(dataStr) {
      // dataStr bisa berupa string JSON dari onclick inline
      let p;
      try { p = typeof dataStr === 'object' ? dataStr : JSON.parse(dataStr.replace(/&quot;/g, '"')); }
      catch (e) { toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Error', 'Gagal memproses data pelanggan.'); return; }
      BT.pelanggan = p;
      btUpdatePlgUI();
    }

    function btUpdatePlgUI() {
      const p = BT.pelanggan;
      if (!p) { el('bt-plg-selected').classList.add('hidden'); return; }
      el('bt-plg-av').textContent = (p.nama || '?')[0].toUpperCase();
      el('bt-plg-nama-sel').textContent = p.nama || '—';
      el('bt-plg-telp-sel').textContent = p.telepon || '—';
      el('bt-plg-selected').classList.remove('hidden');
      el('bt-plg-results').innerHTML = '';
      el('bt-plg-q').value = '';
    }

    function btClearPlg() {
      BT.pelanggan = null;
      el('bt-plg-selected').classList.add('hidden');
      el('bt-plg-results').innerHTML = '<div class="text-xs text-gray-600 text-center py-4">Ketik minimal 2 karakter untuk mencari.</div>';
    }

    function btToggleNewPlg() { el('bt-new-plg-form').classList.toggle('hidden'); }

    async function btScanKtp(inp) {
      if (!inp.files.length) return;
      const file = inp.files[0];
      const statusEl = el('bt-np-ktp-status');
      
      statusEl.classList.remove('hidden', 'text-green-400', 'text-red-400');
      statusEl.classList.add('text-gray-500');
      statusEl.innerHTML = '<div class="spin inline-block mx-auto" style="width:12px;height:12px;border-width:2px;vertical-align:-2px;margin-right:6px;"></div>Memproses OCR KTP...';
      
      const fd = new FormData();
      fd.append('file', file);
      
      try {
        const r = await fetch(`${API}/ocr/ktp`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + S.token },
          body: fd
        });
        
        if (r.ok) {
          const res = await r.json();
          if (res.nama) {
            el('bt-np-nama').value = res.nama;
            toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'OCR Berhasil', `Nama ditemukan: ${res.nama}`);
          } else {
            toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'OCR Selesai', 'Tidak menemukan nama yang jelas.');
          }
          statusEl.innerHTML = '<i class="ph-fill ph-check-circle" style="color: #10B981;"></i> KTP diproses.';
          statusEl.classList.add('text-green-400');
        } else {
          statusEl.innerHTML = '<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i> Gagal membaca KTP.';
          statusEl.classList.add('text-red-400');
        }
      } catch (e) {
        statusEl.innerHTML = '<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i> Terjadi kesalahan jaringan.';
        statusEl.classList.add('text-red-400');
      }
    }

    async function btSimpanPlgBaru() {
      const nama = el('bt-np-nama').value.trim();
      const telp = el('bt-np-telp').value.trim();
      const alamat = el('bt-np-alamat').value.trim();

      if (!nama || !telp) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Data Tidak Lengkap', 'Nama lengkap dan nomor telepon wajib diisi.'); return; }

      const btn = el('bt-np-btn');
      btn.disabled = true;
      btn.innerHTML = '<div class="spin mx-auto" style="width:16px;height:16px;border-width:2px;border-top-color:white;"></div>';

      try {
        const fd = new FormData();
        fd.append('nama_lengkap', nama);
        fd.append('no_telepon', telp);
        if (alamat) fd.append('alamat', alamat);

        const r = await fetch(`${API}/pelanggan`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + S.token },
          body: fd
        });

        if (r.ok) {
          const res = await r.json();
          BT.pelanggan = { id: res.id_pelanggan, nama, telepon: telp, email: '' };
          // Tambahkan ke cache lokal
          BT._allPlg.unshift({ id_pelanggan: res.id_pelanggan, nama_lengkap: nama, no_telepon: telp });
          btUpdatePlgUI();
          el('bt-new-plg-form').classList.add('hidden');
          toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Pelanggan Ditambahkan', `${nama} berhasil didaftarkan.`);
        } else {
          const e = await r.json().catch(() => ({}));
          toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal Menyimpan', e.detail || 'Terjadi kesalahan saat mendaftarkan pelanggan.');
        }
      } catch (e) { toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Error Jaringan', e.message); }

      btn.disabled = false;
      btn.innerHTML = 'Simpan &amp; Pilih Pelanggan Ini';
    }


    // ── STEP 2: KENDARAAN ───────────────────────────────────────
    function btSetTipe(tipe) {
      BT.filterTipe = tipe;
      document.querySelectorAll('.bt-tab').forEach(b => {
        const active = b.dataset.tipe === tipe;
        b.classList.toggle('active', active);
      });
      btRenderKendaraan();
    }

    function btRenderKendaraan() {
      const grid = el('bt-kend-grid');

      if (!BT.daftarKend.length) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-600 text-sm">
      <div class="spin mx-auto mb-3" style="border-top-color:#F59E0B;width:22px;height:22px;border-width:2.5px;"></div>
      Memuat armada tersedia...</div>`;
        return;
      }

      const filtered = BT.filterTipe === 'semua'
        ? BT.daftarKend
        : BT.daftarKend.filter(k => (k.tipe || k.tipe_kendaraan) === BT.filterTipe);

      if (!filtered.length) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-600 text-sm">
      Tidak ada kendaraan tersedia untuk kategori <strong>${BT.filterTipe.replace('_', ' ')}</strong>.</div>`;
        return;
      }

      grid.innerHTML = filtered.map(k => {
        const id = k.id || k.id_kendaraan;
        const nama = k.nama || k.nama_kendaraan;
        const harga = k.harga_harian || k.harga_sewa_harian || 0;
        const supir = k.harga_supir || k.harga_supir_harian || 150000;
        const tipe = (k.tipe || k.tipe_kendaraan || '').replace('_', ' ');
        const plat = k.plat || k.nomor_plat || '';
        const foto = k.foto_url || k.foto || '';
        const transmisi = k.transmisi || 'AT';
        const bbm = k.bbm || k.bahan_bakar || 'Bensin';
        const sel = BT.kendaraan?.id === id;

        // Buat payload untuk onclick (safe JSON encoding)
        const payload = JSON.stringify({ id, nama, harga_harian: harga, harga_supir: supir, foto, tipe, plat, transmisi, bbm });

        return `
      <div class="bt-kend-card ${sel ? 'selected' : ''}" onclick='btPilihKend(${payload.replace(/'/g, "&#39;")})'>
        <div style="padding:16px; position:relative;">
          <div class="font-semibold text-white text-base pr-8 leading-tight">${nama}</div>
          <div class="text-xs text-gray-500 mt-1">${tipe} • ${transmisi} • ${bbm}</div>
          ${plat ? `<div class="text-xs text-gray-600 mt-0.5">${plat}</div>` : ''}
          <div class="mt-3 font-bold text-sm" style="color:#F59E0B;">
            ${rp(harga)}<span class="text-xs font-normal text-gray-500">/hari</span>
          </div>
          ${sel
            ? `<div style="position:absolute;top:16px;right:16px;width:24px;height:24px;border-radius:50%;
                background:#7C3AED;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;color:white;">✓</div>`
            : ''}
        </div>
      </div>`;
      }).join('');
    }

    function btPilihKend(payload) {
      // payload bisa berupa object (dari onclick) atau string JSON
      BT.kendaraan = typeof payload === 'object' ? payload : JSON.parse(payload);
      btRenderKendaraan();
      toast('<i class="ph-fill ph-check-circle" style="color: #10B981;"></i>', 'Kendaraan Dipilih', BT.kendaraan.nama);
    }


    // ── STEP 3: JADWAL & HITUNG BIAYA ───────────────────────────
    function btRenderSummary() {
      const k = BT.kendaraan, p = BT.pelanggan;
      if (!k || !p) return;

      const fotoEl = el('bt-s3-foto');
      if (k.foto) { fotoEl.src = k.foto; fotoEl.style.display = ''; el('bt-s3-emoji').classList.add('hidden'); }
      else { fotoEl.style.display = 'none'; el('bt-s3-emoji').classList.remove('hidden'); }

      el('bt-s3-kend').textContent = k.nama;
      el('bt-s3-plg').textContent = `Pelanggan: ${p.nama}`;
      el('bt-s3-harga').textContent = `${rp(k.harga_harian || 0)} / hari`;
      el('bt-supir-info').textContent = `+ ${rp(k.harga_supir || 150000)} / hari`;

      btHitung();
    }

    function btHitung() {
      const tglStr = el('bt-tgl-mulai').value;
      let durasi = Math.max(1, parseInt(el('bt-durasi').value) || 1);
      const supir = el('bt-supir-chk').checked;
      
      if (supir && durasi > 7) {
        durasi = 7;
        el('bt-durasi').value = 7;
        toast('<i class="ph ph-info"></i>', 'Info Sewa Supir', 'Sewa harian dengan supir dibatasi maksimal 7 hari.');
      }
      
      const k = BT.kendaraan;
      if (!k || !tglStr) return;

      // Kalkulasi tanggal selesai
      const dtMulai = new Date(tglStr);
      const dtSelesai = new Date(dtMulai);
      dtSelesai.setDate(dtSelesai.getDate() + durasi);
      el('bt-tgl-selesai').textContent = fmtDT(dtSelesai.toISOString());

      // Kalkulasi biaya
      const harga = k.harga_harian || 0;
      const bSewa = harga * durasi;
      const bSupir = supir ? (k.harga_supir || 150000) * durasi : 0;
      const total = bSewa + bSupir;

      el('bt-lbl-sewa').textContent = `Biaya Sewa (${durasi} hari)`;
      el('bt-val-sewa').textContent = rp(bSewa);

      const rowS = el('bt-row-supir');
      rowS.style.display = supir ? '' : 'none';
      if (supir) el('bt-val-supir').textContent = rp(bSupir);

      el('bt-total').textContent = rp(total);
    }
    
    function btToggleSupirSelect() {
      const isChecked = el('bt-supir-chk').checked;
      const wrap = el('bt-supir-select-wrap');
      if (wrap) {
         wrap.classList.toggle('hidden', !isChecked);
      }
    }


    // ── Submit (Buat Transaksi ke API) ──────────────────────────
    async function btSubmit() {
      const tglMulai = el('bt-tgl-mulai').value;
      const durasi = Math.max(1, parseInt(el('bt-durasi').value) || 1);
      const supir = el('bt-supir-chk').checked ? 1 : 0;
      const supirId = el('bt-supir-select') ? el('bt-supir-select').value : null;
      const metode = el('bt-metode').value;
      const catatan = el('bt-catatan').value.trim();

      if (!tglMulai) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Tanggal Wajib Diisi', 'Pilih tanggal mulai sewa.'); return; }
      if (!BT.pelanggan || !BT.kendaraan) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Data Tidak Lengkap', 'Pelanggan dan kendaraan wajib dipilih.'); return; }
      if (supir && !supirId) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Supir Belum Dipilih', 'Silakan pilih supir yang tersedia.'); return; }
      if (supir && durasi > 7) { toast('<i class="ph-fill ph-warning-circle" style="color: #F59E0B;"></i>', 'Durasi Supir Maksimal', 'Sewa dengan supir dibatasi maksimal 7 hari.'); return; }

      // Hitung tanggal selesai
      const dtMulai = new Date(tglMulai);
      const dtSelesai = new Date(dtMulai);
      dtSelesai.setDate(dtSelesai.getDate() + durasi);
      
      // Format manual YYYY-MM-DDTHH:mm agar sesuai zona waktu lokal (tidak bergeser karena toISOString)
      const pad = n => n.toString().padStart(2, '0');
      const tglSelesai = `${dtSelesai.getFullYear()}-${pad(dtSelesai.getMonth()+1)}-${pad(dtSelesai.getDate())}T${pad(dtSelesai.getHours())}:${pad(dtSelesai.getMinutes())}`;

      const payload = {
        id_pelanggan: BT.pelanggan.id,
        id_kendaraan: BT.kendaraan.id,
        tanggal_mulai: tglMulai,
        tanggal_selesai_rencana: tglSelesai,
        gunakan_supir: supir,
        id_supir: supir ? supirId : null,
        metode_pembayaran: metode,
        catatan_kasir: catatan || null,
      };

      const btn = el('bt-btn-next');
      btn.disabled = true;
      btn.innerHTML = '<div class="spin mx-auto" style="width:16px;height:16px;border-width:2px;border-top-color:white;"></div>';

      try {
        const r = await api('/transaksi', { method: 'POST', body: JSON.stringify(payload) });

        if (r?.ok) {
          const res = await r.json();
          tutupBuatTrx();
          toast('<i class="ph ph-party-popper"></i>', 'Transaksi Berhasil Dibuat!', `${res.nomor_booking} — ${rp(res.total_biaya)}`);
          await loadList();
          // Auto-pilih transaksi yang baru dibuat
          if (res.id_transaksi) setTimeout(() => selectTrx(res.id_transaksi), 600);
        } else {
          const err = r ? await r.json().catch(() => ({})) : {};
          toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Gagal Membuat Transaksi', err.detail || 'Terjadi kesalahan. Coba lagi.');
          btn.disabled = false;
          btn.textContent = '✓ Buat Transaksi';
        }
      } catch (e) {
        toast('<i class="ph-fill ph-x-circle" style="color: #EF4444;"></i>', 'Error Jaringan', e.message);
        btn.disabled = false;
        btn.textContent = '✓ Buat Transaksi';
      }
    }
    // ══════════════════════════════════════════════════════════


    // ============================================================
    // PRINT KWITANSI
    // ============================================================
    function printReceipt() {
      const t = S.selected;
      if (!t) return;
      const p = t.pelanggan || {}, k = t.kendaraan || {};
      const w = window.open('', '_blank', 'width=400,height=650');
      w.document.write(`<!DOCTYPE html><html><head><title>Kwitansi ${t.nomor_booking}</title>
  <style>body{font-family:monospace;padding:20px;font-size:13px;}hr{border:1px dashed #999;}
  .r{text-align:right;}.hd{text-align:center;font-weight:bold;font-size:15px;}</style></head>
  <body><div class="hd">AERORENT — SALATIGA</div>
  <div style="text-align:center;font-size:11px;">Jl. Diponegoro No. 123 · +62 812-3456-7890</div>
  <hr>
  <b>No. Booking:</b> ${t.nomor_booking || '—'}<br>
  <b>Pelanggan:</b> ${p.nama || p.nama_lengkap || '—'}<br>
  <b>Telepon:</b> ${p.telepon || p.no_telepon || '—'}<br>
  <b>Kendaraan:</b> ${k.nama || k.nama_kendaraan || '—'}<br>
  <b>Plat:</b> ${k.plat || k.nomor_plat || '—'}<br>
  <b>Periode:</b> ${fmtDT(t.tanggal_mulai)} s/d ${fmtDT(t.tanggal_selesai_rencana)}<br>
  <b>Durasi:</b> ${t.durasi_hari || t.durasi_hari_rencana || '?'} hari · ${t.gunakan_supir ? 'Dengan Supir' : 'Mandiri'}<hr>
  Biaya Sewa: <span class="r">${rp(t.biaya_sewa)}</span><br>
  ${t.gunakan_supir ? `Biaya Supir: <span class="r">${rp(t.biaya_supir)}</span><br>` : ''}
  ${(t.denda_terlambat || t.biaya_denda_terlambat || 0) > 0 ? `Denda Terlambat: <span class="r">${rp(t.denda_terlambat || t.biaya_denda_terlambat)}</span><br>` : ''}
  <hr><b>TOTAL: <span class="r">${rp(t.total_biaya)}</span></b><br>
  Metode: ${t.metode_bayar || t.metode_pembayaran || '—'}<br>
  Status: <b>${t.status}</b><br><br>
  Terima kasih telah menggunakan layanan AeroRent!<br>
  <div style="text-align:center;font-size:11px;margin-top:10px;">— Dicetak: ${new Date().toLocaleString('id-ID')} —</div>
  </body></html>`);
      w.print();
    }


    // ============================================================
    // LOGOUT
    // ============================================================
    function doLogout() {
      if (confirm('Yakin ingin keluar dari sesi POS?')) {
        localStorage.removeItem(AUTH_KEY);
        window.location.href = 'login.html';
      }
    }


    // ============================================================
    // TOAST
    // ============================================================
    let toastTimer;
    function toast(icon, title, msg) {
      el('toast-ic').innerHTML = icon;
      el('toast-ttl').textContent = title;
      
      let finalMsg = msg;
      if (typeof msg === 'object' && msg !== null) {
        finalMsg = Array.isArray(msg) ? msg.map(m => m.msg || JSON.stringify(m)).join(', ') : JSON.stringify(msg);
      }
      el('toast-msg').textContent = finalMsg;
      
      el('toast').classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 4500);
    }
    function hideToast() { el('toast').classList.add('hidden'); }


    // ============================================================
    // UTILITAS
    // ============================================================
    const el = id => document.getElementById(id);
    const show = (id, v) => { const e = el(id); if (e) e.style.display = v ? '' : 'none'; };
    const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
    const fmtD = d => {
      if (!d) return '—';
      const dt = new Date(d);
      return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const fmtDT = d => {
      if (!d) return '—';
      return new Date(d).toLocaleString('id-ID');
    };

    function badge(st) {
      const cls = {
        MENUNGGU: 'b-menunggu', DIKONFIRMASI: 'b-dikonfirmasi',
        AKTIF: 'b-aktif', SELESAI: 'b-selesai', DIBATALKAN: 'b-dibatalkan'
      };
      const lbl = {
        MENUNGGU: 'Menunggu', DIKONFIRMASI: 'Dikonfirmasi',
        AKTIF: 'Aktif', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan'
      };
      return `<span class="badge ${cls[st] || ''}">${lbl[st] || st}</span>`;
    }

    // Inisialisasi style filter tab pada load
    document.querySelectorAll('.ftab').forEach(b => {
      b.style.transition = 'all .15s';
      if (b.dataset.f === 'semua') { b.style.background = '#7C3AED'; b.style.color = 'white'; }
      else { b.style.background = 'rgba(255,255,255,.04)'; }
    });