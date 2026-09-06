/* Flësh Service Worker — offline support done the *safe* way.

   Key rule: the APP SHELL (index.html / navigation) is NETWORK-FIRST.
   That means whenever the device is online it always fetches the newest
   code from the server, so bug fixes and updates actually reach users.
   Only the immutable static assets (fonts, KaTeX, Chart.js) are cache-first,
   because those never change and are what let the app render offline.

   Supabase API calls are never intercepted here — they go straight to the
   network so auth/sync always behave normally. */

const CACHE = 'flesh-v3';        // bump this whenever caching behavior changes
const IMMUTABLE_CACHE = 'flesh-assets-v3';

const PRECACHE_SHELL = ['./index.html'];
// Assets are cached lazily on first fetch; this just warms the most important.
const PRECACHE_WARM = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(IMMUTABLE_CACHE).then((c) =>
      c.addAll([...PRECACHE_SHELL, ...PRECACHE_WARM]).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== IMMUTABLE_CACHE && k !== 'flesh-assets-v2' && k !== CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isAsset(url) {
  return /\.(woff2?|ttf|js|css|png|webp|svg)$/i.test(url.pathname);
}
function isShell(url) {
  // navigation to the root or index.html = the app shell
  return url.pathname === '/' || /\/index\.html$/i.test(url.pathname) ||
         /\.html$/i.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never interfere with Supabase / any cross-origin API.
  if (url.origin.includes('supabase.co')) return;

  if (url.origin === self.location.origin) {
    if (isShell(url)) {
      // NETWORK-FIRST for the shell: always get the latest app code online.
      e.respondWith(
        fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(IMMUTABLE_CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() =>
          // Offline: fall back to the cached shell so the app still opens.
          caches.match(req).then((m) => m || caches.match('./index.html'))
        )
      );
      return;
    }
    if (isAsset(url)) {
      // CACHE-FIRST for immutable assets (fonts, libs, icons).
      e.respondWith(
        caches.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res && res.ok) {
              const clone = res.clone();
              caches.open(IMMUTABLE_CACHE).then((c) => c.put(req, clone)).catch(() => {});
            }
            return res;
          });
        })
      );
      return;
    }
    // Anything else same-origin: network normally.
    return;
  }
});
