'use client';

import clsx from 'clsx';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '@/components/admin/table';
import { Alert, Button, Card, Field, Input, PageHeader, Pagination, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, fcfa } from '@/lib/format';
import { useApi } from '@/lib/use-api';

interface Entries {
  wallet: { id: string; kind: string; balance: number; user: { firstName: string; lastName: string; phone: string } | null };
  items: { id: string; amount: number; balanceAfter: number; createdAt: string; transaction: { type: string; description: string; orderId: string | null } }[];
  total: number;
  page: number;
  pageSize: number;
}

export default function WalletEntriesPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const { data, reload } = useApi<Entries>(`/admin/wallets/${id}/entries?page=${page}&pageSize=50`, { persist: false });
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  if (!data) return <Spinner />;
  const system = data.wallet.kind === 'PLATFORM_REVENUE' || data.wallet.kind === 'CASH_CLEARING';
  return (
    <div className="space-y-4">
      <PageHeader back="/admin/finances" title={data.wallet.user ? `${data.wallet.user.firstName} ${data.wallet.user.lastName}` : 'Compte système'} subtitle={`Solde : ${fcfa(data.wallet.balance)}`} />
      {!system && can('wallets.manage') && can('payments.validate') && (
        <Card className="space-y-2">
          <h2 className="font-semibold text-brand">Correction exceptionnelle</h2>
          <p className="text-xs text-slate-500">Geste commercial ou erreur : montant positif = crédit, négatif = débit. Tracé dans le journal d’audit.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Montant"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Motif" className="sm:col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </div>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button
            variant="secondary"
            disabled={!Number(amount) || reason.trim().length < 5}
            onClick={async () => {
              try {
                await api(`/admin/wallets/${id}/adjust`, { body: { amount: Number(amount), reason } });
                setMessage({ tone: 'green', text: 'Correction enregistrée.' });
                setAmount('');
                setReason('');
                void reload();
              } catch (err) {
                setMessage({ tone: 'red', text: (err as Error).message });
              }
            }}
          >
            Enregistrer la correction
          </Button>
        </Card>
      )}
      <DataTable
        rows={data.items}
        rowKey={(r) => r.id}
        empty="Aucun mouvement"
        columns={[
          { header: 'Date', cell: (r) => dateTime(r.createdAt) },
          { header: 'Opération', cell: (r) => r.transaction.description },
          { header: 'Montant', cell: (r) => <span className={clsx('font-semibold tabular-nums', r.amount > 0 ? 'text-brand-greenDark' : 'text-slate-700')}>{r.amount > 0 ? '+' : ''}{fcfa(r.amount)}</span>, className: 'text-right' },
          { header: 'Solde après', cell: (r) => fcfa(r.balanceAfter), className: 'text-right' },
        ]}
      />
      <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
    </div>
  );
}
