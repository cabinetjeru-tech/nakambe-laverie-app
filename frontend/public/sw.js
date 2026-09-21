// Service worker minimal — permet un usage de base hors-ligne sans jamais
// bloquer les mises à jour : le réseau est toujours tenté en premier, le
// cache ne sert que de secours quand le téléphone est hors connexion.
// Voir docs/01-ARCHITECTURE.md §8 : ceci est une v1 du besoin « mode hors connexion »,
// pas une synchronisation bidirectionnelle complète.
const CACHE_NAME = 'nakambe-shell-v2';
const SHELL_URLS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.url.includes('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
