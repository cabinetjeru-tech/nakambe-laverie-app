'use client';

import dynamic from 'next/dynamic';
import type { LeafletMapProps } from './leaflet-map';

/** Carte chargée uniquement dans le navigateur, et seulement quand elle est affichée (économie de data). */
export const Map = dynamic<LeafletMapProps>(() => import('./leaflet-map'), {
  ssr: false,
  loading: () => <div className="flex h-64 w-full animate-pulse items-center justify-center rounded-2xl bg-slate-200 text-sm text-slate-500">Chargement de la carte…</div>,
});

export type { MapMarker, MarkerKind } from './leaflet-map';
