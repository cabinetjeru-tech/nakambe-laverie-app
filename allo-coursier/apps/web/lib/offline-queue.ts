'use client';

import { api, ApiError } from './api';

/**
 * File d'actions hors connexion (application livreur) : si le réseau est coupé, l'action est
 * gardée sur le téléphone avec son heure réelle, puis envoyée automatiquement au retour du réseau.
 */
interface QueuedAction {
  id: string;
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
}

const KEY = 'ac.offline-queue';
let flushing = false;
const listeners = new Set<(size: number) => void>();

function load(): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(queue: QueuedAction[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    /* rien */
  }
  listeners.forEach((l) => l(queue.length));
}

export const offlineQueue = {
  size: () => load().length,
  subscribe(listener: (size: number) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Tente l'envoi ; en cas d'absence de réseau, met l'action en file. Renvoie la réponse ou null si mise en file. */
  async send<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
    const withTime = { ...body, occurredAt: body.occurredAt ?? new Date().toISOString() };
    try {
      return await api<T>(path, { method: 'POST', body: withTime });
    } catch (err) {
      if ((err as ApiError).offline) {
        save([...load(), { id: `${Date.now()}-${Math.random()}`, path, body: withTime, createdAt: new Date().toISOString() }]);
        return null;
      }
      throw err;
    }
  },
  async flush() {
    if (flushing) return;
    flushing = true;
    try {
      let queue = load();
      while (queue.length) {
        const [next, ...rest] = queue;
        try {
          await api(next.path, { method: 'POST', body: next.body });
        } catch (err) {
          if ((err as ApiError).offline) break; // toujours hors ligne : on réessaiera
          // Refus définitif (action déjà faite, étape dépassée) : on l'abandonne.
        }
        queue = rest;
        save(queue);
      }
    } finally {
      flushing = false;
    }
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void offlineQueue.flush());
  setInterval(() => navigator.onLine && void offlineQueue.flush(), 30_000);
}
