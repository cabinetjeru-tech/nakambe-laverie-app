'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Badge, Button, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Textarea } from '@/components/ui';
import { get, post, qs } from '@/lib/api';
import { PLATFORM_ROLE, TENANT_STATUS, USER_STATUS } from '@/lib/billing';
import { date, dateTime } from '@/lib/format';

interface UserRow {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  platformRole: string | null;
  tenants: { id: string; displayName: string; roles: string[] }[];
}

interface UserDetail {
  id: string;
  fullName: string;
  phone: string;
  phoneVerifiedAt: string | null;
  email: string | null;
  status: string;
  failedLogins: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  mfaEnabledAt: string | null;
  activeSessions: number;
  platformStaff: { role: string; isActive: boolean } | null;
  memberships: { status: string; joinedAt: string; roles: string[]; tenant: { id: string; displayName: string; status: string } }[];
}

function UsersPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [staff, setStaff] = useState(false);
  const users = useQuery({
    queryKey: ['platform-users', search, status, staff],
    queryFn: () => get<UserRow[]>(`/platform/users${qs({ search: search.trim(), status, staff: staff ? 'true' : undefined })}`),
    placeholderData: (previous) => previous,
  });
  const selected = params.get('user');
  const open = (id: string | null) => router.replace(id ? `${pathname}?user=${id}` : pathname);

  return (
    <div>
      <PageHeader title="Utilisateurs" description="Tous les comptes : propriétaires, employés, équipe plateforme." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-72" type="search" placeholder="Nom, téléphone ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher" />
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut du compte">
          <option value="">Tous les comptes</option>
          {Object.entries(USER_STATUS).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={staff} onChange={(e) => setStaff(e.target.checked)} className="rounded border-stone-300" />
          Équipe plateforme uniquement
        </label>
      </div>
      {users.error && <ErrorMessage error={users.error} />}
      {users.isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Nom', 'Téléphone', 'Salons et rôles', 'Compte', 'Dernière connexion', 'Créé le']} empty={users.data?.length === 0}>
          {users.data?.map((u) => (
            <tr key={u.id} className="cursor-pointer hover:bg-stone-50" onClick={() => open(u.id)}>
              <Td>
                <span className="font-medium text-brand-700">{u.fullName}</span>
                {u.platformRole && (
                  <span className="ml-2">
                    <Badge tone="violet">{PLATFORM_ROLE[u.platformRole]}</Badge>
                  </span>
                )}
                {u.email && <span className="block text-xs text-stone-500">{u.email}</span>}
              </Td>
              <Td className="tabular-nums">{u.phone}</Td>
              <Td className="max-w-xs whitespace-normal">
                {u.tenants.length === 0 ? '—' : u.tenants.map((t) => `${t.displayName} (${t.roles.join(', ')})`).join(' · ')}
              </Td>
              <Td>
                <Badge tone={USER_STATUS[u.status]?.tone}>{USER_STATUS[u.status]?.label}</Badge>
              </Td>
              <Td>{u.lastLoginAt ? dateTime(u.lastLoginAt) : '—'}</Td>
              <Td>{date(u.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
      {selected && <UserModal userId={selected} onClose={() => open(null)} />}
    </div>
  );
}

function UserModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: ['platform-user', userId], queryFn: () => get<UserDetail>(`/platform/users/${userId}`) });
  const [action, setAction] = useState<'ACTIVE' | 'DISABLED' | null>(null);
  const [reason, setReason] = useState('');
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-user', userId] });
    queryClient.invalidateQueries({ queryKey: ['platform-users'] });
  };
  const unlock = useMutation({ mutationFn: () => post(`/platform/users/${userId}/unlock`), onSuccess: refresh });
  const logout = useMutation({ mutationFn: () => post(`/platform/users/${userId}/logout`), onSuccess: refresh });
  const setStatus = useMutation({
    mutationFn: () => post(`/platform/users/${userId}/status`, { status: action, reason }),
    onSuccess: () => {
      setAction(null);
      setReason('');
      refresh();
    },
  });
  const u = user.data;

  return (
    <Modal open wide title={u?.fullName ?? 'Utilisateur'} onClose={onClose}>
      {user.isLoading || !u ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-stone-500">Téléphone</dt>
              <dd className="tabular-nums">
                {u.phone} {u.phoneVerifiedAt ? <Badge tone="green">vérifié</Badge> : <Badge>non vérifié</Badge>}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">E-mail</dt>
              <dd>{u.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Compte</dt>
              <dd>
                <Badge tone={USER_STATUS[u.status]?.tone}>{USER_STATUS[u.status]?.label}</Badge>
                {u.failedLogins > 0 && <span className="ml-2 text-xs text-stone-500">{u.failedLogins} échec(s) de connexion</span>}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Sessions ouvertes</dt>
              <dd>{u.activeSessions}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Dernière connexion</dt>
              <dd>{u.lastLoginAt ? dateTime(u.lastLoginAt) : '—'}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Double authentification</dt>
              <dd>{u.mfaEnabledAt ? 'Activée' : 'Non'}</dd>
            </div>
            {u.platformStaff?.isActive && (
              <div>
                <dt className="text-stone-500">Équipe plateforme</dt>
                <dd>{PLATFORM_ROLE[u.platformStaff.role]}</dd>
              </div>
            )}
          </dl>

          <div>
            <p className="mb-2 text-sm font-semibold text-stone-900">Salons</p>
            {u.memberships.length === 0 ? (
              <p className="text-sm text-stone-500">Aucun.</p>
            ) : (
              <ul className="divide-y divide-stone-100 text-sm">
                {u.memberships.map((m) => (
                  <li key={m.tenant.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <a href={`/plateforme/salons/${m.tenant.id}`} className="font-medium text-brand-700 hover:underline">
                      {m.tenant.displayName}
                    </a>
                    <span className="flex items-center gap-2 text-stone-500">
                      {m.roles.join(', ')} · depuis {date(m.joinedAt)}
                      <Badge tone={TENANT_STATUS[m.tenant.status]?.tone}>{TENANT_STATUS[m.tenant.status]?.label}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
            {u.status === 'LOCKED' && (
              <Button variant="secondary" loading={unlock.isPending} onClick={() => unlock.mutate()}>
                Déverrouiller
              </Button>
            )}
            <Button variant="secondary" loading={logout.isPending} disabled={u.activeSessions === 0} onClick={() => logout.mutate()}>
              Déconnecter partout
            </Button>
            {u.status === 'DISABLED' ? (
              <Button onClick={() => setAction('ACTIVE')}>Réactiver le compte</Button>
            ) : (
              <Button variant="danger" onClick={() => setAction('DISABLED')}>
                Désactiver le compte
              </Button>
            )}
          </div>
          <ErrorMessage error={unlock.error ?? logout.error} />

          {action && (
            <div className="space-y-3 rounded-lg bg-stone-50 p-4">
              <p className="text-sm text-stone-700">
                {action === 'DISABLED'
                  ? 'La personne ne pourra plus se connecter et toutes ses sessions sont fermées immédiatement.'
                  : 'La personne pourra de nouveau se connecter.'}
              </p>
              <Field label="Motif (journalisé)">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
              <ErrorMessage error={setStatus.error} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setAction(null)}>
                  Annuler
                </Button>
                <Button variant={action === 'DISABLED' ? 'danger' : 'primary'} disabled={reason.trim().length < 3} loading={setStatus.isPending} onClick={() => setStatus.mutate()}>
                  Confirmer
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function PlatformUsersPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <UsersPage />
    </Suspense>
  );
}
