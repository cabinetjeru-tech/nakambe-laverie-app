/**
 * Client HTTP de l'API.
 * - Le jeton d'accès vit uniquement en mémoire (jamais dans localStorage : une faille XSS
 *   ne peut pas le voler durablement).
 * - Le refresh token est dans un cookie HttpOnly : sur 401, un seul renouvellement est
 *   lancé (même si plusieurs requêtes échouent en même temps), puis la requête est rejouée.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  activeTenant: { tenantId: string; membershipId: string; permissions: string[]; salons: '*' | string[] } | null;
}

let accessToken: string | null = null;
let refreshing: Promise<Session | null> | null = null;
let onSessionChange: ((session: Session | null) => void) | null = null;

export function setSessionListener(listener: (session: Session | null) => void) {
  onSessionChange = listener;
}

export function applySession(session: Session | null) {
  accessToken = session?.accessToken ?? null;
  onSessionChange?.(session);
}

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(' ');
    if (typeof message === 'string') return message;
  }
  if (status >= 500) return 'Le serveur ne répond pas correctement. Réessayez dans un instant.';
  return 'Une erreur est survenue.';
}

async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'salons-web');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  // Le renouvellement repose sur le cookie seul : le jeton d'accès (peut-être périmé) n'y est pas joint.
  if (accessToken && path !== '/auth/refresh') headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' });
}

/** Renouvelle la session grâce au cookie ; null si elle est expirée. */
export function refreshSession(): Promise<Session | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const response = await rawRequest('/auth/refresh', { method: 'POST' });
        if (!response.ok) {
          applySession(null);
          return null;
        }
        const session = (await response.json()) as Session;
        applySession(session);
        return session;
      } catch {
        return null;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const options: RequestInit = { ...rest, ...(json !== undefined ? { body: JSON.stringify(json) } : {}) };
  let response = await rawRequest(path, options);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) response = await rawRequest(path, options);
  }
  if (response.status === 204) return undefined as T;
  // Une réponse `null` de l'API arrive avec un corps vide : on renvoie null (React Query
  // n'accepte pas undefined comme donnée).
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) throw new ApiError(response.status, messageFrom(body, response.status), body);
  return body as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const patch = <T>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
export const put = <T>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json });
export const del = <T>(path: string, json?: unknown) => api<T>(path, { method: 'DELETE', json });

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
