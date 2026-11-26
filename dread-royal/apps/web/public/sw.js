/* DREAD ROYAL — service worker
 * - Coque applicative : précache + cache des pages et ressources statiques (cache d'abord, mise à jour en arrière-plan)
 * - API GET autorisées : réseau d'abord, cache en secours (consultation hors connexion)
 * - Les écritures ne passent jamais par le cache : la file hors ligne est gérée par l'application (IndexedDB)
 */
const VERSION = 'dr-v1';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const PRECACHE = ['/', '/login/', '/manifest.webmanifest', '/logo.jpg', '/icons/icon-192.png', '/favicon.png'];
// Lectures mises en cache pour l'usage hors ligne (aucune donnée financière sensible)
const CACHEABLE_API = [/\/api\/clients(\?|$)/, /\/api\/services/, /\/api\/staff(\?|$)/, /\/api\/stock\/products/, /\/api\/appointments(\?|$)/, /\/api\/settings$/, /\/api\/auth\/me$/, /\/api\/loyalty\/packages/];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'logout') caches.delete(DATA);
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/') || url.pathname.includes('/api/')) {
    if (!CACHEABLE_API.some((r) => r.test(url.pathname + url.search))) return;
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.open(DATA).then((c) => c.match(req)).then((r) => r || new Response(JSON.stringify({ message: 'Hors connexion' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  // Pages : réseau d'abord (contenu à jour), cache en secours
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.open(SHELL).then((c) => c.match(req).then((r) => r || c.match('/')))),
    );
    return;
  }
  // Ressources statiques : cache d'abord
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return res; }).catch(() => cached);
      return cached || net;
    }),
  );
});
