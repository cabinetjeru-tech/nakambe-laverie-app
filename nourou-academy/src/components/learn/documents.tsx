"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, FileText, HardDriveDownload, Loader2 } from "lucide-react";

export type DocItem = { id: string; label: string; size: number; mime: string; url: string; downloadUrl: string; downloadable: boolean };

const OFFLINE_CACHE = "nga-offline-docs";

function sizeLabel(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(n / 1024)} Ko`;
}

/** Supports téléchargeables : téléchargement direct et enregistrement hors ligne (Cache API). */
export function DocumentList({ docs }: { docs: DocItem[] }) {
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!("caches" in window)) return;
    caches.open(OFFLINE_CACHE).then(async (c) => {
      const keys = await c.keys();
      const ids = new Set(keys.map((k) => new URL(k.url).pathname.split("/").pop()));
      setSaved(Object.fromEntries(docs.map((d) => [d.id, ids.has(d.id)])));
    });
  }, [docs]);

  async function keepOffline(d: DocItem) {
    setBusy(d.id);
    try {
      const res = await fetch(d.url, { credentials: "include" });
      if (!res.ok) throw new Error();
      const cache = await caches.open(OFFLINE_CACHE);
      const headers = new Headers(res.headers);
      headers.set("x-nga-label", encodeURIComponent(d.label));
      await cache.put(`/hors-ligne/fichier/${d.id}`, new Response(await res.blob(), { headers }));
      setSaved((s) => ({ ...s, [d.id]: true }));
    } catch {
      alert("Enregistrement impossible. Vérifiez votre connexion et l'espace disponible.");
    } finally {
      setBusy(null);
    }
  }

  if (docs.length === 0) return null;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-3 p-4">
          <FileText className="h-5 w-5 shrink-0 text-sky" aria-hidden />
          <div className="min-w-0 flex-1">
            <a href={d.url} target="_blank" rel="noopener" className="block truncate text-sm font-medium text-navy hover:text-sky">{d.label}</a>
            <div className="text-xs text-muted">{sizeLabel(d.size)}</div>
          </div>
          {d.downloadable && (
            <div className="flex items-center gap-2">
              <a href={d.downloadUrl} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-navy hover:bg-sky-50">
                <Download className="h-3.5 w-3.5" aria-hidden /> Télécharger
              </a>
              {"caches" in (typeof window !== "undefined" ? window : {}) && (
                <button
                  onClick={() => keepOffline(d)}
                  disabled={busy === d.id || saved[d.id]}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-navy hover:bg-sky-50 disabled:opacity-70"
                >
                  {busy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved[d.id] ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <HardDriveDownload className="h-3.5 w-3.5" />}
                  {saved[d.id] ? "Disponible hors ligne" : "Garder hors ligne"}
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
