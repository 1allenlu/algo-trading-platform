/**
 * TradingOS Service Worker — Phase 30 (PWA).
 *
 * Strategy:
 *   - Static assets (JS/CSS/fonts): Cache-first with network fallback.
 *   - API calls (/api/*):           Network-first; no caching (always fresh data).
 *   - Navigation requests (HTML):   Network-first; fall back to cached shell.
 *
 * Cache is versioned — old caches are purged on activate.
 */

const CACHE_NAME = 'tradingos-v2';

// Assets to pre-cache on install (Vite hashes these filenames, so we cache dynamically)
const PRECACHE_URLS = [
  '/',
  '/dashboard',
  '/manifest.json',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate — purge old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first, no caching
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets: cache-first
  if (
    request.destination === 'script' ||
    request.destination === 'style'  ||
    request.destination === 'font'   ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Navigation (HTML pages): network-first, fall back to '/'
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then((r) => r ?? new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Default: network
  event.respondWith(fetch(request));
});
