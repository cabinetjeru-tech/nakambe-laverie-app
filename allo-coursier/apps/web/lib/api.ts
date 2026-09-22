/**
 * Client de l'API ALLÔ-COURSIER (même domaine : /api/v1).
 * Gère les jetons (accès court + renouvellement), le renouvellement automatique et les erreurs lisibles.
 */
export const API_BASE = '/api/v1';

const ACCESS_KEY = 'ac.access';
const REFRESH_KEY = 'ac.refresh';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public offline = false,
  ) {
    super(message);
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const tokens = {
  get access() {
    return storage()?.getItem(ACCESS_KEY) ?? null;
  },
  get refresh() {
    return storage()?.getItem(REFRESH_KEY) ?? null;
  },
  set(access: string, refresh?: string) {
    storage()?.setItem(ACCESS_KEY, access);
    if (refresh) storage()?.setItem(REFRESH_KEY, refresh);
    listeners.forEach((l) => l());
  },
  clear() {
    storage()?.removeItem(ACCESS_KEY);
    storage()?.removeItem(REFRESH_KEY);
    listeners.forEach((l) => l());
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokens.refresh;
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        if (res.status === 401) tokens.clear();
        return false;
      }
      const data = await res.json();
      tokens.set(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false; // réseau coupé : on garde les jetons
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  signal?: AbortSignal;
}

function messageOf(data: unknown, status: number): string {
  const m = (data as { message?: string | string[] } | null)?.message;
  if (Array.isArray(m)) return m.join(' ');
  if (typeof m === 'string') return m;
  if (status === 429) return 'Trop de tentatives. Patientez une minute.';
  if (status >= 500) return 'Le service est momentanément indisponible. Réessayez.';
  return 'Une erreur est survenue.';
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const doFetch = () => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (opts.auth !== false && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
    return fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  };

  let res: Response;
  try {
    res = await doFetch();
    if (res.status === 401 && opts.auth !== false && tokens.refresh && (await refreshTokens())) {
      res = await doFetch();
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Pas de connexion Internet. Vos données s’afficheront au retour du réseau.', true);
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new ApiError(res.status, messageOf(data, res.status));
  return data as T;
}

export async function uploadPhoto(purpose: string, file: Blob, name = 'photo.jpg') {
  const form = new FormData();
  form.append('file', file, name);
  return api<{ key: string; url: string }>(`/uploads/${purpose}`, { method: 'POST', body: form });
}

export function newId(prefix = ''): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}${rand}`;
}
