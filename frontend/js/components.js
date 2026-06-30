/**
 * ==============================================================================
 * AeroRent — Komponen Bersama (Navbar, Footer, Toast)
 * Pendekatan: render via string JS, bukan fetch() partial .html, supaya halaman
 * tetap berfungsi normal walau dibuka langsung dari file system (file://)
 * tanpa server lokal — masalah umum yang sering dialami saat development.
 * ==============================================================================
 */
const BRAND_LOGO_SVG = `
<img src="assets/logos/AERO-LOGO.png"
alt=""
style="width: 125px; height: 85px; object-fit:contain;">
`;

/**
 * Render navbar ke dalam elemen container.
 * @param {string} containerId - id elemen tujuan (biasanya <header id="navbar">)
 * @param {object} opts
 *   - active: 'beranda' | 'armada' | null
 *   - rootPath: prefix relatif ke root frontend/, cth. '' di root, '../../' di pages/customer/
 *   - showAuthArea: tampilkan tombol Masuk/Daftar atau info user (default true)
 */
function renderNavbar(containerId, opts = {}) {
  const { active = null, rootPath = '', showAuthArea = true } = opts;
  const el = qs(containerId);
  if (!el) return;

  const user = getCurrentUser();
  const isActive = (key) => (active === key ? 'nav-link active' : 'nav-link');

  let authAreaHtml = '';
  if (showAuthArea) {
    if (user) {
      const initial = (user.nama || '?')[0].toUpperCase();
      authAreaHtml = `
        <div class="flex items-center gap-3">
          <div class="navbar-avatar">${initial}</div>
          <span class="text-dim" style="font-size:14px;">Halo, ${(user.nama || '').split(' ')[0]}</span>
          <button class="navbar-logout" title="Keluar" onclick="logout('${rootPath}login.html')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>`;
    } else {
      authAreaHtml = `<a href="${rootPath}login.html" class="btn btn-primary" style="padding:10px 20px;">Masuk / Daftar</a>`;
    }
  }

  el.innerHTML = `
    <div class="navbar-inner container">
      <a href="${rootPath}index.html" class="navbar-brand">
        ${BRAND_LOGO_SVG}
      </a>
      <nav class="navbar-links">
        <a href="${rootPath}index.html" class="${isActive('beranda')}">Beranda</a>
        <a href="${rootPath}armada.html" class="${isActive('armada')}">Armada</a>
      </nav>
      <div class="navbar-auth">${authAreaHtml}</div>
      <button class="navbar-burger" id="navbar-burger-btn" aria-label="Buka menu">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>`;

  // Efek scroll: transparan -> solid
  const onScroll = () => el.classList.toggle('navbar-scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll);

  // Toggle menu mobile (sederhana: tampilkan/sembunyikan .navbar-links)
  const burger = qs('navbar-burger-btn');
  if (burger) {
    burger.addEventListener('click', () => el.classList.toggle('navbar-mobile-open'));
  }

  // Inject bottom nav jika role adalah CUSTOMER
  injectMobileBottomNav(active, rootPath);
}

/**
 * Sidebar untuk portal Customer (Dashboard, Sewa Baru, Riwayat, Profil).
 * @param {string} containerId
 * @param {object} opts - { active: 'dashboard'|'riwayat'|'profil', rootPath }
 */
function renderCustomerSidebar(containerId, opts = {}) {
  const { active = 'dashboard', rootPath = '../../' } = opts;
  const el = qs(containerId);
  if (!el) return;
  const user = getCurrentUser();
  const initial = (user?.nama || '?')[0].toUpperCase();

  const items = [
    { key: 'dashboard', href: `${rootPath}pages/customer/dashboard.html`, icon: '<i class="ph ph-squares-four"></i>', label: 'Dashboard' },
    { key: 'sewa-baru', href: `${rootPath}armada.html`, icon: '<i class="ph ph-car-profile"></i>', label: 'Sewa Baru' },
    { key: 'riwayat', href: `${rootPath}pages/customer/riwayat.html`, icon: '<i class="ph ph-clock-counter-clockwise"></i>', label: 'Riwayat Pemesanan' },
    { key: 'profil', href: `${rootPath}pages/customer/profil.html`, icon: '<i class="ph ph-user"></i>', label: 'Profil Saya' },
  ];

  el.innerHTML = `
    <div class="cs-logo">
      ${BRAND_LOGO_SVG}
      <span class="navbar-brand-text" style="font-size:18px;">AERO<span style="color:#7C3AED;">RENT</span></span>
    </div>
    <div class="cs-userbox">
      <div class="cs-userbox-label">Customer Panel</div>
      <div class="flex items-center gap-3">
        <div class="cs-avatar"><i class="ph-fill ph-user-circle"></i></div>
        <div>
          <div style="font-weight:700;font-size:14px;">${user?.nama || '—'}</div>
          <span class="badge badge-aktif mt-2" style="margin-top:4px;">Terverifikasi</span>
        </div>
      </div>
    </div>
    <nav class="cs-nav">
      ${items.map((it) => `
        <a href="${it.href}" class="cs-nav-item ${active === it.key ? 'active' : ''}">
          <span>${it.icon}</span> ${it.label}
        </a>`).join('')}
    </nav>
    <div class="cs-nav-bottom">
      <button class="cs-nav-item cs-logout" onclick="logout('${rootPath}login.html')">
        <span><i class="ph ph-sign-out"></i></span> Keluar
      </button>
    </div>`;

  injectMobileBottomNav(active, rootPath);
}

// Helper untuk menginjeksi Bottom Nav khusus mobile bagi Customer
function injectMobileBottomNav(active = '', rootPath = '') {
  const user = getCurrentUser();
  if (!user || user.role !== 'CUSTOMER') return;
  
  if (active === 'armada') active = 'sewa-baru';

  const items = [
    { key: 'dashboard', href: `${rootPath}pages/customer/dashboard.html`, icon: '<i class="ph ph-squares-four"></i>', label: 'Dashboard' },
    { key: 'sewa-baru', href: `${rootPath}armada.html`, icon: '<i class="ph ph-car-profile"></i>', label: 'Sewa' },
    { key: 'beranda', href: `${rootPath}index.html`, icon: '<i class="ph-fill ph-house"></i>', label: 'Beranda', isCenter: true },
    { key: 'riwayat', href: `${rootPath}pages/customer/riwayat.html`, icon: '<i class="ph ph-clock-counter-clockwise"></i>', label: 'Riwayat' },
    { key: 'profil', href: `${rootPath}pages/customer/profil.html`, icon: '<i class="ph ph-user"></i>', label: 'Profil' },
  ];

  let existingBn = document.getElementById('cs-bottom-nav-mobile');
  if (existingBn) existingBn.remove();
  
  const bn = document.createElement('nav');
  bn.id = 'cs-bottom-nav-mobile';
  bn.className = 'cs-bottom-nav';
  bn.innerHTML = `
    <div class="cs-bn-inner">
      ${items.map((it) => `
        <a href="${it.href}" class="cs-bn-item ${active === it.key ? 'active' : ''} ${it.isCenter ? 'cs-bn-center' : ''}">
          <span>${it.icon}</span> ${it.isCenter ? '' : it.label}
        </a>`).join('')}
    </div>
  `;
  document.body.appendChild(bn);
}
/** Markup toast — sisipkan sekali per halaman, biasanya tepat sebelum </body> */
function renderToastMarkup(containerId) {
  const el = qs(containerId);
  if (!el) return;
  el.innerHTML = `
    <div id="toast" class="toast hidden">
      <div class="glass-card flex items-start gap-3" style="padding:14px;">
        <span id="toast-ic" style="font-size:24px;"><i class="ph-fill ph-info"></i></span>
        <div style="flex:1;">
          <div id="toast-ttl" style="font-weight:700;font-size:14px;">—</div>
          <div id="toast-msg" class="text-dim" style="font-size:12px;margin-top:2px;">—</div>
        </div>
        <button onclick="hideToast()" class="text-faint hover:text-white transition" style="background:none;border:none;font-size:16px;cursor:pointer;"><i class="ph ph-x"></i></button>
      </div>
    </div>`;
}

/** Footer sederhana untuk halaman publik (Beranda, Armada) */
function renderFooter(containerId, rootPath = '') {
  const el = qs(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="container" style="padding-top:48px;padding-bottom:24px;">
      <div class="footer-grid">
        <div>
          ${BRAND_LOGO_SVG}
          <p class="text-dim mt-3" style="max-width:380px;font-size:14px;">
            Platform rental kendaraan premium di Salatiga. Menyediakan pilihan mobil dan
            minibus terbaik untuk perjalanan Anda dengan harga transparan.
          </p>
        </div>
        <div>
          <h4 class="mb-3" style="font-size:14px;">Layanan</h4>
          <ul class="text-dim" style="list-style:none;font-size:14px;line-height:2;">
            <li>Sewa Harian &amp; Mingguan</li>
            <li>Sewa Bulanan (Korporat)</li>
            <li>Layanan Antar-Jemput</li>
            <li>Sewa dengan Supir</li>
          </ul>
        </div>
        <div>
          <h4 class="mb-3" style="font-size:14px;">Kontak Kami</h4>
          <ul class="text-dim" style="list-style:none;font-size:14px;line-height:2;">
            <li>📍 Jl. Diponegoro No. 123, Salatiga</li>
            <li>📞 +62 812 3456 7890</li>
            <li>✉ support@aerorent.id</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom flex justify-between items-center flex-wrap gap-2">
        <span class="text-faint" style="font-size:13px;">© 2026 AeroRent. Hak Cipta Dilindungi.</span>
        <div class="flex gap-4">
          <a href="#" class="text-dim" style="font-size:13px;">Syarat &amp; Ketentuan</a>
          <a href="#" class="text-dim" style="font-size:13px;">Kebijakan Privasi</a>
        </div>
      </div>
    </div>`;
}
