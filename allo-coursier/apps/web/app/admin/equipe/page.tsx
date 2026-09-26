'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { useCities } from '@/components/admin/city-filter';
import { DataTable } from '@/components/admin/table';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import type { UserRow } from '@/lib/admin-types';
import { useAuth } from '@/lib/auth';
import { dateTime, phoneDisplay } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isPublic: boolean;
  permissionCodes: string[];
  userCount: number;
}
interface PermissionGroup {
  group: string;
  permissions: { code: string; description: string }[];
}

function RolesTab() {
  const { can } = useAuth();
  const roles = useApi<Role[]>('/admin/roles', { persist: false });
  const perms = useApi<PermissionGroup[]>(can('roles.manage') ? '/admin/permissions' : null, { persist: false });
  const [editing, setEditing] = useState<Role | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ code: '', name: '', description: '' });
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {can('roles.manage') && <Button variant="secondary" onClick={() => { setCreating(true); setSelected([]); setError(null); }}>Créer un rôle</Button>}
      <div className="grid gap-3 sm:grid-cols-2">
        {roles.data?.filter((r) => !r.isPublic).map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-brand">{r.name}</p>
                <p className="text-xs text-slate-500">{r.description} · {r.userCount} personne(s)</p>
              </div>
              {can('roles.manage') && r.code !== 'SUPER_ADMIN' && (
                <Button size="sm" variant="outline" onClick={() => { setEditing(r); setSelected(r.permissionCodes); setError(null); }}>Droits</Button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-600">{r.code === 'SUPER_ADMIN' ? 'Tous les droits' : `${r.permissionCodes.length} droit(s)`}</p>
          </Card>
        ))}
      </div>
      <Sheet open={!!editing || creating} onClose={() => { setEditing(null); setCreating(false); }} title={editing ? `Droits — ${editing.name}` : 'Nouveau rôle'}>
        <div className="space-y-3">
          {creating && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Code"><Input value={newRole.code} onChange={(e) => setNewRole({ ...newRole, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} placeholder="CAISSIER" /></Field>
              <Field label="Nom"><Input value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} /></Field>
              <Field label="Description" className="col-span-2"><Input value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} /></Field>
            </div>
          )}
          {perms.data?.map((g) => (
            <div key={g.group}>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{g.group}</p>
              {g.permissions.map((p) => (
                <label key={p.code} className="flex items-start gap-2 py-1 text-sm">
                  <input type="checkbox" className="mt-0.5 accent-brand" checked={selected.includes(p.code)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.code] : s.filter((x) => x !== p.code)))} />
                  {p.description}
                </label>
              ))}
            </div>
          ))}
          <Alert>{error}</Alert>
          <Button
            block
            onClick={async () => {
              setError(null);
              try {
                if (editing) await api(`/admin/roles/${editing.id}/permissions`, { method: 'PUT', body: { permissionCodes: selected } });
                else await api('/admin/roles', { body: { ...newRole, description: newRole.description || undefined, permissionCodes: selected } });
                setEditing(null);
                setCreating(false);
                void roles.reload();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Enregistrer
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function StaffTab() {
  const cities = useCities();
  const roles = useApi<Role[]>('/admin/roles', { persist: false });
  const staff = useApi<Paginated<UserRow>>('/admin/users?staff=true&pageSize=100', { persist: false });
  const staffRoles = roles.data?.filter((r) => !r.isPublic) ?? [];
  const [sheet, setSheet] = useState<'create' | UserRow | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [assignments, setAssignments] = useState<{ roleCode: string; cityId: string }[]>([{ roleCode: 'DISPATCHER', cityId: '' }]);
  const [temp, setTemp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openEdit = (u: UserRow) => {
    setSheet(u);
    setError(null);
    setAssignments(u.roles.filter((r) => staffRoles.some((s) => s.code === r.role.code)).map((r) => ({ roleCode: r.role.code, cityId: r.cityId ?? '' })));
  };

  const RoleRows = (
    <div className="space-y-2">
      {assignments.map((a, i) => (
        <div key={i} className="flex gap-2">
          <Select value={a.roleCode} onChange={(e) => setAssignments(assignments.map((x, j) => (j === i ? { ...x, roleCode: e.target.value } : x)))}>
            {staffRoles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </Select>
          <Select value={a.cityId} onChange={(e) => setAssignments(assignments.map((x, j) => (j === i ? { ...x, cityId: e.target.value } : x)))}>
            <option value="">Toutes les villes</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button variant="ghost" onClick={() => setAssignments(assignments.filter((_, j) => j !== i))} aria-label="Retirer">✕</Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => setAssignments([...assignments, { roleCode: staffRoles[0]?.code ?? 'SUPPORT', cityId: '' }])}>+ Ajouter un rôle</Button>
    </div>
  );
  const payload = () => assignments.map((a) => ({ roleCode: a.roleCode, cityId: a.cityId || undefined }));

  return (
    <div className="space-y-3">
      <Button variant="secondary" onClick={() => { setSheet('create'); setTemp(null); setError(null); setAssignments([{ roleCode: 'DISPATCHER', cityId: '' }]); }}>Ajouter un membre</Button>
      <DataTable
        rows={staff.data?.items}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        columns={[
          { header: 'Nom', cell: (r) => <span className="font-semibold text-brand">{r.firstName} {r.lastName}</span> },
          { header: 'Téléphone', cell: (r) => phoneDisplay(r.phone) },
          { header: 'Rôles', cell: (r) => <div className="flex flex-wrap gap-1">{r.roles.map((x) => <Badge key={x.role.code + x.cityId} tone="blue">{x.role.name}{x.cityId ? ` · ${cities.find((c) => c.id === x.cityId)?.name ?? ''}` : ''}</Badge>)}</div> },
          { header: 'Statut', cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'green' : 'red'}>{r.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}</Badge> },
          { header: 'Dernière connexion', cell: (r) => dateTime(r.lastLoginAt) },
        ]}
      />
      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet === 'create' ? 'Nouveau membre de l’équipe' : 'Rôles'}>
        {temp ? (
          <Alert tone="green">Compte créé. Mot de passe provisoire : <strong className="font-mono text-base">{temp}</strong> (affiché une seule fois).</Alert>
        ) : (
          <div className="space-y-3">
            {sheet === 'create' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Prénom"><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
                  <Field label="Nom"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
                </div>
                <Field label="Téléphone"><PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></Field>
              </>
            )}
            {RoleRows}
            <Alert>{error}</Alert>
            <Button
              block
              onClick={async () => {
                setError(null);
                try {
                  if (sheet === 'create') {
                    const res = await api<{ temporaryPassword?: string }>('/admin/staff', { body: { ...form, roles: payload() } });
                    setTemp(res.temporaryPassword ?? null);
                  } else if (sheet) {
                    await api(`/admin/users/${sheet.id}/roles`, { method: 'PUT', body: { roles: payload() } });
                    setSheet(null);
                  }
                  void staff.reload();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              Enregistrer
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

export default function TeamPage() {
  const [tab, setTab] = useState<'equipe' | 'roles'>('equipe');
  return (
    <div className="space-y-4">
      <PageHeader title="Équipe et rôles" subtitle="Chacun ne voit et ne fait que ce que ses rôles autorisent ; un rôle peut être limité à une ville." />
      <div className="flex gap-1 rounded-xl bg-white p-1 shadow-card">
        {(['equipe', 'roles'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={clsx('flex-1 rounded-lg px-3 py-2 text-sm font-semibold', tab === t ? 'bg-brand text-white' : 'text-slate-600')}>
            {t === 'equipe' ? 'Équipe' : 'Rôles et droits'}
          </button>
        ))}
      </div>
      {tab === 'equipe' ? <StaffTab /> : <RolesTab />}
    </div>
  );
}
