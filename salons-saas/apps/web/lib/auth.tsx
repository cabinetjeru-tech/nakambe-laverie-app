'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applySession, get, post, refreshSession, Session, setSessionListener } from './api';

export interface Me {
  user: { id: string; fullName: string; phone: string; email: string | null };
  memberships: { membershipId: string; tenantId: string; slug: string; name: string; status: string }[];
  activeTenant: Session['activeTenant'];
  /** Membre de l'équipe plateforme (console super administrateur) ; null sinon. */
  platformRole: 'PLATFORM_OWNER' | 'PLATFORM_BILLING' | 'PLATFORM_SUPPORT' | null;
}

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated';
  me: Me | null;
  permissions: Set<string>;
  can: (...codes: string[]) => boolean;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (payload: Record<string, string>) => Promise<void>;
  acceptSession: (session: Session) => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const loadMe = useCallback(async () => {
    const profile = await get<Me>('/auth/me');
    setMe(profile);
    setPermissions(new Set(profile.activeTenant?.permissions ?? []));
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    setSessionListener((session) => {
      if (!session) {
        setStatus('anonymous');
        setMe(null);
        setPermissions(new Set());
      } else {
        setPermissions(new Set(session.activeTenant?.permissions ?? []));
      }
    });
    refreshSession().then((session) => {
      if (session) loadMe().catch(() => setStatus('anonymous'));
      else setStatus('anonymous');
    });
  }, [loadMe]);

  const acceptSession = useCallback(
    async (session: Session) => {
      applySession(session);
      await loadMe();
    },
    [loadMe],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      permissions,
      can: (...codes) => codes.some((code) => permissions.has(code)),
      login: async (identifier, password) => acceptSession(await post<Session>('/auth/login', { identifier, password })),
      signup: async (payload) => acceptSession(await post<Session>('/auth/signup', payload)),
      acceptSession,
      switchTenant: async (tenantId) => acceptSession(await post<Session>('/auth/switch-tenant', { tenantId })),
      logout: async () => {
        await post('/auth/logout').catch(() => undefined);
        applySession(null);
      },
      reload: loadMe,
    }),
    [status, me, permissions, acceptSession, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth hors de AuthProvider');
  return context;
}
