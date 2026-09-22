'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Input, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { UserRow } from '@/lib/admin-types';
import { useAuth } from '@/lib/auth';
import { dateOnly, dateTime, phoneDisplay } from '@/lib/format';
import { useApi } from '@/lib/use-api';

interface UserDetail extends UserRow {
  addresses: { id: string; label: string; landmark: string }[];
  _count: { clientOrders: number; driverOrders: number };
}

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const { can, user: me } = useAuth();
  const { data: u, reload } = useApi<UserDetail>(`/admin/users/${id}`, { persist: false });
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!u) return <Spinner />;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
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
      <PageHeader back="/admin/clients" title={`${u.firstName} ${u.lastName}`} subtitle={`${phoneDisplay(u.phone)} · inscrit le ${dateOnly(u.createdAt)}`} action={<Badge tone={u.status === 'ACTIVE' ? 'green' : 'red'}>{u.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}</Badge>} />
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {temp && (
        <Alert tone="amber">
          {u.secretKind === 'PIN' ? 'Code secret' : 'Mot de passe'} provisoire à communiquer à la personne : <strong className="text-lg tracking-widest">{temp}</strong> (affiché une seule fois).
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2 text-sm">
          <h2 className="font-semibold text-brand">Compte</h2>
          <p>Rôles : {u.roles.map((r) => r.role.name).join(', ')}</p>
          <p>Email : {u.email ?? '—'}</p>
          <p>Dernière connexion : {dateTime(u.lastLoginAt)}</p>
          {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <p className="text-amber-700">Bloqué jusqu’à {dateTime(u.lockedUntil)} (codes erronés)</p>}
          <p>
            Commandes passées : <Link className="text-brand-light" href={`/admin/commandes?clientId=${u.id}`}>{u._count.clientOrders}</Link>
            {u._count.driverOrders > 0 && ` · missions : ${u._count.driverOrders}`}
          </p>
          {u.addresses.length > 0 && (
            <div>
              <p className="font-medium">Adresses :</p>
              {u.addresses.map((a) => <p key={a.id} className="text-slate-600">• {a.label} — {a.landmark}</p>)}
            </div>
          )}
        </Card>
        {can('users.manage') && me?.id !== u.id && (
          <Card className="space-y-3">
            <h2 className="font-semibold text-brand">Actions</h2>
            <Button
              variant="secondary"
              loading={busy}
              onClick={() =>
                run(async () => {
                  const res = await api<{ temporarySecret: string }>(`/admin/users/${id}/reset-secret`, { method: 'POST' });
                  setTemp(res.temporarySecret);
                }, 'Nouveau code généré ; les sessions ouvertes ont été fermées.')
              }
            >
              Générer un nouveau code secret
            </Button>
            <div className="flex gap-2">
              <Input placeholder="Motif" value={reason} onChange={(e) => setReason(e.target.value)} />
              {u.status === 'ACTIVE' ? (
                <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => run(() => api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status: 'SUSPENDED', reason } }), 'Compte suspendu.')}>
                  Suspendre
                </Button>
              ) : (
                <Button variant="success" loading={busy} onClick={() => run(() => api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status: 'ACTIVE', reason: reason || undefined } }), 'Compte réactivé.')}>
                  Réactiver
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
