'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getStoredTokens, storeTokens } from './api';

export type UserRole =
  | 'ADMIN'
  | 'GERANT'
  | 'RECEPTIONNISTE'
  | 'AGENT_LAVERIE'
  | 'AGENT_NETTOYAGE'
  | 'CHAUFFEUR'
  | 'CLIENT';

export interface AuthUser {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: UserRole;
  branchId: string | null;
  clientId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<AuthUser>;
  registerClient: (data: {
    fullName: string;
    phone: string;
    password: string;
    email?: string;
    address?: string;
    district?: string;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const tokens = getStoredTokens();
    if (!tokens) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<AuthUser>('/auth/me');
      setUser(data);
    } catch {
      storeTokens(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (phone: string, password: string) => {
    const { data } = await api.post('/auth/login', { phone, password });
    storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    return data.user as AuthUser;
  }, []);

  const registerClient = useCallback(async (payload: any) => {
    const { data } = await api.post('/auth/register-client', payload);
    storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    return data.user as AuthUser;
  }, []);

  const logout = useCallback(async () => {
    const tokens = getStoredTokens();
    if (tokens?.refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken: tokens.refreshToken });
      } catch {
        // pas grave si l'appel échoue, on nettoie quand même localement
      }
    }
    storeTokens(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, registerClient, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé à l\'intérieur de <AuthProvider>.');
  return ctx;
}
