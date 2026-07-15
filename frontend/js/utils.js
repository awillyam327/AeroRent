

function qs(id) { return document.getElementById(id); }

function rp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function fmtD(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDT(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('id-ID');
}

function diffDays(dariStr, sampaiStr) {
  const a = new Date(dariStr);
  const b = new Date(sampaiStr);
  return Math.max(Math.ceil((b - a) / 86400000), 1);
}

let _toastTimer;
function showToast(icon, title, msg, durationMs = 4000) {
  const box = qs('toast');
  if (!box) { console.warn('[toast] markup #toast tidak ditemukan di halaman ini'); return; }
  qs('toast-ic').innerHTML = icon;
  qs('toast-ttl').textContent = title;
  qs('toast-msg').textContent = msg;
  box.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(hideToast, durationMs);
}
function hideToast() {
  const box = qs('toast');
  if (box) box.classList.add('hidden');
}

function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

document.addEventListener('DOMContentLoaded', () => {
  const d = new Date();
  const todayDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayDateTime = `${todayDate}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const restrictedIds = [
    'hero-tanggal',      // index.html
    'armada-tanggal',    // armada.html
    'jadwal-tanggal',    // sewa.html
    'bt-tgl-mulai',      // pos-kasir.html (Buat Transaksi)
    'po-tanggal',        // owner-dashboard.html (Purchase Order)
    'mk-tgl'             // owner-dashboard.html (Maintanance)
  ];

  restrictedIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === 'datetime-local') el.min = todayDateTime;
      else el.min = todayDate;
    }
  });
});

const DEMO_BOOKINGS_KEY = 'aerorent_demo_bookings';

function getDemoBookings() {
  try { return JSON.parse(localStorage.getItem(DEMO_BOOKINGS_KEY) || '[]'); }
  catch (_) { return []; }
}
function addDemoBooking(booking) {
  const list = getDemoBookings();
  list.unshift(booking);
  localStorage.setItem(DEMO_BOOKINGS_KEY, JSON.stringify(list));
}

const DEMO_PROFILE_KEY = 'aerorent_demo_profile';

function getDemoProfile() {
  try { return JSON.parse(localStorage.getItem(DEMO_PROFILE_KEY) || 'null'); }
  catch (_) { return null; }
}

function compressImageFile(file, maxSizeMB = 0.95) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return resolve(file);
    }

    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size <= maxSizeBytes) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 1600; // Maksimal dimensi gambar

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > width && height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          0.7 // Kualitas JPEG (70%)
        );
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
}
