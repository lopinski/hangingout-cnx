// HangingOut CNX service worker.
// Bump VERSION (and the ?v= query strings in index.html) on every release.
const VERSION = 'v33';
const CACHE = `hangingout-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  `./styles.css?v=33`,
  `./boot.js?v=33`,
  `./i18n.js?v=33`,
  `./events.js?v=33`,
  `./app.js?v=33`,
  './manifest.json',
  './assets/fonts/playfair-display-latin.woff2',
  './assets/fonts/playfair-display-italic-latin.woff2',
  './assets/fonts/plus-jakarta-sans-latin.woff2',
  './assets/icons/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isStatic = url => /\/assets\/(fonts|images|icons)\//.test(url.pathname);

// On a slow or dead connection, stop waiting after a few seconds and use the cached copy.
const NETWORK_TIMEOUT_MS = 4000;

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const fromCache = async () =>
    (await cache.match(request, { ignoreSearch: true })) ||
    (request.mode === 'navigate' ? cache.match('./index.html') : undefined);

  const fromNetwork = fetch(request).then(fresh => {
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  });
  fromNetwork.catch(() => {});                       // handled below; avoids an unhandled rejection

  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'timeout'));
  try {
    const first = await Promise.race([fromNetwork, timeout]);
    if (first !== 'timeout') return first;
    return (await fromCache()) || fromNetwork;       // nothing cached yet: keep waiting for the network
  } catch (err) {
    const cached = await fromCache();
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    // Offline and never seen: answer with "no content" so pictures fail quietly
    // (their containers keep their size and paper tint).
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Code and listings: always try the network first so releases show up immediately.
  // Fonts and images never change under the same name: serve from cache.
  event.respondWith(isStatic(url) ? cacheFirst(request) : networkFirst(request));
});
