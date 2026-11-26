'use client';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PERMISSION_GROUPS, PERMISSIONS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, useUi } from '@/components/ui';
import { patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function UsersPage() {
  return <RequirePerm perms={['users.manage']}><Users /></RequirePerm>;
}

function Users() {
  const { user: me } = useAuth();
  const { toast, confirm } = useUi();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const users = useApi<any[]>('/users');
  const roles = useApi<any[]>('/roles');
  const staff = useApi<any[]>('/staff');
  const [edit, setEdit] = useState<any | null>(null);
  const [reset, setReset] = useState<any | null>(null);
  const [role, setRole] = useState<any | null>(null);
  const toggle = async (u: any) => {
    const r = await confirm({ title: u.active ? 'Désactiver le compte' : 'Réactiver le compte', message: u.active ? `${u.fullName} sera immédiatement déconnecté et ne pourra plus se connecter.` : `${u.fullName} pourra de nouveau se connecter.`, danger: u.active });
    if (!r.ok) return;
    try { await patch(`/users/${u.id}`, { active: !u.active }); toast('success', 'Compte mis à jour'); users.reload(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <>
      <PageHeader title="Utilisateurs & rôles" actions={tab === 'users' ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({})}>Nouvel utilisateur</Button> : <Button icon={<Plus className="h-4 w-4" />} onClick={() => setRole({ permissions: [] })}>Nouveau rôle</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Comptes' }, { key: 'roles', label: 'Rôles & permissions' }]} />
      {tab === 'users' && <Card>{users.loading && !users.data ? <Spinner /> : <Table rows={users.data ?? []} rowClassName={(u: any) => (!u.active ? 'opacity-50' : undefined)} columns={[
        { key: 'fullName', label: 'Nom', render: (u: any) => <><b>{u.fullName}</b><p className="font-mono text-xs text-neutral-500">{u.username}</p></> },
        { key: 'role', label: 'Rôle', render: (u: any) => <Badge tone={u.role.code === 'OWNER' ? 'dark' : 'gold'}>{u.role.name}</Badge> },
        { key: 'staff', label: 'Fiche personnel', render: (u: any) => u.staff ? `${u.staff.firstName} ${u.staff.lastName}` : '—' },
        { key: 'lastLoginAt', label: 'Dernière connexion', render: (u: any) => fmtDateTime(u.lastLoginAt) },
        { key: 'status', label: 'Statut', render: (u: any) => <>{u.active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>} {u.mustChangePassword && <Badge tone="orange">Mot de passe à changer</Badge>}</> },
        { key: 'a', label: '', render: (u: any) => <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit(u)} icon={<Pencil className="h-3.5 w-3.5" />} /><Button size="sm" variant="ghost" onClick={() => setReset(u)} icon={<KeyRound className="h-3.5 w-3.5" />} title="Réinitialiser le mot de passe" />{u.id !== me?.id && <Button size="sm" variant="ghost" onClick={() => toggle(u)}>{u.active ? 'Désactiver' : 'Réactiver'}</Button>}</div> },
      ]} />}</Card>}
      {tab === 'roles' && <Card>{roles.loading && !roles.data ? <Spinner /> : <Table rows={roles.data ?? []} columns={[
        { key: 'name', label: 'Rôle', render: (r: any) => <><b>{r.name}</b><p className="text-xs text-neutral-500">{r.description}</p></> },
        { key: 'perms', label: 'Permissions', render: (r: any) => r.permissions.includes('*') ? <Badge tone="dark">Accès complet</Badge> : <span className="text-xs">{r.permissions.length} permission(s)</span> },
        { key: 'users', label: 'Utilisateurs', align: 'right', render: (r: any) => r._count.users },
        { key: 'e', label: '', render: (r: any) => r.code !== 'OWNER' && <Button size="sm" variant="outline" onClick={() => setRole(r)}>Modifier les droits</Button> },
      ]} />}</Card>}
      <UserModal user={edit} roles={roles.data ?? []} staff={staff.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); users.reload(); }} />
      <ResetModal user={reset} onClose={() => setReset(null)} />
      <RoleModal role={role} onClose={() => setRole(null)} onSaved={() => { setRole(null); roles.reload(); }} />
    </>
  );
}

function UserModal({ user, roles, staff, onClose, onSaved }: { user: any | null; roles: any[]; staff: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({});
  useEffect(() => { if (user) setF({ username: user.username ?? '', fullName: user.fullName ?? '', phone: user.phone ?? '', roleId: user.role?.id ?? roles.find((r) => r.code === 'STYLIST')?.id, staffId: user.staffId ?? '', password: '' }); }, [user, roles]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (user?.id) await patch(`/users/${user.id}`, { fullName: f.fullName, phone: f.phone || undefined, roleId: f.roleId, staffId: f.staffId || null });
      else await post('/users', { username: f.username.toLowerCase(), fullName: f.fullName, phone: f.phone || undefined, roleId: f.roleId, staffId: f.staffId || undefined, password: f.password });
      toast('success', user?.id ? 'Compte modifié' : 'Compte créé — le mot de passe devra être changé à la première connexion'); onSaved();
    } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open={!!user} onClose={onClose} title={user?.id ? `Compte ${user.username}` : 'Nouvel utilisateur'} footer={<Button onClick={save} disabled={!f.fullName || (!user?.id && (!f.username || f.password.length < 8))}>Enregistrer</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Identifiant" required><Input value={f.username ?? ''} onChange={set('username')} disabled={!!user?.id} autoCapitalize="none" /></Field>
        <Field label="Nom complet" required><Input value={f.fullName ?? ''} onChange={set('fullName')} /></Field>
        <Field label="Rôle" required><Select value={f.roleId ?? ''} onChange={set('roleId')}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Fiche personnel liée" hint="Obligatoire pour un coiffeur (planning et commissions)"><Select value={f.staffId ?? ''} onChange={set('staffId')}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.position}</option>)}</Select></Field>
        <Field label="Téléphone"><Input value={f.phone ?? ''} onChange={set('phone')} /></Field>
        {!user?.id && <Field label="Mot de passe provisoire" hint="8 caractères minimum, lettres et chiffres"><Input type="text" value={f.password ?? ''} onChange={set('password')} /></Field>}
      </div>
    </Modal>
  );
}

function ResetModal({ user, onClose }: { user: any | null; onClose: () => void }) {
  const { toast } = useUi();
  const [pwd, setPwd] = useState('');
  useEffect(() => setPwd(''), [user]);
  const save = async () => {
    try { await post(`/users/${user.id}/reset-password`, { newPassword: pwd }); toast('success', 'Mot de passe réinitialisé. Toutes les sessions de ce compte sont fermées.'); onClose(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open={!!user} onClose={onClose} title={`Réinitialiser le mot de passe de ${user?.fullName ?? ''}`} size="sm" footer={<Button disabled={pwd.length < 8} onClick={save}>Réinitialiser</Button>}>
      <Field label="Nouveau mot de passe provisoire" hint="L'utilisateur devra le changer à sa prochaine connexion"><Input value={pwd} onChange={(e) => setPwd(e.target.value)} /></Field>
    </Modal>
  );
}

function RoleModal({ role, onClose, onSaved }: { role: any | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({});
  useEffect(() => { if (role) setF({ code: role.code ?? '', name: role.name ?? '', description: role.description ?? '', permissions: role.permissions ?? [] }); }, [role]);
  const toggle = (p: string) => setF({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x: string) => x !== p) : [...f.permissions, p] });
  const save = async () => {
    try {
      if (role?.id) await patch(`/roles/${role.id}`, { name: f.name, description: f.description, permissions: f.permissions });
      else await post('/roles', { code: f.code.toUpperCase(), name: f.name, description: f.description, permissions: f.permissions });
      toast('success', 'Rôle enregistré — les droits s’appliquent immédiatement'); onSaved();
    } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open={!!role} onClose={onClose} size="xl" title={role?.id ? `Permissions — ${role.name}` : 'Nouveau rôle'} footer={<Button onClick={save} disabled={!f.name}>Enregistrer</Button>}>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Code"><Input value={f.code ?? ''} onChange={(e) => setF({ ...f, code: e.target.value })} disabled={!!role?.id} placeholder="APPRENTI" /></Field>
        <Field label="Nom"><Input value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Description"><Input value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.label} className="rounded-lg border p-3">
            <p className="mb-2 text-xs font-bold uppercase text-royal-gold-dark">{g.label}</p>
            {g.permissions.map((p) => <label key={p} className="flex items-start gap-2 py-0.5 text-sm"><input type="checkbox" className="mt-1" checked={f.permissions?.includes(p) ?? false} onChange={() => toggle(p)} />{PERMISSIONS[p]}</label>)}
          </div>
        ))}
      </div>
    </Modal>
  );
}
