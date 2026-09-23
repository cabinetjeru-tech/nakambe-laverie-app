'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, RequestOptions } from './api';
import { useApi } from './use-api';

export interface Membership {
  id: string;
  name: string;
  slug: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  logoUrl: string | null;
  type: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF';
}

export interface MerchantSpace {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  phone: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  lat: number;
  lng: number;
  addressText: string | null;
  landmark: string | null;
  avgPrepMinutes: number;
  minOrderAmount: number | null;
  isOpenOverride: boolean | null;
  isOpen: boolean;
  commissionPercent: number;
  myRole: Membership['role'];
  city: { id: string; name: string; timezone?: string };
  openingHours: { id: string; weekday: number; opensAt: string; closesAt: string }[];
  closures: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
  members: { role: Membership['role']; user: { id: string; firstName: string; lastName: string; phone: string } }[];
}

interface MerchantContextValue {
  memberships: Membership[] | undefined;
  merchant: MerchantSpace | undefined;
  merchantId: string | null;
  select(id: string): void;
  reload(): Promise<void>;
  setMerchant(m: MerchantSpace): void;
  /** Responsable (propriétaire ou gérant) : peut modifier le menu, les horaires et le profil. */
  canManage: boolean;
  /** Préfixe des routes API du commerce choisi. */
  path(suffix?: string): string;
  call<T>(suffix: string, opts?: Pick<RequestOptions, 'method' | 'body'>): Promise<T>;
}

const Ctx = createContext<MerchantContextValue | null>(null);
const SELECTED_KEY = 'ac.merchant';

export function MerchantProvider({ children }: { children: ReactNode }) {
  const memberships = useApi<Membership[]>('/merchant/memberships');
  const [merchantId, setMerchantId] = useState<string | null>(null);

  useEffect(() => {
    const list = memberships.data;
    if (!list?.length) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SELECTED_KEY);
    } catch {
      /* rien */
    }
    setMerchantId((current) => (current && list.some((m) => m.id === current) ? current : list.find((m) => m.id === saved)?.id ?? list[0].id));
  }, [memberships.data]);

  const detail = useApi<MerchantSpace>(merchantId ? `/merchant/${merchantId}` : null, { refreshInterval: 120_000 });

  const select = useCallback((id: string) => {
    setMerchantId(id);
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* rien */
    }
  }, []);

  const path = useCallback((suffix = '') => `/merchant/${merchantId}${suffix ? `/${suffix}` : ''}`, [merchantId]);
  const call = useCallback(<T,>(suffix: string, opts: Pick<RequestOptions, 'method' | 'body'> = {}) => api<T>(path(suffix), opts), [path]);

  const merchant = detail.data && detail.data.id === merchantId ? detail.data : undefined;
  return (
    <Ctx.Provider
      value={{
        memberships: memberships.data,
        merchant,
        merchantId,
        select,
        reload: detail.reload,
        setMerchant: detail.mutate,
        canManage: merchant?.myRole === 'OWNER' || merchant?.myRole === 'MANAGER',
        path,
        call,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMerchant() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMerchant hors de MerchantProvider');
  return ctx;
}

export const MEMBER_ROLES: Record<string, string> = { OWNER: 'Propriétaire', MANAGER: 'Gérant', STAFF: 'Employé' };
export const MERCHANT_STATUS_LABELS: Record<string, { label: string; tone: 'amber' | 'green' | 'red' }> = {
  PENDING: { label: 'En attente de validation', tone: 'amber' },
  ACTIVE: { label: 'Actif', tone: 'green' },
  SUSPENDED: { label: 'Suspendu', tone: 'red' },
};
