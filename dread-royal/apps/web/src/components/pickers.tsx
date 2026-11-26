'use client';
import { Search, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GENDER_LABELS, PAYMENT_METHOD_LABELS } from '@dread-royal/shared';
import { get, patch, post, qs } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { fmtPhone } from '@/lib/format';
import { submitOrQueue } from '@/lib/offline';
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea, useUi } from './ui';

export interface ClientLite { id: string; code: string; firstName: string; lastName: string; phone?: string | null; loyaltyPoints?: number; queued?: boolean }

/** Recherche rapide de client par nom ou téléphone, avec création à la volée. */
export function ClientPicker({ value, onChange, allowCreate = true, placeholder = 'Rechercher un client (nom ou téléphone)…' }: { value: ClientLite | null; onChange: (c: ClientLite | null) => void; allowCreate?: boolean; placeholder?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 250);
  const [results, setResults] = useState<ClientLite[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!dq.trim()) { setResults([]); return; }
    get<{ items: ClientLite[] }>(`/clients${qs({ search: dq, pageSize: 8 })}`).then((r) => setResults(r.items)).catch(() => setResults([]));
  }, [dq]);
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-royal-gold/50 bg-royal-gold-light/40 px-3 py-2 text-sm">
        <div><b>{value.firstName} {value.lastName}</b> <span className="text-xs text-neutral-500">{value.code} {value.phone ? `· ${fmtPhone(value.phone)}` : ''}{value.loyaltyPoints ? ` · ${value.loyaltyPoints} pts` : ''}{value.queued ? ' · en attente de synchronisation' : ''}</span></div>
        <button type="button" onClick={() => onChange(null)} className="text-neutral-500 hover:text-red-600" aria-label="Retirer le client"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} placeholder={placeholder} className="pl-9" />
        </div>
        {allowCreate && <Button type="button" variant="outline" onClick={() => setCreating(true)} icon={<UserPlus className="h-4 w-4" />}><span className="hidden sm:inline">Nouveau</span></Button>}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-white shadow-xl">
          {results.map((c) => (
            <li key={c.id}><button type="button" onMouseDown={() => { onChange(c); setQ(''); }} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-royal-gold-light/50">
              <span><b>{c.firstName} {c.lastName}</b> <span className="text-xs text-neutral-500">{c.code}</span></span><span className="text-xs text-neutral-500">{fmtPhone(c.phone)}</span>
            </button></li>
          ))}
        </ul>
      )}
      <ClientFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => { setCreating(false); onChange(c); }} />
    </div>
  );
}

export function ClientFormModal({ open, onClose, onSaved, client }: { open: boolean; onClose: () => void; onSaved: (c: any) => void; client?: any }) {
  const { toast } = useUi();
  const empty = { firstName: '', lastName: '', phone: '', phone2: '', gender: 'FEMALE', birthDate: '', preferences: '', notes: '' };
  const [f, setF] = useState<any>(empty);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(client ? { ...empty, ...client, phone: client.phone ?? '', phone2: client.phone2 ?? '', birthDate: client.birthDate?.slice(0, 10) ?? '', preferences: client.preferences ?? '', notes: client.notes ?? '' } : empty); }, [open]); // eslint-disable-line
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    const body: any = { firstName: f.firstName, lastName: f.lastName, gender: f.gender, phone: f.phone || undefined, phone2: f.phone2 || undefined, birthDate: f.birthDate || undefined, preferences: f.preferences || undefined, notes: f.notes || undefined };
    try {
      if (client) {
        const r = await patch(`/clients/${client.id}`, body);
        toast('success', 'Fiche client mise à jour');
        onSaved(r);
      } else {
        const r = await submitOrQueue('client.create', body, `Nouveau client ${f.firstName} ${f.lastName}`, () => post('/clients', body));
        if (r.queued) {
          toast('warning', 'Hors connexion : client enregistré localement, il sera créé à la synchronisation');
          onSaved({ id: r.op.opId, code: 'en attente', firstName: f.firstName, lastName: f.lastName, phone: f.phone, queued: true });
        } else {
          toast('success', `Client ${r.result.code} créé`);
          onSaved(r.result);
        }
      }
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={client ? 'Modifier le client' : 'Nouveau client'} footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={busy} onClick={save} disabled={!f.firstName || !f.lastName}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom" required><Input value={f.firstName} onChange={set('firstName')} autoFocus /></Field>
        <Field label="Nom" required><Input value={f.lastName} onChange={set('lastName')} /></Field>
        <Field label="Téléphone" hint="Ex : 70 12 34 56"><Input type="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Téléphone 2"><Input type="tel" value={f.phone2} onChange={set('phone2')} /></Field>
        <Field label="Sexe / profil" required><Select value={f.gender} onChange={set('gender')}>{Object.entries(GENDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Date de naissance"><Input type="date" value={f.birthDate} onChange={set('birthDate')} /></Field>
        <Field label="Préférences de coiffure" className="sm:col-span-2"><Textarea value={f.preferences} onChange={set('preferences')} placeholder="Ex : locks fines, retouche toutes les 6 semaines, cuir chevelu sensible…" /></Field>
        <Field label="Observations" className="sm:col-span-2"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

export function PaymentMethodSelect(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select {...p}>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>;
}

/** Modale d'encaissement / de règlement générique. */
export function PayModal({ open, onClose, title, max, onPay, kindChoice }: { open: boolean; onClose: () => void; title: string; max: number; onPay: (b: { amount: number; method: string; reference?: string; kind?: string }) => Promise<void>; kindChoice?: boolean }) {
  const [amount, setAmount] = useState<number | ''>('');
  const [method, setMethod] = useState('CASH');
  const [reference, setRef] = useState('');
  const [kind, setKind] = useState('PAYMENT');
  const [busy, setBusy] = useState(false);
  const { toast } = useUi();
  useEffect(() => { if (open) { setAmount(max); setMethod('CASH'); setRef(''); setKind('PAYMENT'); } }, [open, max]);
  const submit = async () => {
    setBusy(true);
    try { await onPay({ amount: Number(amount), method, reference: reference || undefined, ...(kindChoice ? { kind } : {}) }); onClose(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={busy} disabled={!amount || Number(amount) > max} onClick={submit}>Valider</Button></>}>
      <div className="space-y-3">
        <Field label="Montant" hint={`Maximum : ${max.toLocaleString('fr-FR')} FCFA`}><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Moyen de paiement"><PaymentMethodSelect value={method} onChange={(e) => setMethod(e.target.value)} /></Field>
        {method !== 'CASH' && <Field label="Référence de transaction" hint="N° de transaction Orange Money / Moov Money / virement"><Input value={reference} onChange={(e) => setRef(e.target.value)} /></Field>}
        {kindChoice && <Field label="Nature"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="PAYMENT">Paiement</option><option value="DEPOSIT">Acompte</option></Select></Field>}
      </div>
    </Modal>
  );
}
