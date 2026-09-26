'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CityFilter, useCities } from '@/components/admin/city-filter';
import { DataTable } from '@/components/admin/table';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Badge, Button, Field, Input, PageHeader, Pagination, Select, Sheet, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateOnly, DRIVER_STATUS, phoneDisplay, VEHICLE_LABELS } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Row {
  userId: string;
  status: string;
  employmentType: string;
  vehicleType: string;
  plateNumber: string | null;
  isOnline: boolean;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  city: { name: string };
  user: { firstName: string; lastName: string; phone: string };
}

function DriversList() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAuth();
  const cities = useCities();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [cityId, setCityId] = useState('');
  const [employment, setEmployment] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', cityId: '', vehicleType: 'MOTO', employmentType: 'SALARIE', plateNumber: '' });
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = [status && `status=${status}`, cityId && `cityId=${cityId}`, employment && `employmentType=${employment}`, search.trim().length >= 2 && `search=${encodeURIComponent(search.trim())}`, `page=${page}`, 'pageSize=25'].filter(Boolean).join('&');
  const { data, reload } = useApi<Paginated<Row>>(`/admin/drivers?${q}`, { persist: false });

  return (
    <div className="space-y-4">
      <PageHeader title="Livreurs" subtitle={data ? `${data.total} livreur(s)` : undefined} action={can('drivers.manage') && can('drivers.validate') ? <Button onClick={() => setCreateOpen(true)}>Ajouter un livreur</Button> : undefined} />
      <div className="flex flex-wrap gap-2">
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tous les statuts</option>
          {Object.entries(DRIVER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select className="w-auto" value={employment} onChange={(e) => { setEmployment(e.target.value); setPage(1); }}>
          <option value="">Salariés et indépendants</option>
          <option value="SALARIE">Salariés</option>
          <option value="INDEPENDANT">Indépendants</option>
        </Select>
        <CityFilter value={cityId} onChange={(v) => { setCityId(v); setPage(1); }} />
        <Input className="w-56" placeholder="Nom ou téléphone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <DataTable
        rows={data?.items}
        rowKey={(r) => r.userId}
        onRowClick={(r) => router.push(`/admin/livreurs/${r.userId}`)}
        columns={[
          { header: 'Livreur', cell: (r) => (<><span className="font-semibold text-brand">{r.isOnline && '🟢 '}{r.user.firstName} {r.user.lastName}</span><span className="block text-xs text-slate-500">{phoneDisplay(r.user.phone)}</span></>) },
          { header: 'Statut', cell: (r) => <Badge tone={DRIVER_STATUS[r.status].tone}>{DRIVER_STATUS[r.status].label}</Badge> },
          { header: 'Type', cell: (r) => (r.employmentType === 'SALARIE' ? 'Salarié' : 'Indépendant') },
          { header: 'Véhicule', cell: (r) => `${VEHICLE_LABELS[r.vehicleType]}${r.plateNumber ? ` · ${r.plateNumber}` : ''}` },
          { header: 'Ville', cell: (r) => r.city.name },
          { header: 'Note', cell: (r) => (r.ratingCount ? `★ ${r.ratingAvg.toFixed(1)} (${r.ratingCount})` : '—') },
          { header: 'Inscrit le', cell: (r) => dateOnly(r.createdAt) },
        ]}
      />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}

      <Sheet open={createOpen} onClose={() => { setCreateOpen(false); setCreated(null); }} title="Ajouter un livreur">
        {created ? (
          <div className="space-y-3">
            <Alert tone="green">Livreur créé et validé. Code secret provisoire à lui communiquer : <strong className="text-lg tracking-widest">{created}</strong></Alert>
            <p className="text-sm text-slate-600">Il pourra le changer depuis son profil. Ce code ne sera plus affiché.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Prénom"><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Nom"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            </div>
            <Field label="Téléphone"><PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ville">
                <Select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                  <option value="">Choisir…</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Statut">
                <Select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                  <option value="SALARIE">Salarié</option>
                  <option value="INDEPENDANT">Indépendant</option>
                </Select>
              </Field>
              <Field label="Véhicule">
                <Select value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                  <option value="MOTO">Moto</option>
                  <option value="TRICYCLE">Tricycle</option>
                </Select>
              </Field>
              <Field label="Immatriculation"><Input value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value.toUpperCase() })} /></Field>
            </div>
            <Alert>{error}</Alert>
            <Button
              block
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const res = await api<{ temporaryPin: string }>('/admin/drivers', { body: { ...form, plateNumber: form.plateNumber || undefined } });
                  setCreated(res.temporaryPin);
                  void reload();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Créer le livreur
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DriversList />
    </Suspense>
  );
}
