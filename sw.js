// Offline shell for יומן כוח. Bump VERSION whenever app files change.
const VERSION = 'koach-v21';
const SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/logo.png', 'icons/kettlebell.webp', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'fonts/fonts.css',
  'fonts/heebo-hebrew-300-normal.woff2', 'fonts/heebo-hebrew-400-normal.woff2', 'fonts/heebo-hebrew-500-normal.woff2',
  'fonts/heebo-latin-400-normal.woff2', 'fonts/heebo-latin-500-normal.woff2'
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the HTTP cache so a new version really downloads fresh files
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Same-origin GETs: serve from cache, refresh in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
