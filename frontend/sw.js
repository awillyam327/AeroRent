/**
 * ==============================================================================
 * AeroRent POS — Service Worker (PWA)
 * Strategi Cache  : Cache-First untuk aset statis, Network-First untuk API
 * IndexedDB       : Menyimpan transaksi offline + antrian sinkronisasi
 * Background Sync : Sinkronisasi aksi offline saat koneksi pulih
 * ==============================================================================
 */

const SW_VERSION   = 'v1.2.1';
const STATIC_CACHE = `aerorent-static-${SW_VERSION}`;
const API_CACHE    = `aerorent-api-${SW_VERSION}`;
const IDB_NAME     = 'aerorent-pos-idb';
const IDB_VERSION  = 1;

/** Aset yang di-precache saat Service Worker diinstall */
const PRECACHE_URLS = [
    './pos-kasir.html',
];

// ==============================================================================
// INSTALL: Pre-cache aset statis yang kritis
// ==============================================================================
self.addEventListener('install', (event) => {
    console.log(`[SW ${SW_VERSION}] Installing...`);
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                // addAll dengan per-item error handling agar tidak gagal total
                const promises = PRECACHE_URLS.map((url) =>
                    cache.add(url).catch((err) =>
                        console.warn(`[SW] Gagal precache: ${url}`, err)
                    )
                );
                return Promise.all(promises);
            })
            .then(() => {
                console.log(`[SW ${SW_VERSION}] Precache selesai.`);
                return self.skipWaiting(); // Aktifkan langsung tanpa menunggu tab lama tutup
            })
    );
});

// ==============================================================================
// ACTIVATE: Hapus cache versi lama
// ==============================================================================
self.addEventListener('activate', (event) => {
    console.log(`[SW ${SW_VERSION}] Activating...`);
    event.waitUntil(
        caches.keys()
            .then((cacheNames) =>
                Promise.all(
                    cacheNames
                        .filter((name) => name !== STATIC_CACHE && name !== API_CACHE)
                        .map((name) => {
                            console.log(`[SW] Hapus cache lama: ${name}`);
                            return caches.delete(name);
                        })
                )
            )
            .then(() => self.clients.claim()) // Ambil alih semua tab yang terbuka
    );
});

// ==============================================================================
// FETCH: Routing strategi berdasarkan jenis request
// ==============================================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Hanya handle GET dan request dari origin yang relevan
    if (request.method !== 'GET') return;

    // Endpoint API backend → Network-First (data harus selalu fresh)
    const isApiCall = (
        url.pathname.startsWith('/transaksi') ||
        url.pathname.startsWith('/kendaraan') ||
        url.pathname.startsWith('/pelanggan') ||
        url.pathname.startsWith('/laporan')   ||
        url.pathname.startsWith('/pengeluaran')
    );

    if (isApiCall) {
        event.respondWith(networkFirstStrategy(request, API_CACHE));
        return;
    }

    // Semua aset lain (HTML, Font, Tailwind CDN) → Cache-First
    event.respondWith(cacheFirstStrategy(request));
});

// ==============================================================================
// STRATEGI: Cache-First
// Ambil dari cache lokal dulu. Jika tidak ada, fetch dari network & simpan.
// ==============================================================================
async function cacheFirstStrategy(request) {
    try {
        const cached = await caches.match(request);
        if (cached) return cached;

        const networkResp = await fetch(request);
        // Simpan ke cache hanya jika respons valid dan bukan opaque (CORS)
        if (networkResp && networkResp.status === 200 && networkResp.type !== 'opaque') {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResp.clone());
        }
        return networkResp;
    } catch (error) {
        console.log('[SW Cache-First] Offline, mencari fallback...');
        // Fallback: coba tampilkan pos-kasir.html dari cache
        const fallback = await caches.match('./pos-kasir.html');
        if (fallback) return fallback;

        // Last resort response
        return new Response(
            `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Offline — AeroRent POS</title>
            <style>body{margin:0;background:#0A0A14;color:white;font-family:sans-serif;
            display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;}
            h1{font-size:2rem;margin-bottom:8px;}p{color:#9CA3AF;}</style></head>
            <body><div><h1>📡 Offline</h1>
            <p>Tidak ada koneksi internet. Silakan sambungkan kembali.</p></div></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}

// ==============================================================================
// STRATEGI: Network-First
// Coba network dulu. Jika gagal/offline, gunakan cache sebagai fallback.
// ==============================================================================
async function networkFirstStrategy(request, cacheName) {
    try {
        const networkResp = await fetch(request);
        if (networkResp && networkResp.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResp.clone());
        }
        return networkResp;
    } catch (error) {
        console.log(`[SW Network-First] Offline, fallback cache: ${request.url}`);
        const cached = await caches.match(request);
        if (cached) return cached;

        // Kembalikan respons offline JSON agar frontend bisa handle
        return new Response(
            JSON.stringify({
                error:   'offline',
                message: 'Tidak ada koneksi. Data diambil dari cache lokal.',
                offline: true,
                timestamp: new Date().toISOString(),
            }),
            {
                status:  503,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
}

// ==============================================================================
// BACKGROUND SYNC: Sinkronisasi antrian offline saat koneksi pulih
// Tag: 'aerorent-sync-queue'
// ==============================================================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'aerorent-sync-queue') {
        console.log('[SW Sync] Background sync dimulai...');
        event.waitUntil(processOfflineQueue());
    }
});

async function processOfflineQueue() {
    const db    = await openIDB();
    const queue = await idbGetAll(db, 'offline_queue');

    if (queue.length === 0) {
        console.log('[SW Sync] Antrian kosong.');
        return;
    }

    console.log(`[SW Sync] Memproses ${queue.length} item dalam antrian...`);

    for (const item of queue) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (item.auth_token) headers['Authorization'] = `Bearer ${item.auth_token}`;

            const resp = await fetch(item.endpoint, {
                method:  item.method || 'POST',
                headers: headers,
                body:    item.body ? JSON.stringify(item.body) : undefined,
            });

            if (resp.ok) {
                await idbDelete(db, 'offline_queue', item.id);
                console.log(`[SW Sync] ✅ Item ${item.id} berhasil disinkronisasi.`);

                // Beritahu semua tab yang terbuka bahwa sync berhasil
                const clients = await self.clients.matchAll({ type: 'window' });
                clients.forEach((client) =>
                    client.postMessage({
                        type:          'SYNC_SUCCESS',
                        item_id:       item.id,
                        nomor_booking: item.nomor_booking || '—',
                        action_type:   item.action_type || 'unknown',
                    })
                );
            } else {
                const errText = await resp.text().catch(() => '');
                console.warn(`[SW Sync] ⚠️ Gagal item ${item.id}: HTTP ${resp.status}`, errText);
            }
        } catch (err) {
            console.error(`[SW Sync] ❌ Error item ${item.id}:`, err);
        }
    }
}

// ==============================================================================
// PUSH NOTIFICATION: Terima push dari server (reminder pengembalian, dll.)
// ==============================================================================
self.addEventListener('push', (event) => {
    const data    = event.data?.json() ?? {};
    const title   = data.title || 'AeroRent POS';
    const options = {
        body:    data.body || 'Ada notifikasi baru.',
        icon:    '/icon-192x192.png',
        badge:   '/badge-72x72.png',
        vibrate: [200, 100, 200, 100, 200],
        data:    { url: data.url || './' },
        actions: [
            { action: 'open', title: 'Lihat' },
            { action: 'dismiss', title: 'Tutup' },
        ],
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            return clients.openWindow(event.notification.data?.url || './');
        })
    );
});

// ==============================================================================
// INDEXEDDB HELPERS — Akses IDB dari konteks Service Worker
// ==============================================================================

/** Buka / upgrade IndexedDB dengan object store yang diperlukan */
function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            // Store: transaksi — cache transaksi yang pernah dimuat
            if (!db.objectStoreNames.contains('transaksi')) {
                const ts = db.createObjectStore('transaksi', { keyPath: 'id_transaksi' });
                ts.createIndex('idx_booking', 'nomor_booking', { unique: false });
                ts.createIndex('idx_status',  'status',        { unique: false });
                ts.createIndex('idx_cached',  'cached_at',     { unique: false });
            }

            // Store: offline_queue — aksi yang menunggu sinkronisasi ke backend
            if (!db.objectStoreNames.contains('offline_queue')) {
                const oq = db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true });
                oq.createIndex('idx_created',     'created_at',  { unique: false });
                oq.createIndex('idx_sync_status', 'sync_status', { unique: false });
            }
        };

        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

/** Ambil semua record dari object store */
function idbGetAll(db, storeName) {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => reject(req.error);
    });
}

/** Hapus record berdasarkan key */
function idbDelete(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror   = () => reject(req.error);
    });
}