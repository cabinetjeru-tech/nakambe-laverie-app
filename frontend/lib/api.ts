import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export const api = axios.create({ baseURL: API_URL });

function getStoredTokens() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('nakambe_auth');
  return raw ? (JSON.parse(raw) as { accessToken: string; refreshToken: string }) : null;
}

function storeTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  if (typeof window === 'undefined') return;
  if (tokens) window.localStorage.setItem('nakambe_auth', JSON.stringify(tokens));
  else window.localStorage.removeItem('nakambe_auth');
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const tokens = getStoredTokens();
  if (tokens?.accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) return null;
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, {
      refreshToken: tokens.refreshToken,
    });
    storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken as string;
  } catch {
    storeTokens(null);
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      if (!refreshPromise) refreshPromise = refreshAccessToken().finally(() => (refreshPromise = null));
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers = original.headers ?? {};
        (original.headers as any).Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/connexion';
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Ouvre un PDF protégé par authentification dans un nouvel onglet.
 * Un simple lien <a href> ne fonctionnerait pas car le token JWT est
 * envoyé via l'en-tête Authorization (localStorage), pas via un cookie.
 *
 * La fenêtre est ouverte de façon SYNCHRONE (avant l'attente réseau) puis
 * redirigée une fois le PDF récupéré : sur mobile, un window.open() appelé
 * après un await n'est plus considéré comme déclenché par l'utilisateur et
 * se fait bloquer silencieusement par le navigateur.
 */
export async function openAuthenticatedPdf(path: string) {
  const newWindow = window.open('', '_blank');
  try {
    const response = await api.get(path, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    if (newWindow) newWindow.location.href = blobUrl;
    else window.location.href = blobUrl;
  } catch (err) {
    newWindow?.close();
    throw err;
  }
}

export { getStoredTokens, storeTokens };
