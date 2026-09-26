'use client';

import { Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Map } from '@/components/map';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api';
import type { LatLng } from '@/lib/geo';
import type { City } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Zone {
  id: string;
  name: string;
  polygon: { type: 'Polygon'; coordinates: number[][][] };
  priority: number;
  isActive: boolean;
}

const toPoints = (z: Zone): LatLng[] => z.polygon.coordinates[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng }));

export default function ZonesPage() {
  const cities = useApi<City[]>('/admin/cities', { persist: false });
  const [cityId, setCityId] = useState('');
  const city = cities.data?.find((c) => c.id === (cityId || cities.data?.[0]?.id));
  const zones = useApi<Zone[]>(city ? `/admin/cities/${city.id}/zones` : null, { persist: false });
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [cityEdit, setCityEdit] = useState<{ serviceRadiusKm: string; isActive: boolean } | null>(null);
  const [newCity, setNewCity] = useState({ name: '', slug: '', centerLat: '', centerLng: '', serviceRadiusKm: '10' });

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'green', text: ok });
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Villes et zones" subtitle="Une adresse est desservie si elle est dans une zone active, ou à défaut dans le rayon de service de la ville." />
      <Select className="w-auto" value={city?.id ?? ''} onChange={(e) => { setCityId(e.target.value); setDraft([]); setCityEdit(null); }}>
        {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ' (inactive)'}</option>)}
      </Select>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {city && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Map
              key={city.id}
              center={{ lat: city.centerLat, lng: city.centerLng }}
              zoom={12}
              className="h-[55vh] w-full"
              onMapClick={(p) => setDraft((d) => [...d, p])}
              draftPolygon={draft}
              polygons={(zones.data ?? []).map((z) => ({ id: z.id, points: toPoints(z), label: z.name, color: z.isActive ? '#2F80ED' : '#94A3B8' }))}
            />
            <Card className="space-y-2">
              <p className="text-sm text-slate-600">
                <strong>Dessiner une zone :</strong> touchez la carte pour poser les coins de la zone ({draft.length} point{draft.length > 1 ? 's' : ''}), puis nommez-la.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input className="w-56" placeholder="Nom de la zone (ex. Ouaga 2000)" value={name} onChange={(e) => setName(e.target.value)} />
                <Button variant="outline" disabled={!draft.length} onClick={() => setDraft((d) => d.slice(0, -1))}>
                  <Undo2 className="h-4 w-4" /> Annuler le dernier point
                </Button>
                <Button
                  disabled={draft.length < 3 || name.trim().length < 2}
                  onClick={() =>
                    run(async () => {
                      const ring = [...draft, draft[0]].map((p) => [p.lng, p.lat]);
                      await api(`/admin/cities/${city.id}/zones`, { body: { name: name.trim(), polygon: { type: 'Polygon', coordinates: [ring] } } });
                      setDraft([]);
                      setName('');
                      await zones.reload();
                    }, 'Zone créée.')
                  }
                >
                  Enregistrer la zone
                </Button>
              </div>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <h2 className="mb-2 font-semibold text-brand">Zones de {city.name}</h2>
              {zones.data?.length === 0 && <p className="text-sm text-slate-500">Aucune zone : toute adresse dans un rayon de {city.serviceRadiusKm} km est desservie.</p>}
              <ul className="divide-y divide-slate-100">
                {zones.data?.map((z) => (
                  <li key={z.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      {z.name} <Badge tone={z.isActive ? 'green' : 'gray'}>{z.isActive ? 'active' : 'inactive'}</Badge>
                    </span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => run(async () => { await api(`/admin/zones/${z.id}`, { method: 'PATCH', body: { isActive: !z.isActive } }); await zones.reload(); }, 'Zone mise à jour.')}>
                        {z.isActive ? 'Désactiver' : 'Activer'}
                      </Button>
                      <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Supprimer ${z.name}`} onClick={() => run(async () => { await api(`/admin/zones/${z.id}`, { method: 'DELETE' }); await zones.reload(); }, 'Zone supprimée.')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="space-y-2">
              <h2 className="font-semibold text-brand">Réglages de la ville</h2>
              <Field label="Rayon de service (km)">
                <Input type="number" value={cityEdit?.serviceRadiusKm ?? String(city.serviceRadiusKm)} onChange={(e) => setCityEdit({ serviceRadiusKm: e.target.value, isActive: cityEdit?.isActive ?? city.isActive })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-brand" checked={cityEdit?.isActive ?? city.isActive} onChange={(e) => setCityEdit({ serviceRadiusKm: cityEdit?.serviceRadiusKm ?? String(city.serviceRadiusKm), isActive: e.target.checked })} />
                Ville ouverte aux commandes
              </label>
              <Button variant="secondary" disabled={!cityEdit} onClick={() => run(async () => { await api(`/admin/cities/${city.id}`, { method: 'PATCH', body: { serviceRadiusKm: Number(cityEdit!.serviceRadiusKm), isActive: cityEdit!.isActive } }); setCityEdit(null); await cities.reload(); }, 'Ville mise à jour.')}>
                Enregistrer
              </Button>
            </Card>
            <Card className="space-y-2">
              <h2 className="font-semibold text-brand">Ouvrir une nouvelle ville</h2>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Nom" value={newCity.name} onChange={(e) => setNewCity({ ...newCity, name: e.target.value, slug: e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} />
                <Input placeholder="Rayon (km)" type="number" value={newCity.serviceRadiusKm} onChange={(e) => setNewCity({ ...newCity, serviceRadiusKm: e.target.value })} />
                <Input placeholder="Latitude du centre" value={newCity.centerLat} onChange={(e) => setNewCity({ ...newCity, centerLat: e.target.value })} />
                <Input placeholder="Longitude du centre" value={newCity.centerLng} onChange={(e) => setNewCity({ ...newCity, centerLng: e.target.value })} />
              </div>
              <Button
                variant="outline"
                disabled={!newCity.name || !newCity.centerLat || !newCity.centerLng}
                onClick={() => run(async () => { await api('/admin/cities', { body: { ...newCity, centerLat: Number(newCity.centerLat), centerLng: Number(newCity.centerLng), serviceRadiusKm: Number(newCity.serviceRadiusKm) } }); await cities.reload(); }, 'Ville créée : ajoutez ses tarifs avant de l’annoncer.')}
              >
                Créer la ville
              </Button>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
