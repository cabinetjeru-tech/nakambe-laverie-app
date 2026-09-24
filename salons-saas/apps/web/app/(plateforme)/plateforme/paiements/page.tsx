'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Empty, ErrorMessage, Field, Modal, PageHeader, Select, Spinner, Table, Td, Textarea } from '@/components/ui';
import { get, post, qs } from '@/lib/api';
import { INVOICE_STATUS, SAAS_PAYMENT_METHOD, SAAS_PAYMENT_STATUS } from '@/lib/billing';
import { date, dateTime, money } from '@/lib/format';

interface Payment {
  id: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  providerReference: string | null;
  operator: string | null;
  payerPhone: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  tenant: { id: string; displayName: string };
  invoice: { id: string; number: string; total: number; description: string; status: string };
}

interface Invoice {
  id: string;
  number: string;
  description: string;
  status: string;
  total: number;
  dueAt: string;
  paidAt: string | null;
  voidReason: string | null;
  tenant: { id: string; displayName: string };
}

type Tab = 'pending' | 'all' | 'invoices';

export default function PlatformPaymentsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  return (
    <div>
      <PageHeader title="Paiements" description="Transferts Mobile Money à vérifier, historique des paiements et factures." />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-stone-200">
        {(
          [
            ['pending', 'À valider'],
            ['all', 'Tous les paiements'],
            ['invoices', 'Factures'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === value ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-600 hover:text-stone-900')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'pending' && <PendingPayments />}
      {tab === 'all' && <AllPayments />}
      {tab === 'invoices' && <Invoices />}
    </div>
  );
}

function PendingPayments() {
  const queryClient = useQueryClient();
  const pending = useQuery({ queryKey: ['platform-payments', 'pending'], queryFn: () => get<Payment[]>('/platform/payments?status=PENDING&method=MOBILE_MONEY_MANUAL'), refetchInterval: 60_000 });
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform-payments'] });
  const validate = useMutation({ mutationFn: (id: string) => post(`/platform/payments/${id}/validate`), onSuccess: refresh });

  if (pending.isLoading) return <Spinner />;
  if (pending.error) return <ErrorMessage error={pending.error} />;
  if (pending.data?.length === 0) return <Empty title="Aucun paiement à vérifier">Les transferts Mobile Money déclarés par les salons apparaîtront ici.</Empty>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">Retrouvez chaque référence sur le relevé du compte Mobile Money avant de valider : la validation réactive le salon immédiatement.</p>
      <ErrorMessage error={validate.error} />
      <Table head={['Déclaré le', 'Salon', 'Facture', 'Montant', 'Référence', 'Opérateur · numéro', '']}>
        {pending.data?.map((p) => (
          <tr key={p.id}>
            <Td>{dateTime(p.createdAt)}</Td>
            <Td>
              <Link href={`/plateforme/salons/${p.tenant.id}`} className="font-medium text-brand-700 hover:underline">
                {p.tenant.displayName}
              </Link>
            </Td>
            <Td>{p.invoice.number}</Td>
            <Td className="tabular-nums font-medium">{money(p.amount, p.currency)}</Td>
            <Td className="font-mono text-xs">{p.providerReference}</Td>
            <Td>
              {p.operator ?? '—'}
              {p.payerPhone && <span className="block text-xs tabular-nums text-stone-500">{p.payerPhone}</span>}
            </Td>
            <Td className="text-right">
              <div className="flex justify-end gap-2">
                <Button size="sm" loading={validate.isPending && validate.variables === p.id} onClick={() => validate.mutate(p.id)}>
                  Valider
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setRejecting(p)}>
                  Rejeter
                </Button>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      {rejecting && <RejectModal payment={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); refresh(); }} />}
    </div>
  );
}

function RejectModal({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('Référence introuvable sur le relevé');
  const reject = useMutation({ mutationFn: () => post(`/platform/payments/${payment.id}/reject`, { reason }), onSuccess: onDone });
  return (
    <Modal
      open
      title={`Rejeter le paiement ${payment.providerReference}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate()}>
            Rejeter
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-stone-600">Le salon est notifié avec ce motif ; sa facture reste à régler.</p>
      <Field label="Motif">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      <ErrorMessage error={reject.error} />
    </Modal>
  );
}

function AllPayments() {
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [days, setDays] = useState('30');
  const payments = useQuery({
    queryKey: ['platform-payments', status, method, days],
    queryFn: () => get<Payment[]>(`/platform/payments${qs({ status, method, days })}`),
    placeholderData: (previous) => previous,
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {Object.entries(SAAS_PAYMENT_STATUS).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select className="w-48" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Moyen">
          <option value="">Tous les moyens</option>
          <option value="MOBILE_MONEY_MANUAL">Mobile Money manuel</option>
          <option value="ONLINE">En ligne</option>
        </Select>
        <Select className="w-44" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Période">
          <option value="7">7 derniers jours</option>
          <option value="30">30 derniers jours</option>
          <option value="365">12 derniers mois</option>
        </Select>
      </div>
      {payments.error && <ErrorMessage error={payments.error} />}
      {payments.isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Date', 'Salon', 'Facture', 'Moyen', 'Montant', 'Statut', 'Détail']} empty={payments.data?.length === 0}>
          {payments.data?.map((p) => (
            <tr key={p.id}>
              <Td>{dateTime(p.createdAt)}</Td>
              <Td>
                <Link href={`/plateforme/salons/${p.tenant.id}`} className="text-brand-700 hover:underline">
                  {p.tenant.displayName}
                </Link>
              </Td>
              <Td>{p.invoice.number}</Td>
              <Td>{SAAS_PAYMENT_METHOD[p.method] ?? p.method}</Td>
              <Td className="tabular-nums">{money(p.amount, p.currency)}</Td>
              <Td>
                <Badge tone={SAAS_PAYMENT_STATUS[p.status]?.tone}>{SAAS_PAYMENT_STATUS[p.status]?.label}</Badge>
              </Td>
              <Td className="max-w-xs truncate text-xs text-stone-500">{p.failureReason ?? p.providerReference ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function Invoices() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const invoices = useQuery({ queryKey: ['platform-invoices', status], queryFn: () => get<Invoice[]>(`/platform/invoices${qs({ status })}`) });
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [reason, setReason] = useState('');
  const voidInvoice = useMutation({
    mutationFn: () => post(`/platform/invoices/${voiding!.id}/void`, { reason }),
    onSuccess: () => {
      setVoiding(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['platform-invoices'] });
    },
  });
  return (
    <div className="space-y-3">
      <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut">
        <option value="">Toutes</option>
        {Object.entries(INVOICE_STATUS)
          .filter(([k]) => k !== 'DRAFT')
          .map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
      </Select>
      {invoices.isLoading ? (
        <Spinner />
      ) : (
        <Table head={['N°', 'Salon', 'Objet', 'Montant', 'Échéance', 'Statut', '']} empty={invoices.data?.length === 0}>
          {invoices.data?.map((i) => (
            <tr key={i.id}>
              <Td className="font-medium">{i.number}</Td>
              <Td>
                <Link href={`/plateforme/salons/${i.tenant.id}`} className="text-brand-700 hover:underline">
                  {i.tenant.displayName}
                </Link>
              </Td>
              <Td className="max-w-xs truncate">{i.description}</Td>
              <Td className="tabular-nums">{money(i.total)}</Td>
              <Td>{i.paidAt ? `Payée ${date(i.paidAt)}` : date(i.dueAt)}</Td>
              <Td>
                <Badge tone={INVOICE_STATUS[i.status]?.tone}>{INVOICE_STATUS[i.status]?.label}</Badge>
                {i.voidReason && <span className="block text-xs text-stone-500">{i.voidReason}</span>}
              </Td>
              <Td className="text-right">
                {i.status === 'OPEN' && (
                  <Button size="sm" variant="ghost" onClick={() => setVoiding(i)}>
                    Annuler
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {voiding && (
        <Modal
          open
          title={`Annuler la facture ${voiding.number}`}
          onClose={() => setVoiding(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setVoiding(null)}>
                Retour
              </Button>
              <Button variant="danger" loading={voidInvoice.isPending} disabled={reason.trim().length < 3} onClick={() => voidInvoice.mutate()}>
                Annuler la facture
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-stone-600">Geste commercial ou erreur : la facture n’est plus due. Les paiements en attente sont annulés.</p>
          <Field label="Motif">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <ErrorMessage error={voidInvoice.error} />
        </Modal>
      )}
    </div>
  );
}
