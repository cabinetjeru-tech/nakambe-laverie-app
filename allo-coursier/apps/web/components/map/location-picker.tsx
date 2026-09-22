'use client';

import { Crosshair, MapPin } from 'lucide-react';
import { useState } from 'react';
import { currentPosition, LatLng } from '@/lib/geo';
import { Button } from '../ui';
import { Map } from './index';

/**
 * Choix d'un point : on déplace la carte sous l'épingle centrale (plus précis au doigt qu'un clic),
 * ou on utilise la position GPS du téléphone.
 */
export function LocationPicker({ value, onChange, fallbackCenter, color = 'pickup' }: { value: LatLng | null; onChange: (p: LatLng) => void; fallbackCenter: LatLng; color?: 'pickup' | 'dropoff' }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [initial] = useState<LatLng>(value ?? fallbackCenter);
  const [target, setTarget] = useState<LatLng>(value ?? fallbackCenter);

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const pos = await currentPosition();
      setTarget(pos);
      onChange(pos);
      setRecenter(Date.now());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div>
      <div className="relative">
        <Map
          center={target}
          zoom={value ? 16 : 13}
          className="h-72 w-full"
          onCenterChange={(p) => onChange(p)}
          recenterToken={recenter}
          fit={value ? undefined : [initial]}
          keepZoomOnFit
        />
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <MapPin className={`-mt-8 h-10 w-10 drop-shadow-lg ${color === 'pickup' ? 'fill-brand-light text-white' : 'fill-brand-green text-white'}`} strokeWidth={1.5} />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Déplacez la carte pour placer l’épingle sur le lieu exact.</p>
        <Button type="button" size="sm" variant="secondary" onClick={locate} loading={locating}>
          <Crosshair className="h-4 w-4" /> Ma position
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
