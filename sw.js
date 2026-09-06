/* Flësh Service Worker — offline-first caching.
   Pre-caches the app shell + all local (self-hosted) assets so the app
   launches and works fully offline. Supabase network calls are never cached
   as offline responses; they simply fail fast and sync resumes when online. */

const CACHE = 'flesh-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './lib/chart/chart.umd.min.js',
  './lib/katex/katex.min.js',
  './lib/katex/katex.min.css',
  './lib/katex/auto-render.min.js',
  './lib/katex/mhchem.min.js',
  './lib/fonts/inter.css',
  './lib/fonts/fraunces.css',
  './lib/fonts/jetbrains.css'
];

/* Self-hosted fonts + KaTeX fonts are in lib/fonts & lib/katex/fonts.
   We cache them lazily (cache-first) on first fetch, and precache here by
   matching any /lib/ request. */

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => {
      // Individual font files will be fetched on first render; cache them too.
      return c.addAll(PRECACHE).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never touch Supabase REST/auth from the SW cache path.
  if (url.origin.includes('supabase.co')) return;

  // App shell + local assets: cache-first, fall back to network then cache.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.ok && (url.pathname.endsWith('.woff2') || url.pathname.endsWith('.woff')
              || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')
              || url.pathname.endsWith('.png') || url.pathname.endsWith('.json')
              || url.pathname.endsWith('.html'))) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Same-origin handled above. For any other same-origin subresources fall
  // through to network-only by returning normally.
});
