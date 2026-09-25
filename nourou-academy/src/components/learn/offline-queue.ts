"use client";
/**
 * File d'attente locale de la progression : en cas de coupure réseau,
 * les positions vidéo et leçons terminées sont gardées sur le téléphone
 * puis synchronisées automatiquement au retour de la connexion.
 */
type Item = { lessonId: string; position?: number; completed?: boolean; at: number };
const KEY = "nga_progress_queue";

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Item[];
  } catch {
    return [];
  }
}
function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-200)));
  } catch {}
}

export async function sendProgress(item: Omit<Item, "at">): Promise<boolean> {
  try {
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
      keepalive: true,
    });
    if (res.ok) return true;
    if (res.status >= 400 && res.status < 500) return true; // requête invalide : inutile de réessayer
  } catch {}
  // Échec réseau : on garde l'information localement (on ne conserve que la dernière position par leçon).
  const items = read().filter((i) => !(i.lessonId === item.lessonId && item.completed === undefined && i.completed === undefined));
  items.push({ ...item, at: Date.now() });
  write(items);
  return false;
}

let flushing = false;
export async function flushProgressQueue() {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return;
  flushing = true;
  try {
    const items = read();
    const remaining: Item[] = [];
    for (const it of items) {
      try {
        const res = await fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(it) });
        if (!res.ok && res.status >= 500) remaining.push(it);
      } catch {
        remaining.push(it);
      }
    }
    write(remaining);
  } finally {
    flushing = false;
  }
}
