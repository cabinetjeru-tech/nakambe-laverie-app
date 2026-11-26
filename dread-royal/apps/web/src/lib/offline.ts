'use client';
/**
 * File d'attente hors connexion (IndexedDB).
 * Chaque opération reçoit un identifiant unique (UUID) côté appareil : le serveur l'utilise
 * pour ne jamais l'appliquer deux fois. Une vente en file n'est PAS validée tant que le serveur
 * ne l'a pas confirmée.
 */
import { ApiError, post } from './api';

export type OpType = 'client.create' | 'appointment.create' | 'sale.create';
export interface QueuedOp {
  opId: string;
  type: OpType;
  payload: Record<string, any>;
  refs?: Record<string, string>;
  label: string;
  createdAt: string;
  status: 'pending' | 'conflict' | 'rejected';
  message?: string;
  attempts: number;
}
export interface SyncLog {
  id: string;
  at: string;
  sent: number;
  applied: number;
  duplicates: number;
  conflicts: number;
  error?: string;
}

const DB = 'dread-royal';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('ops')) db.createObjectStore('ops', { keyPath: 'opId' });
      if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? (req as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));

export const deviceId = () => {
  let id = localStorage.getItem('dr.device');
  if (!id) { id = uuid(); localStorage.setItem('dr.device', id); }
  return id;
};

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = () => listeners.forEach((l) => l());

export async function listOps(): Promise<QueuedOp[]> {
  const all = ((await tx<QueuedOp[]>('ops', 'readonly', (s) => s.getAll())) ?? []) as QueuedOp[];
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function listLog(): Promise<SyncLog[]> {
  const all = ((await tx<SyncLog[]>('log', 'readonly', (s) => s.getAll())) ?? []) as SyncLog[];
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
}

export async function enqueue(type: OpType, payload: Record<string, any>, label: string, refs?: Record<string, string>): Promise<QueuedOp> {
  const op: QueuedOp = { opId: uuid(), type, payload, refs, label, createdAt: new Date().toISOString(), status: 'pending', attempts: 0 };
  await tx('ops', 'readwrite', (s) => s.put(op));
  emit();
  return op;
}

export async function discard(opId: string) {
  await tx('ops', 'readwrite', (s) => s.delete(opId));
  emit();
}

let flushing = false;
export const isFlushing = () => flushing;

/** Envoie la file au serveur. Renvoie le nombre d'opérations confirmées. */
export async function flush(): Promise<number> {
  if (flushing || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;
  const ops = (await listOps()).filter((o) => o.status === 'pending');
  if (!ops.length) return 0;
  flushing = true;
  emit();
  const log: SyncLog = { id: uuid(), at: new Date().toISOString(), sent: ops.length, applied: 0, duplicates: 0, conflicts: 0 };
  try {
    const r = await post<{ results: { opId: string; status: string; message?: string }[] }>('/sync', {
      deviceId: deviceId(),
      operations: ops.map((o) => ({ opId: o.opId, type: o.type, payload: o.payload, refs: o.refs, createdAt: o.createdAt })),
    });
    for (const res of r.results) {
      const op = ops.find((o) => o.opId === res.opId)!;
      if (res.status === 'APPLIED' || res.status === 'DUPLICATE') {
        res.status === 'APPLIED' ? log.applied++ : log.duplicates++;
        await tx('ops', 'readwrite', (s) => s.delete(res.opId));
      } else {
        log.conflicts++;
        await tx('ops', 'readwrite', (s) => s.put({ ...op, status: res.status === 'CONFLICT' ? 'conflict' : 'rejected', message: res.message, attempts: op.attempts + 1 }));
      }
    }
  } catch (e) {
    log.error = e instanceof ApiError ? e.message : String(e);
  } finally {
    flushing = false;
    await tx('log', 'readwrite', (s) => s.put(log));
    emit();
  }
  return log.applied + log.duplicates;
}

/** Tente l'opération en ligne ; si le serveur est injoignable, la met en file. */
export async function submitOrQueue<T>(type: OpType, payload: Record<string, any>, label: string, online: () => Promise<T>): Promise<{ queued: false; result: T } | { queued: true; op: QueuedOp }> {
  try {
    return { queued: false, result: await online() };
  } catch (e) {
    if (e instanceof ApiError && e.offline) return { queued: true, op: await enqueue(type, payload, label) };
    throw e;
  }
}

let started = false;
export function startAutoSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { emit(); flush(); });
  window.addEventListener('offline', emit);
  setInterval(() => flush(), 30_000);
  flush();
}
