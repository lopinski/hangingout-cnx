// HangingOut CNX service worker.
// Bump VERSION (and the ?v= query strings in index.html) on every release.
const VERSION = 'v26';
const CACHE = `hangingout-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  `./styles.css?v=26`,
  `./boot.js?v=26`,
  `./i18n.js?v=26`,
  `./events.js?v=26`,
  `./app.js?v=26`,
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

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
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
