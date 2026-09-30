/* PÉDAGOGUE.IA — service worker minimal : rend l'application installable et affiche une page claire hors connexion.
   Aucune mise en cache des pages ni des réponses de l'IA : tout vient toujours du serveur. */
const HORS_LIGNE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors connexion — PÉDAGOGUE.IA</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f6f7f5;color:#17202a;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:20px">
<div style="max-width:360px;background:#fff;border:1px solid #e2e6ea;border-radius:16px;padding:24px">
<div style="font-size:40px">📶</div><h1 style="font-size:20px;color:#00592a">Pas de connexion Internet</h1>
<p style="line-height:1.5">PÉDAGOGUE.IA a besoin d'Internet pour préparer vos cours. Vérifiez vos données mobiles ou le Wi-Fi, puis réessayez.</p>
<button onclick="location.reload()" style="background:#00843d;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;font-weight:bold">Réessayer</button>
</div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(HORS_LIGNE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
