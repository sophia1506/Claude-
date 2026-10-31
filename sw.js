// Service Worker: speichert die App-Dateien, damit Mondzeit offline läuft.
// Bei jeder Änderung an App-Dateien VERSION erhöhen, damit Handys das Update laden.

const VERSION = 'mondzeit-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/util.js',
  './js/db.js',
  './js/store.js',
  './js/cycle.js',
  './js/context.js',
  './js/backup.js',
  './js/reminders.js',
  './js/charts.js',
  './js/ui.js',
  './js/views/home.js',
  './js/views/calendar.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './js/views/entry.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Neue Version übernimmt erst nach „Neu laden" bzw. dem nächsten Start.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Cache zuerst (offline-fähig); nur eigene Dateien, niemals fremde Server.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
