'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

const memory = new Map<string, unknown>();
const CACHE_PREFIX = 'ac.cache.';

function readCache<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, value: unknown, persist: boolean) {
  memory.set(key, value);
  if (!persist) return;
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* stockage plein : on ignore */
  }
}

export function clearApiCache() {
  memory.clear();
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* rien */
  }
}

export interface UseApiOptions {
  /** Rafraîchissement périodique (ms). */
  refreshInterval?: number;
  /** Garder la réponse sur le téléphone pour l'afficher sans réseau. */
  persist?: boolean;
  enabled?: boolean;
}

/**
 * Lecture d'une ressource de l'API avec affichage immédiat de la dernière version connue
 * (mémoire ou stockage du téléphone), puis mise à jour en arrière-plan.
 */
export function useApi<T>(path: string | null, opts: UseApiOptions = {}) {
  const { refreshInterval, persist = true, enabled = true } = opts;
  const [data, setData] = useState<T | undefined>(() => (path ? readCache<T>(path) : undefined));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path && enabled);
  const pathRef = useRef(path);
  pathRef.current = path;

  const reload = useCallback(async () => {
    const current = pathRef.current;
    if (!current) return;
    setLoading(true);
    try {
      const result = await api<T>(current);
      if (pathRef.current === current) {
        writeCache(current, result, persist);
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (pathRef.current === current) setError(err as ApiError);
    } finally {
      if (pathRef.current === current) setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    if (!path || !enabled) return;
    setData(readCache<T>(path));
    void reload();
    const onFocus = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onFocus);
    const timer = refreshInterval ? setInterval(() => document.visibilityState === 'visible' && void reload(), refreshInterval) : null;
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onFocus);
      if (timer) clearInterval(timer);
    };
  }, [path, enabled, refreshInterval, reload]);

  const mutate = useCallback(
    (value: T) => {
      if (pathRef.current) writeCache(pathRef.current, value, persist);
      setData(value);
    },
    [persist],
  );

  return { data, error, loading, reload, mutate };
}
