'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokens } from './api';
import type { User } from './types';
import { clearApiCache } from './use-api';

interface AuthState {
  user: User | null;
  ready: boolean;
  login(phone: string, secret: string): Promise<User>;
  register(body: Record<string, unknown>): Promise<User>;
  logout(): Promise<void>;
  refreshUser(): Promise<void>;
  can(permission: string): boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const USER_KEY = 'ac.user';

function deviceLabel() {
  return typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 70) : undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const store = (u: User | null) => {
    setUser(u);
    try {
      if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
      else localStorage.removeItem(USER_KEY);
    } catch {
      /* rien */
    }
  };

  const refreshUser = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) {
      store(null);
      return;
    }
    try {
      store(await api<User>('/auth/me'));
    } catch (err) {
      if ((err as { status?: number }).status === 401) store(null);
      // hors ligne : on garde l'utilisateur mémorisé
    }
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(USER_KEY);
      if (cached && tokens.refresh) setUser(JSON.parse(cached));
    } catch {
      /* rien */
    }
    void refreshUser().finally(() => setReady(true));
    return tokens.subscribe(() => {
      if (!tokens.refresh) store(null);
    });
  }, [refreshUser]);

  const login = useCallback(async (phone: string, secret: string) => {
    const res = await api<{ accessToken: string; refreshToken: string; user: User }>('/auth/login', {
      body: { phone, secret, deviceLabel: deviceLabel() },
      auth: false,
    });
    tokens.set(res.accessToken, res.refreshToken);
    store(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (body: Record<string, unknown>) => {
    const res = await api<{ accessToken: string; refreshToken: string; user: User }>('/auth/register', {
      body: { ...body, deviceLabel: deviceLabel() },
      auth: false,
    });
    tokens.set(res.accessToken, res.refreshToken);
    store(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokens.refresh;
    if (refreshToken) await api('/auth/logout', { body: { refreshToken }, auth: false }).catch(() => undefined);
    tokens.clear();
    clearApiCache();
    store(null);
  }, []);

  const can = useCallback(
    (permission: string) => !!user && (user.permissions.includes('*') || user.permissions.includes(permission)),
    [user],
  );

  return <AuthContext.Provider value={{ user, ready, login, register, logout, refreshUser, can }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}

export const isStaff = (u: User | null) => !!u && u.permissions.length > 0;

/** Espace d'arrivée après connexion selon le type de compte. */
export function homeFor(u: User): string {
  if (u.permissions.length > 0) return '/admin';
  if (u.roles.includes('DRIVER')) return '/livreur';
  if (u.roles.includes('MERCHANT')) return '/commercant';
  return '/accueil';
}
