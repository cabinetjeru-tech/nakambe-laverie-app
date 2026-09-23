'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Td } from '@/components/ui';
import { del, get, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, money, PAYMENT_METHOD, shiftDate, todayIn } from '@/lib/format';
import { useSalon } from '@/lib/salon';

interface Expense {
  id: string;
  label: string;
  amount: number;
  paymentMethod: string;
  reference: string | null;
  spentAt: string;
  category: { name: string };
}

export default function ExpensesPage() {
  const { salon } = useSalon();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const today = salon ? todayIn(salon.timezone) : '';
  // Par défaut : les 30 derniers jours (calculés dès que le salon est connu).
  const [fromInput, setFrom] = useState('');
  const [toInput, setTo] = useState('');
  const from = fromInput || (today ? shiftDate(today, -30) : '');
  const to = toInput || today;
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['expenses', salon?.id, from, to],
    queryFn: () => get<Expense[]>(`/expenses${qs({ salonId: salon!.id, from, to })}`),
    enabled: Boolean(salon && from && to),
  });
  const remove = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => del(`/expenses/${id}`, { reason }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const total = data.reduce((t, e) => t + e.amount, 0);

  if (!salon) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Dépenses"
        description={can('expenses.manage') ? 'Toutes les dépenses du salon' : 'Les dépenses que vous avez saisies'}
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nouvelle dépense</Button>}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Du">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="Au">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <div className="min-w-[180px]"><Stat label="Total de la période" value={money(total)} /></div>
      </div>
      <ErrorMessage error={error ?? remove.error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Date', 'Libellé', 'Catégorie', 'Paiement', 'Montant', '']} empty={data.length === 0}>
          {data.map((e) => (
            <tr key={e.id}>
              <Td>{date(e.spentAt, 'UTC')}</Td>
              <Td className="max-w-xs truncate">{e.label}</Td>
              <Td>{e.category.name}</Td>
              <Td>{PAYMENT_METHOD[e.paymentMethod] ?? e.paymentMethod}{e.reference ? ` · ${e.reference}` : ''}</Td>
              <Td className="text-right tabular-nums">{money(e.amount)}</Td>
              <Td>
                {can('expenses.manage') && (
                  <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Motif de la suppression ?'); if (reason && reason.trim().length >= 3) remove.mutate({ id: e.id, reason }); }}>
                    Supprimer
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {creating && <CreateExpense today={today} onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateExpense({ today, onClose }: { today: string; onClose: () => void }) {
  const { salon } = useSalon();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: () => get<{ id: string; name: string }[]>('/expense-categories') });
  const [form, setForm] = useState({ categoryId: '', label: '', amount: 0, paymentMethod: 'CASH', spentAt: today, reference: '' });
  const save = useMutation({
    mutationFn: () => post('/expenses', { ...form, salonId: salon!.id, reference: form.reference || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      onClose();
    },
  });
  return (
    <Modal open title="Nouvelle dépense" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={save.isPending} disabled={!form.categoryId || form.amount <= 0} onClick={() => save.mutate()}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <Field label="Catégorie">
          {(id) => (
            <Select id={id} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Choisir…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Libellé">{(id) => <Input id={id} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Facture d’électricité de mars" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant">{(id) => <Input id={id} type="number" min={1} step={25} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />}</Field>
          <Field label="Date">{(id) => <Input id={id} type="date" max={today} value={form.spentAt} onChange={(e) => setForm({ ...form, spentAt: e.target.value })} />}</Field>
          <Field label="Payée par" hint={form.paymentMethod === 'CASH' ? 'Sort de la caisse ouverte' : undefined}>
            {(id) => (
              <Select id={id} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="CASH">Espèces (caisse)</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="BANK_TRANSFER">Virement</option>
                <option value="CHEQUE">Chèque</option>
                <option value="OTHER">Autre (poche du propriétaire…)</option>
              </Select>
            )}
          </Field>
          <Field label="Référence / n° de pièce">{(id) => <Input id={id} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />}</Field>
        </div>
        <ErrorMessage error={save.error} />
      </div>
    </Modal>
  );
}
