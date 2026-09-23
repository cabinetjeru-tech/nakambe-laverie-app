/* Service worker ALLÔ-COURSIER : fonctionnement en réseau faible et notifications push. */
const VERSION = 'ac-v1';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const TILES = `${VERSION}-tiles`;
const MAX_TILES = 400;
const OFFLINE_URL = '/hors-ligne';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png', '/logo.svg'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // L'API n'est jamais mise en cache ici : l'application gère ses propres données hors connexion.
  if (url.pathname.startsWith('/api/')) return;

  // Tuiles de carte OpenStreetMap : cache d'abord (économise la data), limité en nombre.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          cache.put(req, res.clone());
          trimCache(TILES, MAX_TILES);
        }
        return res;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Fichiers statiques versionnés de Next.js : cache d'abord.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.endsWith('.svg')) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages : réseau d'abord, puis dernière version en cache, puis page « hors ligne ».
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL))),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Allô-Coursier', body: event.data ? event.data.text() : '' };
  }
  const isOffer = data.type === 'NEW_OFFER';
  event.waitUntil(
    self.registration.showNotification(data.title || 'Allô-Coursier', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      data: { url: data.url || '/' },
      tag: isOffer ? 'offer' : undefined,
      renotify: isOffer,
      requireInteraction: isOffer,
      vibrate: isOffer ? [300, 100, 300, 100, 300] : [150],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
