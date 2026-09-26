'use client';

import { useState } from 'react';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Badge, Button, Card, Field, Input, Spinner, Stat } from '@/components/ui';
import { dateTime, fcfa, phoneDisplay, statusTone } from '@/lib/format';
import { useMerchant } from '@/lib/merchant';
import type { WalletView } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Period {
  orders: number;
  sales: number;
  earnings: number;
}

interface MerchantStats {
  today: Period;
  week: Period;
  month: Period;
  cancelledLast30Days: number;
  topProducts: { label: string; quantity: number }[];
  balance: number;
}

interface MerchantWallet extends WalletView {
  payouts: { id: string; amount: number; status: string; destinationPhone: string; reference: string | null; createdAt: string; processedAt: string | null }[];
}

const plural = (n: number) => `${n} commande${n > 1 ? 's' : ''}`;
const PAYOUT_STATUS: Record<string, string> = { PENDING: 'En attente', APPROVED: 'Approuvé', PAID: 'Envoyé', REJECTED: 'Refusé' };

function Payouts() {
  const { path, call, merchant } = useMerchant();
  const wallet = useApi<MerchantWallet>(path('wallet'), { persist: false });
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState(merchant?.phone.replace(/^\+226/, '').replace(/(\d{2})(?=\d)/g, '$1 ') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!wallet.data) return <Spinner />;
  const w = wallet.data;
  const pending = w.payouts.some((p) => p.status === 'PENDING' || p.status === 'APPROVED');

  return (
    <>
      {merchant?.myRole === 'OWNER' && (
        <Card className="space-y-3">
          <h2 className="font-semibold text-brand">Demander un reversement</h2>
          <p className="text-sm text-slate-600">L’équipe Allô-Coursier envoie la somme sur votre Mobile Money, en général sous 24 h ouvrées.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant (FCFA)">
              <Input type="number" inputMode="numeric" min={1} max={Math.max(0, w.balance)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Numéro Mobile Money">
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>
          </div>
          <Alert>{error}</Alert>
          {sent && <Alert tone="green">Demande envoyée : vous serez notifié dès l’envoi.</Alert>}
          <Button
            block
            loading={busy}
            disabled={pending || !(Number(amount) > 0) || w.balance <= 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await call('payouts', { body: { amount: Math.round(Number(amount)), destinationPhone: phone } });
                setAmount('');
                setSent(true);
                await wallet.reload();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {pending ? 'Une demande est déjà en cours' : 'Demander le reversement'}
          </Button>
        </Card>
      )}

      {w.payouts.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold text-brand">Reversements</h2>
          <div className="divide-y divide-slate-100 text-sm">
            {w.payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-semibold">{fcfa(p.amount)}</span> → {phoneDisplay(p.destinationPhone)}
                  <span className="block text-xs text-slate-500">
                    {dateTime(p.createdAt)}
                    {p.status === 'PAID' && p.reference && ` · réf. ${p.reference}`}
                    {p.status === 'REJECTED' && p.reference && ` · ${p.reference}`}
                  </span>
                </span>
                <Badge tone={statusTone(p.status)}>{PAYOUT_STATUS[p.status] ?? p.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold text-brand">Mouvements</h2>
        {w.entries.length === 0 && <p className="text-sm text-slate-500">Aucun mouvement pour le moment.</p>}
        <div className="divide-y divide-slate-100 text-sm">
          {w.entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{e.transaction.description}</span>
                <span className="text-xs text-slate-500">{dateTime(e.createdAt)}</span>
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${e.amount >= 0 ? 'text-brand-greenDark' : 'text-red-600'}`}>
                {e.amount >= 0 ? '+' : ''}
                {fcfa(e.amount)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

export default function MerchantFinancesPage() {
  const { path, canManage, merchant } = useMerchant();
  const stats = useApi<MerchantStats>(path('stats'), { refreshInterval: 120_000 });

  if (!stats.data) return <Spinner />;
  const s = stats.data;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">Ventes</h1>
      <div className="rounded-2xl bg-gradient-to-r from-brand to-[#1C4F9C] p-4 text-white shadow-card">
        <p className="text-xs text-blue-200">Solde à recevoir d’Allô-Coursier</p>
        <p className="text-2xl font-bold">{fcfa(s.balance)}</p>
        <p className="mt-1 text-xs text-blue-200">Crédité à chaque livraison : prix des articles − commission ({merchant?.commissionPercent} %).</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Aujourd’hui" value={fcfa(s.today.earnings)} hint={plural(s.today.orders)} tone="green" />
        <Stat label="7 jours" value={fcfa(s.week.earnings)} hint={plural(s.week.orders)} />
        <Stat label="30 jours" value={fcfa(s.month.earnings)} hint={plural(s.month.orders)} />
      </div>
      <Card className="space-y-2">
        <h2 className="font-semibold text-brand">Sur 30 jours</h2>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Ventes (prix des articles)</span>
          <span className="font-semibold">{fcfa(s.month.sales)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Commandes annulées ou refusées</span>
          <span className="font-semibold">{s.cancelledLast30Days}</span>
        </div>
        {s.topProducts.length > 0 && (
          <div className="border-t border-slate-100 pt-2">
            <p className="mb-1 text-sm font-medium text-slate-700">Les plus vendus</p>
            {s.topProducts.map((p, i) => (
              <div key={p.label} className="flex justify-between text-sm text-slate-600">
                <span>
                  {i + 1}. {p.label}
                </span>
                <span className="tabular-nums">{p.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      {canManage ? <Payouts /> : <p className="text-center text-sm text-slate-500">Le détail des reversements est réservé au responsable.</p>}
    </div>
  );
}
