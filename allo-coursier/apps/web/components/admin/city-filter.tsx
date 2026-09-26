'use client';

import type { City } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { Select } from '../ui';

export function useCities() {
  return useApi<City[]>('/cities').data ?? [];
}

export function CityFilter({ value, onChange, allLabel = 'Toutes les villes' }: { value: string; onChange: (v: string) => void; allLabel?: string }) {
  const cities = useCities();
  return (
    <Select className="w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {cities.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </Select>
  );
}
