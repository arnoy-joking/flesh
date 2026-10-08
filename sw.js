/* ============================================================
   Flësh — service worker
   ------------------------------------------------------------
   Caching policy, per resource type:

     app shell (any .html navigation)   network-first
       Online: always the newest index.html, so a deploy reaches users on
       their very next load. Offline: the last good copy, so the app opens.

     static assets (fonts, KaTeX, Chart.js, icons, css, js)
                                        cache-first + background refresh
       Fast and fully offline. A changed file is picked up on the next load.

     Supabase / any cross-origin request   never intercepted
       Auth and sync always talk straight to the network.

   ONE knob to remember:

     VERSION (below)

   Bump it and the next activate() deletes every old Flësh cache. That is what
   makes a deploy land. The previous version of this file could not do that:
   its activate() kept a hardcoded allowlist of old cache names
   ('flesh-assets-v2', 'flesh-v3'), and caches.match() returns the OLDEST
   matching cache first — so bumping the version wrote fresh copies nobody
   ever read, and stale assets were served forever. There is no allowlist now.
   ============================================================ */

const VERSION = 'v4';                       // <-- bump on every deploy
const PREFIX = 'flesh-';
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const ASSET_CACHE = `${PREFIX}assets-${VERSION}`;
const KEEP = [SHELL_CACHE, ASSET_CACHE];    // everything else gets deleted

/* Precached at install so the app can open with no network at all.
   Anything beyond this is cached lazily on first use. */
const PRECACHE_SHELL = ['./', './index.html', './manifest.webmanifest'];
const PRECACHE_ASSETS = ['./icons/icon-192.png', './icons/icon-512.png'];

/* ---------- install ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE)
        // one bad URL must not abort the whole install
        .then((cache) => Promise.all(PRECACHE_SHELL.map((u) => cache.add(u).catch(() => {})))),
      caches.open(ASSET_CACHE)
        .then((cache) => Promise.all(PRECACHE_ASSETS.map((u) => cache.add(u).catch(() => {}))))
    ])
      .then(() => self.skipWaiting())       // let the new worker take over at once
  );
});

/* ---------- activate ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // No allowlist: any cache we do not own right now is stale and goes.
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())     // control any tab that is already open
  );
});

/* ---------- routing helpers ---------- */
function isShellRequest(url, request) {
  return request.mode === 'navigate' || /\.html?$/i.test(url.pathname) || url.pathname === '/';
}
function isStaticAsset(url) {
  return /\.(woff2?|ttf|otf|eot|js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|json|map)$/i
    .test(url.pathname);
}
/* Only store real, complete, same-origin successes. Caching a redirect, an
   error page or an opaque response is how a broken build gets frozen offline. */
function worthCaching(response) {
  return !!response && response.ok && response.type === 'basic';
}
function put(cacheName, request, response) {
  if (!worthCaching(response)) return Promise.resolve();
  const copy = response.clone();
  return caches.open(cacheName).then((c) => c.put(request, copy)).catch(() => {});
}

/* ---------- fetch ---------- */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch Supabase or any other cross-origin API.
  if (url.origin !== self.location.origin) return;

  /* App shell — network first, cache as the offline fallback. */
  if (isShellRequest(url, request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          put(SHELL_CACHE, request, response);
          return response;
        })
        .catch(() =>
          caches.match(request)
            // any shell copy beats nothing; './' and './index.html' are aliases
            .then((hit) => hit || caches.match('./index.html', { cacheName: SHELL_CACHE }))
            .then((hit) => hit || caches.match('./', { cacheName: SHELL_CACHE }))
        )
    );
    return;
  }

  /* Static assets — cache first, refresh in the background. */
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request, { cacheName: ASSET_CACHE }).then((hit) => {
        const network = fetch(request)
          .then((response) => {
            put(ASSET_CACHE, request, response);
            return response;
          })
          // offline with a cold cache: nothing to give back
          .catch(() => hit || Response.error());

        if (hit) {
          event.waitUntil(network.catch(() => {}));   // stale-while-revalidate
          return hit;
        }
        return network;
      })
    );
    return;
  }

  // Anything else same-origin: leave it to the browser.
});
