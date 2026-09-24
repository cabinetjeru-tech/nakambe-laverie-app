'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Badge, Button, ErrorMessage, PageHeader, Select, Spinner, Table, Td } from '@/components/ui';
import { get, post, qs } from '@/lib/api';
import { CYCLE, SUBSCRIPTION_STATUS, TENANT_STATUS } from '@/lib/billing';
import { date, money } from '@/lib/format';

interface Subscriptions {
  counts: Record<string, number>;
  items: {
    id: string;
    status: string;
    cycle: string;
    unitPrice: number;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    pastDueSince: string | null;
    plan: { code: string; name: string };
    pendingPlan: { name: string } | null;
    tenant: { id: string; displayName: string; status: string; graceEndsAt: string | null };
  }[];
}

function SubscriptionsPage() {
  const initial = useSearchParams().get('status') ?? '';
  const [status, setStatus] = useState(initial);
  const [ending, setEnding] = useState('');
  const queryClient = useQueryClient();
  const subs = useQuery({
    queryKey: ['platform-subscriptions', status, ending],
    queryFn: () => get<Subscriptions>(`/platform/subscriptions${qs({ status, endingWithinDays: ending })}`),
    placeholderData: (previous) => previous,
  });
  const run = useMutation({
    mutationFn: () => post<{ processed: number; errors: number }>('/platform/billing/run'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-subscriptions'] }),
  });

  const counts = subs.data?.counts ?? {};
  return (
    <div>
      <PageHeader
        title="Abonnements"
        description="Renouvellements, impayés, résiliations. Le planificateur passe automatiquement ; le bouton sert au rattrapage."
        actions={
          <Button variant="secondary" loading={run.isPending} onClick={() => run.mutate()}>
            Lancer la facturation maintenant
          </Button>
        }
      />
      {run.data && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          {run.data.processed} abonnement(s) examiné(s), {run.data.errors} erreur(s).
        </p>
      )}
      <ErrorMessage error={run.error} />
      <div className="mb-4 flex flex-wrap gap-2">
        {[['', 'Tous'], ...Object.entries(SUBSCRIPTION_STATUS).map(([k, v]) => [k, v.label])].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={clsx('rounded-full border px-3 py-1 text-sm', status === value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50')}
          >
            {label}
            {value && counts[value] !== undefined && <span className="ml-1 tabular-nums text-stone-500">{counts[value]}</span>}
          </button>
        ))}
        <Select className="w-52" value={ending} onChange={(e) => setEnding(e.target.value)} aria-label="Échéance">
          <option value="">Toutes les échéances</option>
          <option value="7">Échéance sous 7 jours</option>
          <option value="30">Échéance sous 30 jours</option>
        </Select>
      </div>
      {subs.error && <ErrorMessage error={subs.error} />}
      {subs.isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Salon', 'Offre', 'Prix', 'Abonnement', 'Accès', 'Échéance', 'Remarque']} empty={subs.data?.items.length === 0}>
          {subs.data?.items.map((s) => (
            <tr key={s.id}>
              <Td>
                <Link href={`/plateforme/salons/${s.tenant.id}`} className="font-medium text-brand-700 hover:underline">
                  {s.tenant.displayName}
                </Link>
              </Td>
              <Td>
                {s.plan.name} · {CYCLE[s.cycle]}
              </Td>
              <Td className="tabular-nums">{money(s.unitPrice)}</Td>
              <Td>
                <Badge tone={SUBSCRIPTION_STATUS[s.status]?.tone}>{SUBSCRIPTION_STATUS[s.status]?.label}</Badge>
              </Td>
              <Td>
                <Badge tone={TENANT_STATUS[s.tenant.status]?.tone}>{TENANT_STATUS[s.tenant.status]?.label}</Badge>
              </Td>
              <Td>{date(s.currentPeriodEnd)}</Td>
              <Td className="text-xs text-stone-600">
                {s.cancelAtPeriodEnd && 'Résiliation programmée. '}
                {s.pendingPlan && `→ ${s.pendingPlan.name} au renouvellement. `}
                {s.tenant.status === 'PAST_DUE' && s.tenant.graceEndsAt && `Suspension le ${date(s.tenant.graceEndsAt)}.`}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export default function PlatformSubscriptionsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SubscriptionsPage />
    </Suspense>
  );
}
