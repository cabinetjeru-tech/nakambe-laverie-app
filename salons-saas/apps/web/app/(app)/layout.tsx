'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SalonProvider } from '@/lib/salon';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, me, switchTenant, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/connexion');
  }, [status, router]);

  if (status !== 'authenticated' || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Connecté sans entreprise active : choix de l'entreprise (ou compte client).
  if (!me.activeTenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
          {me.memberships.length > 0 ? (
            <>
              <h1 className="text-lg font-semibold">Choisissez un salon</h1>
              <ul className="space-y-2">
                {me.memberships.map((m) => (
                  <li key={m.tenantId}>
                    <Button variant="secondary" className="w-full justify-between" onClick={() => switchTenant(m.tenantId)}>
                      {m.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Bienvenue {me.user.fullName}</h1>
              <p className="text-sm text-stone-600">Votre compte n’est rattaché à aucun salon. Demandez une invitation au responsable de votre salon.</p>
            </>
          )}
          <Button variant="ghost" onClick={() => logout()}>
            Se déconnecter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SalonProvider>
      <AppShell>{children}</AppShell>
    </SalonProvider>
  );
}
