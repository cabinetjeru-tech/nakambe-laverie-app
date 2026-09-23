'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { get } from './api';
import { useAuth } from './auth';

export interface Salon {
  id: string;
  name: string;
  city: string;
  timezone: string;
  currency: string;
  status: string;
}

interface SalonState {
  salons: Salon[];
  salon: Salon | null;
  setSalonId: (id: string) => void;
  loading: boolean;
}

const SalonContext = createContext<SalonState | null>(null);
const STORAGE_KEY = 'salons.currentSalon';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Salon de travail courant (choisi par l'utilisateur parmi ceux de son périmètre). */
export function SalonProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const tenantId = me?.activeTenant?.tenantId;
  const { data = [], isLoading } = useQuery({
    queryKey: ['salons', tenantId],
    queryFn: () => get<Salon[]>('/salons'),
    enabled: Boolean(tenantId),
  });
  const [salonId, setSalonIdState] = useState<string | null>(null);

  useEffect(() => {
    if (data.length === 0) return;
    const stored = readStored();
    const candidate = [salonId, stored].find((id) => id && data.some((s) => s.id === id));
    if (!candidate) setSalonIdState(data[0].id);
    else if (candidate !== salonId) setSalonIdState(candidate);
  }, [data, salonId]);

  const value = useMemo<SalonState>(
    () => ({
      salons: data,
      salon: data.find((s) => s.id === salonId) ?? null,
      loading: isLoading,
      setSalonId: (id) => {
        setSalonIdState(id);
        try {
          window.localStorage.setItem(STORAGE_KEY, id);
        } catch {
          /* stockage indisponible : le choix vaut pour la session */
        }
      },
    }),
    [data, salonId, isLoading],
  );
  return <SalonContext.Provider value={value}>{children}</SalonContext.Provider>;
}

export function useSalon(): SalonState {
  const context = useContext(SalonContext);
  if (!context) throw new Error('useSalon hors de SalonProvider');
  return context;
}
