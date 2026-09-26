'use client';

import { LogOut, MapPin, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChangeSecretCard } from '@/components/account';
import { InstallButton, PushToggle } from '@/components/pwa';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { phoneDisplay } from '@/lib/format';
import { useApi } from '@/lib/use-api';

interface Address {
  id: string;
  label: string;
  landmark: string;
  isDefault: boolean;
}

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const addresses = useApi<Address[]>('/me/addresses');
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader title="Mon profil" subtitle={phoneDisplay(user?.phone)} />
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/me', { method: 'PATCH', body: { firstName, lastName, email: email || null } });
              await refreshUser();
              setSaved('Profil enregistré.');
            } catch (err) {
              setSaved((err as Error).message);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Field label="Prénom">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </Field>
            <Field label="Nom">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </Field>
          </div>
          <Field label="Email (facultatif)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {saved && <Alert tone="blue">{saved}</Alert>}
          <Button type="submit" variant="secondary">
            Enregistrer
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold text-brand">Mes adresses</h2>
        {addresses.data?.length ? (
          <ul className="divide-y divide-slate-100">
            {addresses.data.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <MapPin className="h-4 w-4 shrink-0 text-brand-light" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold text-slate-800">{a.label}</span>
                  <span className="block truncate text-slate-500">{a.landmark}</span>
                </span>
                <button
                  onClick={async () => {
                    await api(`/me/addresses/${a.id}`, { method: 'DELETE' });
                    void addresses.reload();
                  }}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Supprimer ${a.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Cochez « Enregistrer cette adresse » lors d’une commande pour la retrouver ici.</p>
        )}
      </Card>

      <ChangeSecretCard />

      <Card className="space-y-3">
        <h2 className="font-semibold text-brand">Application</h2>
        <PushToggle />
        <InstallButton variant="primary" />
      </Card>

      <Button
        variant="outline"
        block
        onClick={async () => {
          await logout();
          router.replace('/');
        }}
      >
        <LogOut className="h-4 w-4" /> Se déconnecter
      </Button>
    </div>
  );
}
