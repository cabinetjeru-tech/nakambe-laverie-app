'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { hasAnyPermission, hasPermission } from '@dread-royal/shared';
import { api, ApiError, cachedUser, post, setOnAuthLost, storeUser, tokens } from './api';

export interface Me {
  id: string;
  username: string;
  fullName: string;
  role: { code: string; name: string };
  permissions: string[];
  staffId: string | null;
  staffName: string | null;
  mustChangePassword: boolean;
}

interface AuthCtx {
  user: Me | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<Me>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  can: (...perms: string[]) => boolean;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) { setUser(null); return; }
    try {
      const me = await api<Me>('/auth/me');
      storeUser(me);
      setUser(me);
    } catch (e) {
      // Hors connexion : on garde le profil mémorisé (les droits restent vérifiés par le serveur à la synchronisation)
      if (e instanceof ApiError && e.offline) setUser(cachedUser<Me>());
      else setUser(null);
    }
  }, []);

  useEffect(() => {
    setOnAuthLost(() => setUser(null));
    reload().finally(() => setLoading(false));
  }, [reload]);

  const login = async (username: string, password: string) => {
    const b = await api<{ accessToken: string; refreshToken: string; user: Me }>('/auth/login', { method: 'POST', json: { username, password } });
    tokens.set(b.accessToken, b.refreshToken);
    storeUser(b.user);
    setUser(b.user);
    return b.user;
  };

  const logout = async () => {
    await post('/auth/logout').catch(() => null);
    tokens.clear();
    navigator.serviceWorker?.controller?.postMessage('logout');
    setUser(null);
  };

  const can = (...perms: string[]) => !!user && (perms.length === 1 ? hasPermission(user.permissions, perms[0]) : hasAnyPermission(user.permissions, perms));

  return <Ctx.Provider value={{ user, loading, login, logout, reload, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
