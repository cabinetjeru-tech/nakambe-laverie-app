'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDriver } from '@/lib/driver-runtime';
import { dateTime, fcfa, phoneDisplay } from '@/lib/format';
import type { WalletView } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Earnings {
  today: { earnings: number; deliveries: number };
  week: { earnings: number; deliveries: number };
  month: { earnings: number; deliveries: number };
  balance: number;
  cashDebt: number;
}

const PAYOUT_STATUS: Record<string, { label: string; tone: 'amber' | 'green' | 'red' }> = {
  PENDING: { label: 'En attente', tone: 'amber' },
  APPROVED: { label: 'Approuvé', tone: 'amber' },
  PAID: { label: 'Payé', tone: 'green' },
  REJECTED: { label: 'Refusé', tone: 'red' },
};

export default function EarningsPage() {
  const { user } = useAuth();
  const { profile } = useDriver();
  const earnings = useApi<Earnings>('/driver/earnings');
  const wallet = useApi<WalletView>('/driver/wallet');
  const payouts = useApi<{ id: string; amount: number; status: string; destinationPhone: string; reference: string | null; createdAt: string }[]>('/driver/payouts');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState(user?.phone.replace(/^\+226/, '').replace(/(\d{2})(?=\d)/g, '$1 ') ?? '');
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const balance = wallet.data?.balance ?? 0;
  const independent = profile?.employmentType === 'INDEPENDANT';

  return (
    <div className="space-y-4">
      <PageHeader title="Mes gains" />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Jour" value={fcfa(earnings.data?.today.earnings)} hint={`${earnings.data?.today.deliveries ?? 0} liv.`} />
        <Stat label="Semaine" value={fcfa(earnings.data?.week.earnings)} hint={`${earnings.data?.week.deliveries ?? 0} liv.`} />
        <Stat label="Mois" value={fcfa(earnings.data?.month.earnings)} hint={`${earnings.data?.month.deliveries ?? 0} liv.`} />
      </div>

      <Card className={clsx(balance < 0 ? 'bg-amber-50' : 'bg-green-50')}>
        {balance < 0 ? (
          <>
            <p className="text-sm text-amber-800">Espèces à reverser à Allô-Coursier</p>
            <p className="text-3xl font-extrabold text-amber-700">{fcfa(-balance)}</p>
            <p className="mt-1 text-xs text-amber-800">
              Part de la plateforme sur les courses payées en espèces. Versez-la à l’agence (plafond : {fcfa(profile?.cashDebtLimit)}).
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-green-800">Solde disponible</p>
            <p className="text-3xl font-extrabold text-brand-greenDark">{fcfa(balance)}</p>
            <p className="mt-1 text-xs text-green-800">Gains des courses payées par portefeuille ou Mobile Money.</p>
          </>
        )}
      </Card>

      {independent && balance > 0 && (
        <Card className="space-y-3">
          <h2 className="font-semibold text-brand">Demander un retrait</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Montant">
              <Input type="number" inputMode="numeric" value={amount} max={balance} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Mobile Money">
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>
          </div>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button
            loading={busy}
            disabled={!(Number(amount) > 0)}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              try {
                await api('/driver/payouts', { body: { amount: Number(amount), destinationPhone: phone } });
                setMessage({ tone: 'green', text: 'Demande envoyée. Vous serez notifié à l’envoi.' });
                setAmount('');
                void payouts.reload();
              } catch (err) {
                setMessage({ tone: 'red', text: (err as Error).message });
              } finally {
                setBusy(false);
              }
            }}
          >
            Envoyer la demande
          </Button>
        </Card>
      )}

      {!!payouts.data?.length && (
        <Card>
          <h2 className="mb-2 font-semibold text-brand">Retraits</h2>
          <ul className="divide-y divide-slate-100">
            {payouts.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {fcfa(p.amount)} <span className="text-xs text-slate-500">→ {phoneDisplay(p.destinationPhone)} · {dateTime(p.createdAt)}</span>
                </span>
                <Badge tone={PAYOUT_STATUS[p.status].tone}>{PAYOUT_STATUS[p.status].label}</Badge>
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
                <span className={clsx('shrink-0 font-semibold tabular-nums', e.amount > 0 ? 'text-brand-greenDark' : 'text-amber-700')}>
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
