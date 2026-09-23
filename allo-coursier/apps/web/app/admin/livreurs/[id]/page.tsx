'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCities } from '@/components/admin/city-filter';
import { DOCUMENT_LABELS } from '@/components/driver-documents';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateOnly, dateTime, DRIVER_STATUS, fcfa, phoneDisplay, VEHICLE_LABELS } from '@/lib/format';
import { useApi } from '@/lib/use-api';

interface DriverDetail {
  userId: string;
  status: string;
  employmentType: string;
  vehicleType: string;
  plateNumber: string | null;
  isOnline: boolean;
  lastLocationAt: string | null;
  ratingAvg: number;
  ratingCount: number;
  cashDebtLimit: number | null;
  commissionPercent: number | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  cityId: string;
  city: { name: string };
  user: { id: string; firstName: string; lastName: string; phone: string; status: string; createdAt: string };
  documents: { id: string; type: string; status: string; rejectionReason: string | null; url: string | null; createdAt: string }[];
  walletId: string | null;
  walletBalance: number;
}

export default function AdminDriverPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const cities = useCities();
  const { data: d, reload, mutate } = useApi<DriverDetail>(`/admin/drivers/${id}`, { persist: false });
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [docReason, setDocReason] = useState<Record<string, string>>({});
  const [settle, setSettle] = useState({ amount: '', method: 'ESPECES', reference: '' });
  const [edit, setEdit] = useState<Partial<DriverDetail> | null>(null);

  if (!d) return <Spinner />;
  const form = edit ?? d;

  const call = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'green', text: ok });
      await reload();
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        back="/admin/livreurs"
        title={`${d.user.firstName} ${d.user.lastName}`}
        subtitle={`${phoneDisplay(d.user.phone)} · ${d.city.name} · inscrit le ${dateOnly(d.user.createdAt)}`}
        action={<Badge tone={DRIVER_STATUS[d.status].tone}>{DRIVER_STATUS[d.status].label}</Badge>}
      />
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {d.status === 'PENDING' && can('drivers.validate') && (
        <Card className="space-y-3 bg-amber-50">
          <p className="font-semibold text-amber-900">Inscription à valider</p>
          <p className="text-sm text-amber-900">Vérifiez les documents ci-dessous (et rencontrez le livreur si besoin) avant de valider.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="success" loading={busy} onClick={() => call(() => api(`/admin/drivers/${id}/approve`, { method: 'POST' }), 'Livreur validé : il peut passer en ligne.')}>
              Valider l’inscription
            </Button>
            <Input className="w-64" placeholder="Motif du refus" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <Button variant="danger" disabled={rejectReason.trim().length < 3} loading={busy} onClick={() => call(() => api(`/admin/drivers/${id}/reject`, { body: { reason: rejectReason } }), 'Inscription refusée.')}>
              Refuser
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold text-brand">Documents</h2>
          {d.documents.length === 0 && <p className="text-sm text-slate-500">Aucun document envoyé.</p>}
          {d.documents.map((doc) => (
            <div key={doc.id} className="flex gap-3 rounded-xl bg-slate-50 p-3">
              {doc.url && (
                <a href={doc.url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={doc.url} alt={DOCUMENT_LABELS[doc.type]} className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                </a>
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{DOCUMENT_LABELS[doc.type]}</p>
                <p className="text-xs text-slate-500">{dateTime(doc.createdAt)} {doc.rejectionReason && `· ${doc.rejectionReason}`}</p>
                <Badge tone={doc.status === 'APPROVED' ? 'green' : doc.status === 'REJECTED' ? 'red' : 'amber'}>{doc.status === 'APPROVED' ? 'Validé' : doc.status === 'REJECTED' ? 'Refusé' : 'À vérifier'}</Badge>
                {doc.status === 'PENDING' && can('drivers.validate') && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="success" onClick={() => call(() => api(`/admin/drivers/${id}/documents/${doc.id}/review`, { body: { approve: true } }), 'Document validé.')}>Valider</Button>
                    <Input className="h-8 w-40 py-1 text-xs" placeholder="Motif du refus" value={docReason[doc.id] ?? ''} onChange={(e) => setDocReason({ ...docReason, [doc.id]: e.target.value })} />
                    <Button size="sm" variant="outline" disabled={(docReason[doc.id] ?? '').trim().length < 3} onClick={() => call(() => api(`/admin/drivers/${id}/documents/${doc.id}/review`, { body: { approve: false, reason: docReason[doc.id] } }), 'Document refusé, le livreur est prévenu.')}>Refuser</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-brand">Espèces et solde</h2>
              {d.walletId && <Link href={`/admin/finances/portefeuilles/${d.walletId}`} className="text-sm text-brand-light">Mouvements →</Link>}
            </div>
            <p className="text-sm">
              {d.walletBalance < 0 ? (
                <>Doit reverser <strong className="text-amber-700">{fcfa(-d.walletBalance)}</strong></>
              ) : (
                <>La plateforme lui doit <strong className="text-brand-greenDark">{fcfa(d.walletBalance)}</strong></>
              )}
            </p>
            {can('wallets.manage') && d.walletBalance < 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input type="number" placeholder="Montant reçu" value={settle.amount} onChange={(e) => setSettle({ ...settle, amount: e.target.value })} />
                <Select value={settle.method} onChange={(e) => setSettle({ ...settle, method: e.target.value })}>
                  <option value="ESPECES">Espèces</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </Select>
                <Input placeholder="Référence" value={settle.reference} onChange={(e) => setSettle({ ...settle, reference: e.target.value })} />
                <Button
                  disabled={!(Number(settle.amount) > 0)}
                  loading={busy}
                  onClick={() =>
                    call(async () => {
                      await api(`/admin/drivers/${id}/cash-settlements`, { body: { amount: Number(settle.amount), method: settle.method, reference: settle.reference || undefined } });
                      setSettle({ amount: '', method: 'ESPECES', reference: '' });
                    }, 'Versement enregistré.')
                  }
                >
                  Encaisser
                </Button>
              </div>
            )}
          </Card>

          {can('drivers.manage') && (
            <Card className="space-y-3">
              <h2 className="font-semibold text-brand">Profil livreur</h2>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Statut d’emploi">
                  <Select value={form.employmentType} onChange={(e) => setEdit({ ...form, employmentType: e.target.value })}>
                    <option value="SALARIE">Salarié</option>
                    <option value="INDEPENDANT">Indépendant</option>
                  </Select>
                </Field>
                <Field label="Véhicule">
                  <Select value={form.vehicleType} onChange={(e) => setEdit({ ...form, vehicleType: e.target.value })}>
                    <option value="MOTO">Moto</option>
                    <option value="TRICYCLE">Tricycle</option>
                  </Select>
                </Field>
                <Field label="Immatriculation">
                  <Input value={form.plateNumber ?? ''} onChange={(e) => setEdit({ ...form, plateNumber: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Ville">
                  <Select value={form.cityId} onChange={(e) => setEdit({ ...form, cityId: e.target.value })}>
                    {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Plafond espèces (FCFA)" hint="Vide = réglage global">
                  <Input type="number" value={form.cashDebtLimit ?? ''} onChange={(e) => setEdit({ ...form, cashDebtLimit: e.target.value === '' ? null : Number(e.target.value) })} />
                </Field>
                <Field label="Commission propre (%)" hint="Vide = celle du tarif">
                  <Input type="number" value={form.commissionPercent ?? ''} onChange={(e) => setEdit({ ...form, commissionPercent: e.target.value === '' ? null : Number(e.target.value) })} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!edit}
                  loading={busy}
                  onClick={() =>
                    call(async () => {
                      const updated = await api<DriverDetail>(`/admin/drivers/${id}`, {
                        method: 'PATCH',
                        body: {
                          employmentType: form.employmentType,
                          vehicleType: form.vehicleType,
                          plateNumber: form.plateNumber || undefined,
                          cityId: form.cityId,
                          cashDebtLimit: form.cashDebtLimit,
                          commissionPercent: form.commissionPercent,
                        },
                      });
                      mutate({ ...d, ...updated });
                      setEdit(null);
                    }, 'Profil mis à jour.')
                  }
                >
                  Enregistrer
                </Button>
                {d.status === 'APPROVED' && (
                  <Button variant="danger" loading={busy} onClick={() => call(() => api(`/admin/drivers/${id}`, { method: 'PATCH', body: { status: 'SUSPENDED' } }), 'Livreur suspendu et mis hors ligne.')}>
                    Suspendre
                  </Button>
                )}
                {d.status === 'SUSPENDED' && (
                  <Button variant="success" loading={busy} onClick={() => call(() => api(`/admin/drivers/${id}`, { method: 'PATCH', body: { status: 'APPROVED' } }), 'Livreur réactivé.')}>
                    Réactiver
                  </Button>
                )}
              </div>
            </Card>
          )}
          <Card className="text-sm text-slate-600">
            <p>{VEHICLE_LABELS[d.vehicleType]} · {d.isOnline ? '🟢 en ligne' : 'hors ligne'} · dernière position {dateTime(d.lastLocationAt)}</p>
            <p>Note : {d.ratingCount ? `★ ${d.ratingAvg.toFixed(1)} sur ${d.ratingCount} avis` : 'pas encore noté'}</p>
            <Link href={`/admin/commandes?driverId=${d.userId}`} className="text-brand-light">Voir ses commandes →</Link>
            <br />
            <Link href={`/admin/utilisateurs/${d.userId}`} className="text-brand-light">Compte (code secret, suspension du compte) →</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
