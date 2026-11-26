'use client';
import { ArrowLeft, Ban, FileDown, Printer, Receipt, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@dread-royal/shared';
import { PayModal, PaymentMethodSelect } from '@/components/pickers';
import { Badge, Button, Card, ErrorBox, Field, Modal, MoneyInput, PageHeader, Spinner, Table, Textarea, useUi } from '@/components/ui';
import { openFile, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, formatFCFA } from '@/lib/format';
import { useApi, useQueryParam } from '@/lib/hooks';
import { payTone } from '@/lib/tones';

export default function SaleDetail() {
  const id = useQueryParam('id');
  const { can } = useAuth();
  const { toast } = useUi();
  const { data: s, error, loading, reload } = useApi<any>(id ? `/sales/${id}` : null);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !s) return <Spinner />;
  const cancelled = s.status === 'CANCELLED';
  const pdf = (kind: string, download = false) => openFile(`/sales/${s.id}/${kind}.pdf${download ? '?download=1' : ''}`).catch((e) => toast('error', e.message));
  return (
    <>
      <Link href="/ventes/" className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"><ArrowLeft className="h-4 w-4" />Ventes</Link>
      <PageHeader title={`Facture ${s.number}`} subtitle={<>{fmtDateTime(s.saleDate)} · caissier : {s.cashierName} {s.appointment && <>· RDV {s.appointment.code}</>}</>}
        actions={<>
          <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => pdf('invoice')}>Facture A4</Button>
          <Button variant="outline" icon={<Receipt className="h-4 w-4" />} onClick={() => pdf('ticket')}>Ticket 80 mm</Button>
          <Button variant="outline" icon={<FileDown className="h-4 w-4" />} onClick={() => pdf('invoice', true)}>PDF</Button>
          {!cancelled && s.balance > 0 && can('payments.create') && <Button icon={<Wallet className="h-4 w-4" />} onClick={() => setPaying(true)}>Encaisser</Button>}
          {!cancelled && can('sales.cancel') && <Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelling(true)}>Annuler / rembourser</Button>}
        </>} />
      {cancelled && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><b>Vente annulée</b> le {fmtDateTime(s.cancelledAt)} — motif : {s.cancelReason}. Remboursé : {formatFCFA(s.refundedAmount)}. La vente reste conservée pour la traçabilité.</div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Détail" className="lg:col-span-2">
          <Table rows={s.items} columns={[
            { key: 'label', label: 'Désignation', render: (i: any) => <><b>{i.label}</b><p className="text-xs text-neutral-500">{{ SERVICE: 'Prestation', PRODUCT: 'Produit', PACKAGE: 'Forfait' }[i.type as string]}</p></> },
            { key: 'staff', label: 'Coiffeur', render: (i: any) => i.staff ? `${i.staff.firstName} ${i.staff.lastName}` : '' },
            { key: 'quantity', label: 'Qté', align: 'right' },
            { key: 'unitPrice', label: 'P.U.', align: 'right', render: (i: any) => formatFCFA(i.unitPrice, false) },
            { key: 'lineDiscount', label: 'Remise', align: 'right', render: (i: any) => i.lineDiscount ? formatFCFA(i.lineDiscount, false) : '' },
            { key: 'total', label: 'Total', align: 'right', render: (i: any) => <b>{formatFCFA(i.total)}</b> },
          ]} />
          <dl className="ml-auto mt-4 max-w-sm space-y-1 text-sm">
            <div className="flex justify-between"><dt>Sous-total</dt><dd>{formatFCFA(s.subtotal)}</dd></div>
            {s.discount > 0 && <div className="flex justify-between"><dt>Remise <span className="text-xs text-neutral-500">({s.discountReason})</span></dt><dd>− {formatFCFA(s.discount)}</dd></div>}
            {s.loyaltyDiscount > 0 && <div className="flex justify-between"><dt>Fidélité ({s.loyaltyPointsUsed} pts)</dt><dd>− {formatFCFA(s.loyaltyDiscount)}</dd></div>}
            <div className="flex justify-between border-t pt-1 text-base font-bold"><dt>TOTAL</dt><dd>{formatFCFA(s.total)}</dd></div>
            <div className="flex justify-between"><dt>Payé</dt><dd>{formatFCFA(s.paidAmount)}</dd></div>
            {s.refundedAmount > 0 && <div className="flex justify-between text-red-700"><dt>Remboursé</dt><dd>− {formatFCFA(s.refundedAmount)}</dd></div>}
            {!cancelled && <div className="flex justify-between text-base font-bold"><dt>Reste à payer</dt><dd className={s.balance > 0 ? 'text-amber-700' : 'text-emerald-700'}>{formatFCFA(s.balance)}</dd></div>}
          </dl>
        </Card>
        <div className="space-y-5">
          <Card title="Client">
            {s.client ? <Link href={`/clients/fiche/?id=${s.client.id}`} className="block text-sm hover:underline"><b>{s.client.firstName} {s.client.lastName}</b><br /><span className="text-xs text-neutral-500">{s.client.code} · {s.client.phone} · {s.client.loyaltyPoints} pts</span></Link> : <p className="text-sm text-neutral-500">Client de passage</p>}
            <div className="mt-3">{cancelled ? <Badge tone="red">Annulée</Badge> : <Badge tone={payTone[s.paymentStatus]}>{PAYMENT_STATUS_LABELS[s.paymentStatus]}</Badge>}</div>
            {s.notes && <p className="mt-2 text-xs text-neutral-600">{s.notes}</p>}
          </Card>
          <Card title="Règlements">
            {s.payments.length === 0 ? <p className="text-sm text-neutral-500">Aucun règlement.</p> : (
              <ul className="divide-y text-sm">
                {s.payments.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <div><p className="font-mono text-xs">{p.number}</p><p className="text-xs text-neutral-500">{fmtDateTime(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method]}{p.reference ? ` · ${p.reference}` : ''}</p></div>
                    <div className="text-right"><Badge tone={p.kind === 'REFUND' ? 'red' : p.kind === 'DEPOSIT' ? 'blue' : 'green'}>{PAYMENT_KIND_LABELS[p.kind]}</Badge><p className="font-semibold">{p.kind === 'REFUND' ? '−' : ''}{formatFCFA(p.amount)}</p>
                      <button onClick={() => openFile(`/sales/${s.id}/payments/${p.id}/receipt.pdf`)} className="text-xs text-royal-gold-dark hover:underline">Reçu PDF</button></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <PayModal open={paying} onClose={() => setPaying(false)} title={`Encaisser — reste ${formatFCFA(s.balance)}`} max={s.balance} kindChoice onPay={async (b) => { await post(`/sales/${s.id}/payments`, b); toast('success', 'Paiement enregistré'); reload(); }} />
      <CancelModal open={cancelling} sale={s} onClose={() => setCancelling(false)} onDone={() => { setCancelling(false); reload(); }} />
    </>
  );
}

function CancelModal({ open, sale, onClose, onDone }: { open: boolean; sale: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useUi();
  const refundable = sale.paidAmount - sale.refundedAmount;
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState<number | ''>(refundable);
  const [method, setMethod] = useState('CASH');
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await post(`/sales/${sale.id}/cancel`, { reason, refundAmount: Number(refund) || 0, refundMethod: method, restock }); toast('success', 'Vente annulée'); onDone(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Annuler la vente ${sale.number}`} size="sm" footer={<><Button variant="outline" onClick={onClose}>Retour</Button><Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={submit}>Confirmer l&apos;annulation</Button></>}>
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-amber-50 p-3 text-amber-900">La vente sera conservée avec le statut « Annulée ». Le stock des produits est réintégré, les commissions annulées et les points de fidélité corrigés.</p>
        <Field label="Motif (obligatoire)" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label="Montant remboursé au client" hint={`Payé : ${formatFCFA(refundable)} — la part non remboursée (acompte conservé) reste en chiffre d'affaires`}><MoneyInput value={refund} onChange={setRefund} /></Field>
        {Number(refund) > 0 && <Field label="Moyen de remboursement"><PaymentMethodSelect value={method} onChange={(e) => setMethod(e.target.value)} /></Field>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />Réintégrer les produits en stock</label>
      </div>
    </Modal>
  );
}
