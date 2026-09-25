"use client";
import { useEffect, useState } from "react";
import { FileText, Trash2 } from "lucide-react";

type Item = { url: string; label: string; size: number };

export function OfflineLibrary() {
  const [items, setItems] = useState<Item[] | null>(null);
  const load = async () => {
    if (!("caches" in window)) return setItems([]);
    const cache = await caches.open("nga-offline-docs");
    const keys = await cache.keys();
    const out: Item[] = [];
    for (const k of keys) {
      const res = await cache.match(k);
      out.push({ url: k.url, label: decodeURIComponent(res?.headers.get("x-nga-label") ?? "Document"), size: Number(res?.headers.get("content-length") ?? 0) });
    }
    setItems(out);
  };
  useEffect(() => {
    void load();
  }, []);
  const open = async (url: string) => {
    const res = await (await caches.open("nga-offline-docs")).match(url);
    if (!res) return;
    window.open(URL.createObjectURL(await res.blob()), "_blank");
  };
  const remove = async (url: string) => {
    await (await caches.open("nga-offline-docs")).delete(url);
    void load();
  };
  if (items === null) return <p className="mt-6 text-sm text-muted">Chargement…</p>;
  if (items.length === 0) return <p className="mt-6 rounded-xl bg-surface p-6 text-sm text-muted">Aucun support enregistré. Dans une leçon, utilisez « Garder hors ligne » sur un document.</p>;
  return (
    <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
      {items.map((i) => (
        <li key={i.url} className="flex items-center gap-3 p-4">
          <FileText className="h-5 w-5 text-sky" aria-hidden />
          <button onClick={() => open(i.url)} className="flex-1 text-left text-sm font-medium text-navy hover:text-sky">{i.label}</button>
          <button onClick={() => remove(i.url)} className="text-muted hover:text-red-600" aria-label="Retirer de l'appareil"><Trash2 className="h-4 w-4" /></button>
        </li>
      ))}
    </ul>
  );
}
