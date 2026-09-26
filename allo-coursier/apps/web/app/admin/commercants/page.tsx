'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CityFilter, useCities } from '@/components/admin/city-filter';
import { DataTable } from '@/components/admin/table';
import { LocationPicker } from '@/components/map/location-picker';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Badge, Button, Field, FieldGroup, Input, PageHeader, Pagination, Select, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { MERCHANT_TYPES } from '@/lib/cart';
import { dateOnly, phoneDisplay } from '@/lib/format';
import { CITY_CENTERS, LatLng } from '@/lib/geo';
import { MERCHANT_STATUS_LABELS } from '@/lib/merchant';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Row {
  id: string;
  name: string;
  type: string;
  status: string;
  phone: string;
  commissionPercent: number | null;
  createdAt: string;
  city: { name: string };
  _count: { orders: number; products: number };
}

const emptyForm = { name: '', type: 'RESTAURANT', phone: '', cityId: '', landmark: '', ownerPhone: '', ownerFirstName: '', ownerLastName: '' };

export default function AdminMerchantsPage() {
  const router = useRouter();
  const cities = useCities();
  const [status, setStatus] = useState('');
  const [cityId, setCityId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [created, setCreated] = useState<{ id: string; pin?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = [status && `status=${status}`, cityId && `cityId=${cityId}`, search.trim().length >= 2 && `search=${encodeURIComponent(search.trim())}`, `page=${page}`, 'pageSize=25'].filter(Boolean).join('&');
  const { data, reload } = useApi<Paginated<Row>>(`/admin/merchants?${q}`, { persist: false });
  const formCity = cities.find((c) => c.id === form.cityId);

  const create = async () => {
    if (!form.cityId) return setError('Choisissez la ville.');
    if (!point) return setError('Placez le commerce sur la carte.');
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ merchant: { id: string }; temporaryPin?: string }>('/admin/merchants', {
        body: {
          business: { name: form.name.trim(), type: form.type, phone: form.phone, cityId: form.cityId, lat: point.lat, lng: point.lng, landmark: form.landmark.trim() || undefined },
          ownerPhone: form.ownerPhone,
          ownerFirstName: form.ownerFirstName.trim() || undefined,
          ownerLastName: form.ownerLastName.trim() || undefined,
        },
      });
      setCreated({ id: res.merchant.id, pin: res.temporaryPin });
      setForm(emptyForm);
      setPoint(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Commerçants" subtitle={data ? `${data.total} commerce(s)` : undefined} action={<Button onClick={() => setCreateOpen(true)}>Ajouter un commerce</Button>} />
      <div className="flex flex-wrap gap-2">
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tous les statuts</option>
          {Object.entries(MERCHANT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <CityFilter value={cityId} onChange={(v) => { setCityId(v); setPage(1); }} />
        <Input className="w-56" placeholder="Nom ou téléphone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <DataTable
        rows={data?.items}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/commercants/${r.id}`)}
        columns={[
          { header: 'Commerce', cell: (r) => (<><span className="font-semibold text-brand">{r.name}</span><span className="block text-xs text-slate-500">{MERCHANT_TYPES[r.type]} · {phoneDisplay(r.phone)}</span></>) },
          { header: 'Statut', cell: (r) => <Badge tone={MERCHANT_STATUS_LABELS[r.status].tone}>{MERCHANT_STATUS_LABELS[r.status].label}</Badge> },
          { header: 'Ville', cell: (r) => r.city.name },
          { header: 'Produits', cell: (r) => r._count.products },
          { header: 'Commandes', cell: (r) => r._count.orders },
          { header: 'Commission', cell: (r) => (r.commissionPercent == null ? 'Par défaut' : `${r.commissionPercent} %`) },
          { header: 'Inscrit le', cell: (r) => dateOnly(r.createdAt) },
        ]}
      />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}

      <Sheet open={createOpen} onClose={() => { setCreateOpen(false); setCreated(null); setError(null); }} title="Ajouter un commerce">
        {created ? (
          <div className="space-y-3">
            <Alert tone="green">
              Commerce créé et activé.
              {created.pin && (
                <>
                  {' '}Code secret provisoire du responsable : <strong className="text-lg tracking-widest">{created.pin}</strong> (il ne sera plus affiché).
                </>
              )}
            </Alert>
            <Button block onClick={() => router.push(`/admin/commercants/${created.id}`)}>Ouvrir la fiche</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Nom du commerce"><Input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(MERCHANT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Ville">
                <Select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                  <option value="">Choisir…</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Téléphone du commerce"><PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></Field>
            {form.cityId && (
              <FieldGroup label="Emplacement">
                <LocationPicker key={form.cityId} value={point} onChange={setPoint} fallbackCenter={formCity ? { lat: formCity.centerLat, lng: formCity.centerLng } : CITY_CENTERS.ouagadougou} color="pickup" />
              </FieldGroup>
            )}
            <Field label="Repère"><Input value={form.landmark} maxLength={200} onChange={(e) => setForm({ ...form, landmark: e.target.value })} /></Field>
            <p className="pt-2 text-sm font-semibold text-brand">Responsable</p>
            <Field label="Téléphone" hint="Un compte est créé s’il n’existe pas."><PhoneInput value={form.ownerPhone} onChange={(v) => setForm({ ...form, ownerPhone: v })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Prénom"><Input value={form.ownerFirstName} onChange={(e) => setForm({ ...form, ownerFirstName: e.target.value })} /></Field>
              <Field label="Nom"><Input value={form.ownerLastName} onChange={(e) => setForm({ ...form, ownerLastName: e.target.value })} /></Field>
            </div>
            <Alert>{error}</Alert>
            <Button block loading={busy} onClick={create}>Créer le commerce</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
