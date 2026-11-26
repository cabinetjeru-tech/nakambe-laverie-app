'use client';
/**
 * Client HTTP de l'API DREAD ROYAL.
 * - Jeton d'accès (15 min) + jeton de rafraîchissement (rotation) stockés sur l'appareil
 * - Rafraîchissement automatique et transparent sur 401
 * - Messages d'erreur en français issus du serveur
 */
const DEFAULT_API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const K = { access: 'dr.access', refresh: 'dr.refresh', server: 'dr.server', user: 'dr.user' };

export class ApiError extends Error {
  constructor(public status: number, message: string, public offline = false) {
    super(message);
  }
}

export function apiBase(): string {
  if (typeof window === 'undefined') return DEFAULT_API;
  return localStorage.getItem(K.server) || DEFAULT_API;
}
export function setApiBase(url: string | null) {
  if (url) localStorage.setItem(K.server, url.replace(/\/+$/, ''));
  else localStorage.removeItem(K.server);
}

export const tokens = {
  get access() { return typeof window === 'undefined' ? null : localStorage.getItem(K.access); },
  get refresh() { return typeof window === 'undefined' ? null : localStorage.getItem(K.refresh); },
  set(a: string, r: string) { localStorage.setItem(K.access, a); localStorage.setItem(K.refresh, r); },
  clear() { localStorage.removeItem(K.access); localStorage.removeItem(K.refresh); localStorage.removeItem(K.user); },
};

export function cachedUser<T>(): T | null {
  try { return JSON.parse(localStorage.getItem(K.user) ?? 'null'); } catch { return null; }
}
export function storeUser(u: unknown) { localStorage.setItem(K.user, JSON.stringify(u)); }

let refreshing: Promise<boolean> | null = null;
let onAuthLost: (() => void) | null = null;
export function setOnAuthLost(fn: () => void) { onAuthLost = fn; }

async function refresh(): Promise<boolean> {
  const rt = tokens.refresh;
  if (!rt) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${apiBase()}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
      if (!r.ok) return false;
      const b = await r.json();
      tokens.set(b.accessToken, b.refreshToken);
      storeUser(b.user);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

function errorMessage(body: any, status: number): string {
  const m = body?.message;
  if (Array.isArray(m)) return m.join(' • ');
  if (typeof m === 'string') return m;
  if (status === 403) return "Vous n'avez pas l'autorisation d'effectuer cette action";
  if (status === 404) return 'Élément introuvable';
  return `Erreur ${status}`;
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  } catch {
    throw new ApiError(0, 'Serveur injoignable : vérifiez votre connexion Internet', true);
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/login')) {
    if (await refresh()) return api<T>(path, init, false);
    tokens.clear();
    onAuthLost?.();
    throw new ApiError(401, 'Session expirée, reconnectez-vous');
  }
  if (res.status === 503 && res.headers.get('content-type')?.includes('json')) {
    const b = await res.json().catch(() => ({}));
    if (b?.message === 'Hors connexion') throw new ApiError(0, 'Hors connexion : donnée non disponible en cache', true);
  }
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status));
  return body as T;
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, json?: unknown) => api<T>(p, { method: 'POST', json: json ?? {} });
export const patch = <T = any>(p: string, json?: unknown) => api<T>(p, { method: 'PATCH', json: json ?? {} });
export const put = <T = any>(p: string, json?: unknown) => api<T>(p, { method: 'PUT', json: json ?? {} });

/** Construit une URL de téléchargement (PDF, Excel, CSV) avec jeton à jour. */
export async function fileUrl(path: string): Promise<string> {
  await api('/auth/me').catch(() => null); // force un rafraîchissement si nécessaire
  const sep = path.includes('?') ? '&' : '?';
  return `${apiBase()}${path}${sep}access_token=${encodeURIComponent(tokens.access ?? '')}`;
}

export async function openFile(path: string) {
  const url = await fileUrl(path);
  window.open(url, '_blank', 'noopener');
}

/** Paramètres de requête en ignorant les valeurs vides. */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}
