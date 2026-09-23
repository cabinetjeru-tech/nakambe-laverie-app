'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, fcfa, PAYMENT_STATUS_LABELS, phoneDisplay } from '@/lib/format';
import type { WalletView } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Payment {
  id: string;
  purpose: string;
  amount: number;
  status: string;
  providerReference: string | null;
  failureReason: string | null;
  createdAt: string;
}

export default function WalletPage() {
  const wallet = useApi<WalletView>('/wallet');
  const payments = useApi<Payment[]>('/payments/mine');
  const methods = useApi<{ code: string; enabled: boolean; accounts?: { operator: string; number: string }[] }[]>('/payments/methods');
  const mm = methods.data?.find((m) => m.code === 'MANUAL_MOBILE_MONEY');
  const [amount, setAmount] = useState('5000');
  const [operator, setOperator] = useState<'ORANGE' | 'MOOV'>('ORANGE');
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const topups = payments.data?.filter((p) => p.purpose === 'WALLET_TOPUP') ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Mon portefeuille" />
      <div className="rounded-3xl bg-gradient-to-br from-brand to-[#1C4F9C] p-5 text-white shadow-card">
        <p className="text-sm text-blue-200">Solde disponible</p>
        <p className="mt-1 text-3xl font-extrabold">{fcfa(wallet.data?.balance)}</p>
        <p className="mt-2 text-xs text-blue-200">Payez vos livraisons en un clic. Les remboursements y sont crédités automatiquement.</p>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold text-brand">Recharger par Mobile Money</h2>
        {!mm?.enabled ? (
          <p className="text-sm text-slate-500">Le rechargement par Mobile Money sera bientôt disponible.</p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              1. Envoyez le montant au {mm.accounts?.map((a) => `${a.operator === 'ORANGE' ? 'Orange Money' : 'Moov Money'} ${phoneDisplay(a.number)}`).join(' ou ')}.
              <br />
              2. Saisissez la référence reçue par SMS. Votre solde est crédité après vérification.
            </p>
            <div className="flex gap-2">
              {['2000', '5000', '10000', '20000'].map((v) => (
                <button key={v} onClick={() => setAmount(v)} className={clsx('rounded-full px-3 py-1 text-sm font-medium', amount === v ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600')}>
                  {Number(v).toLocaleString('fr-FR')}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Montant (FCFA)">
                <Input type="number" inputMode="numeric" min={500} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Opérateur">
                <Select value={operator} onChange={(e) => setOperator(e.target.value as 'ORANGE' | 'MOOV')}>
                  <option value="ORANGE">Orange Money</option>
                  <option value="MOOV">Moov Money</option>
                </Select>
              </Field>
            </div>
            <Field label="Référence de la transaction">
              <Input value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Numéro qui a payé">
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>
            {message && <Alert tone={message.tone}>{message.text}</Alert>}
            <Button
              loading={busy}
              disabled={!(Number(amount) >= 500) || reference.trim().length < 4 || phone.replace(/\D/g, '').length !== 8}
              onClick={async () => {
                setBusy(true);
                setMessage(null);
                try {
                  await api('/wallet/topups', { body: { amount: Number(amount), operator, reference: reference.trim(), payerPhone: phone } });
                  setMessage({ tone: 'green', text: 'Merci ! Votre rechargement est en cours de vérification.' });
                  setReference('');
                  void payments.reload();
                } catch (err) {
                  setMessage({ tone: 'red', text: (err as Error).message });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Envoyer la référence
            </Button>
          </>
        )}
      </Card>

      {topups.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold text-brand">Rechargements</h2>
          <ul className="divide-y divide-slate-100">
            {topups.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {fcfa(p.amount)} <span className="text-xs text-slate-500">· réf. {p.providerReference} · {dateTime(p.createdAt)}</span>
                  {p.failureReason && <span className="block text-xs text-red-600">{p.failureReason}</span>}
                </span>
                <StatusBadge status={p.status} label={PAYMENT_STATUS_LABELS[p.status]} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold text-brand">Mouvements</h2>
        {wallet.data?.entries.length ? (
          <ul className="divide-y divide-slate-100">
            {wallet.data.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-slate-700">{e.transaction.description}</span>
                  <span className="text-xs text-slate-400">{dateTime(e.createdAt)}</span>
                </span>
                <span className={clsx('shrink-0 font-semibold tabular-nums', e.amount > 0 ? 'text-brand-greenDark' : 'text-slate-700')}>
                  {e.amount > 0 ? '+' : ''}
                  {fcfa(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucun mouvement" />
        )}
      </Card>
    </div>
  );
}
