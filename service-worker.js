/* ============================================================
   NoorVerse – service-worker.js
   Offline-capable caching with network-first for API,
   cache-first for static assets.
   ============================================================ */

const CACHE_NAME    = 'noorverse-v1.0.0';
const RUNTIME_CACHE = 'noorverse-runtime-v1';

/* Static assets to pre-cache on install */
const PRECACHE_URLS = [
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'logo.png',
  'pattern.png',
  'quraan.png',
  'compass.png',
  'prayer.png',
  'pdf.png',
  'compass_dial_3d.png',
  'needle.png',
  'icon-play.png',
  'icon-menu.png',
  /* Google Fonts (attempt) */
  'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Cinzel:wght@400;600;900&family=Lato:wght@300;400;700&display=swap',
];

/* ── INSTALL: pre-cache static assets ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(
        PRECACHE_URLS.map(url => new Request(url, { credentials: 'same-origin' }))
      ).catch(err => {
        console.warn('[SW] Some precache items failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: remove old caches ── */
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => !currentCaches.includes(name))
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/* ── FETCH: routing strategy ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET requests */
  if (request.method !== 'GET') return;

  /* Skip chrome-extension and non-http */
  if (!url.protocol.startsWith('http')) return;

  /* Strategy: API calls → Network first, fallback to cache */
  if (
    url.hostname === 'api.alquran.cloud' ||
    url.hostname === 'api.aladhan.com'   ||
    url.hostname === 'nominatim.openstreetmap.org'
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* Strategy: Static assets → Cache first, fallback to network */
  if (
    url.hostname === self.location.hostname ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* Default: network with cache fallback */
  event.respondWith(networkFirst(request));
});

/* ── Cache First ── */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] cacheFirst network failed:', request.url);
    return new Response('Offline – resource not cached.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/* ── Network First ── */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    /* If HTML page, serve offline fallback */
    if (request.headers.get('Accept')?.includes('text/html')) {
      const fallback = await caches.match('index.html');
      if (fallback) return fallback;
    }

    return new Response(JSON.stringify({ error: 'Offline', code: 503 }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/* ── Message: force update ── */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
