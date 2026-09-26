'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/admin/table';
import { Alert, Button, Input, PageHeader, Pagination, Select, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, fcfa, PAYMENT_LABELS, PAYMENT_STATUS_LABELS, phoneDisplay } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface PaymentRow {
  id: string;
  purpose: string;
  provider: string;
  operator: string | null;
  amount: number;
  status: string;
  providerReference: string | null;
  payerPhone: string | null;
  failureReason: string | null;
  createdAt: string;
  order: { id: string; reference: string; status: string } | null;
  user: { firstName: string; lastName: string; phone: string } | null;
}

export default function PaymentsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const [provider, setProvider] = useState('MANUAL_MOBILE_MONEY');
  const [page, setPage] = useState(1);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const q = [status && `status=${status}`, provider && `provider=${provider}`, `page=${page}`, 'pageSize=25'].filter(Boolean).join('&');
  const { data, reload } = useApi<Paginated<PaymentRow>>(`/admin/payments?${q}`, { persist: false, refreshInterval: 30_000 });

  const act = async (p: PaymentRow, validate: boolean) => {
    setBusy(p.id);
    setMessage(null);
    try {
      if (validate) await api(`/admin/payments/${p.id}/validate`, { method: 'POST' });
      else await api(`/admin/payments/${p.id}/reject`, { body: { reason: reasons[p.id] } });
      setMessage({ tone: 'green', text: validate ? `Paiement ${p.providerReference} validé.` : `Paiement ${p.providerReference} refusé ; le client est prévenu.` });
      void reload();
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Paiements" subtitle="Vérifiez chaque référence sur le relevé Orange Money / Moov Money de l’entreprise avant de valider." />
      <div className="flex flex-wrap gap-2">
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tous les statuts</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select className="w-auto" value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }}>
          <option value="">Tous les moyens</option>
          {Object.entries(PAYMENT_LABELS).filter(([k]) => k !== 'MOCK').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <DataTable
        rows={data?.items}
        rowKey={(r) => r.id}
        empty="Aucun paiement à afficher"
        columns={[
          { header: 'Date', cell: (r) => dateTime(r.createdAt) },
          { header: 'Client', cell: (r) => (r.user ? <>{r.user.firstName} {r.user.lastName}<span className="block text-xs text-slate-500">{phoneDisplay(r.user.phone)}</span></> : '—') },
          { header: 'Objet', cell: (r) => (r.order ? <Link className="text-brand-light" href={`/admin/commandes/${r.order.id}`}>{r.order.reference}</Link> : r.purpose === 'WALLET_TOPUP' ? 'Rechargement' : '—') },
          { header: 'Montant', cell: (r) => <strong>{fcfa(r.amount)}</strong> },
          { header: 'Référence', cell: (r) => (<>{PAYMENT_LABELS[r.provider]} {r.operator && `(${r.operator === 'ORANGE' ? 'Orange' : 'Moov'})`}<span className="block font-mono text-xs">{r.providerReference ?? '—'}</span>{r.payerPhone && <span className="block text-xs text-slate-500">depuis {phoneDisplay(r.payerPhone)}</span>}</>) },
          { header: 'Statut', cell: (r) => (<><StatusBadge status={r.status} label={PAYMENT_STATUS_LABELS[r.status]} />{r.failureReason && <span className="block text-xs text-slate-500">{r.failureReason}</span>}</>) },
          {
            header: 'Action',
            cell: (r) =>
              can('payments.validate') && r.provider === 'MANUAL_MOBILE_MONEY' && (r.status === 'PENDING' || r.status === 'CANCELLED') ? (
                <div className="flex min-w-[220px] flex-col gap-1.5">
                  <Button size="sm" variant="success" loading={busy === r.id} onClick={() => act(r, true)}>
                    Argent reçu — valider
                  </Button>
                  {r.status === 'PENDING' && (
                    <div className="flex gap-1">
                      <Input className="py-1 text-xs" placeholder="Motif du refus" value={reasons[r.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} />
                      <Button size="sm" variant="outline" disabled={(reasons[r.id] ?? '').trim().length < 3} onClick={() => act(r, false)}>
                        Refuser
                      </Button>
                    </div>
                  )}
                </div>
              ) : null,
          },
        ]}
      />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}
