'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, ErrorMessage, Input, PageHeader, Select, Spinner, Table, Td } from '@/components/ui';
import { get, qs } from '@/lib/api';
import { CYCLE, TENANT_STATUS } from '@/lib/billing';
import { date, money } from '@/lib/format';

interface TenantRow {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  createdAt: string;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  plan: { code: string; name: string };
  subscription: { status: string; cycle: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean } | null;
  amountDue: number;
  salonsCount: number;
  membersCount: number;
  owner: { fullName: string; phone: string } | null;
}

export default function PlatformTenantsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const tenants = useQuery({
    queryKey: ['platform-tenants', search, status, plan],
    queryFn: () => get<TenantRow[]>(`/platform/tenants${qs({ search: search.trim(), status, plan })}`),
    placeholderData: (previous) => previous,
  });

  return (
    <div>
      <PageHeader title="Salons" description="Toutes les entreprises inscrites sur la plateforme." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="w-full sm:w-72" type="search" placeholder="Nom, identifiant ou téléphone du propriétaire" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher" />
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {Object.entries(TENANT_STATUS).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select className="w-40" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Offre">
          <option value="">Toutes les offres</option>
          <option value="SOLO">Solo</option>
          <option value="SALON">Salon</option>
          <option value="MULTI">Multi-salons</option>
        </Select>
      </div>
      {tenants.error && <ErrorMessage error={tenants.error} />}
      {tenants.isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Salon', 'Propriétaire', 'Offre', 'Statut', 'Échéance', 'Dû', 'Salons · membres', 'Inscrit le']} empty={tenants.data?.length === 0}>
          {tenants.data?.map((t) => (
            <tr key={t.id} className="hover:bg-stone-50">
              <Td>
                <Link href={`/plateforme/salons/${t.id}`} className="font-medium text-brand-700 hover:underline">
                  {t.displayName}
                </Link>
                <span className="block text-xs text-stone-400">{t.slug}</span>
              </Td>
              <Td>
                {t.owner ? (
                  <>
                    {t.owner.fullName}
                    <span className="block text-xs tabular-nums text-stone-500">{t.owner.phone}</span>
                  </>
                ) : (
                  '—'
                )}
              </Td>
              <Td>
                {t.plan.name}
                {t.subscription && <span className="block text-xs text-stone-500">{CYCLE[t.subscription.cycle]}</span>}
              </Td>
              <Td>
                <Badge tone={TENANT_STATUS[t.status]?.tone}>{TENANT_STATUS[t.status]?.label}</Badge>
                {t.subscription?.cancelAtPeriodEnd && <span className="block text-xs text-amber-700">Résiliation programmée</span>}
              </Td>
              <Td>{t.status === 'PAST_DUE' && t.graceEndsAt ? `Grâce → ${date(t.graceEndsAt)}` : t.subscription ? date(t.subscription.currentPeriodEnd) : '—'}</Td>
              <Td className="tabular-nums">{Number(t.amountDue) > 0 ? money(t.amountDue) : '—'}</Td>
              <Td className="tabular-nums">
                {t.salonsCount} · {t.membersCount}
              </Td>
              <Td>{date(t.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
