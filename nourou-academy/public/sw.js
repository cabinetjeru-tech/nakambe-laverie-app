/* NOUROU GLOBAL ACADEMY — service worker (PWA)
 * - Ressources statiques : cache d'abord (versionnées par Next.js).
 * - Pages : réseau d'abord, repli sur la dernière version en cache puis sur /hors-ligne.
 * - API : jamais mises en cache (sauf supports explicitement enregistrés par l'apprenant,
 *   gérés dans le cache "nga-offline-docs" par l'application).
 * Le tuteur IA, les paiements et la vidéo en streaming nécessitent une connexion.
 */
const VERSION = "nga-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const PRECACHE = ["/hors-ligne", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("nga-v") && !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  // Déconnexion : on efface les pages privées mises en cache sur l'appareil.
  if (event.data === "logout") event.waitUntil(caches.delete(PAGES));
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/hors-ligne/fichier/")) {
    event.respondWith(caches.open("nga-offline-docs").then((c) => c.match(url.pathname)).then((r) => r || new Response("Document non disponible hors ligne", { status: 404 })));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/_next/image")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
    return;
  }

  if (req.mode === "navigate") {
    const cacheable = !url.pathname.startsWith("/admin") && !url.pathname.startsWith("/formateur") && !url.pathname.startsWith("/paiement");
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy)).then(() => trimCache(PAGES, 60));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/hors-ligne")) || new Response("Hors ligne", { status: 503 })),
    );
  }
});
