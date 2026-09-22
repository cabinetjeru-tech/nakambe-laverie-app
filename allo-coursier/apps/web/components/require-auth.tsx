'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Spinner } from './ui';

/** Réserve une zone aux utilisateurs connectés ayant l'un des rôles (ou la permission) demandés. */
export function RequireAuth({ children, roles, staff, loginPath = '/connexion' }: { children: ReactNode; roles?: string[]; staff?: boolean; loginPath?: string }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const allowed =
    !!user && (!roles || roles.some((r) => user.roles.includes(r))) && (!staff || user.permissions.length > 0);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace(`${loginPath}?next=${encodeURIComponent(pathname + window.location.search)}`);
  }, [ready, user, router, pathname, loginPath]);

  if (!user) return <Spinner />;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold text-brand">Cet espace n’est pas accessible avec votre compte.</p>
        <p className="mt-2 text-sm text-slate-500">Connectez-vous avec le bon compte (client, livreur ou équipe).</p>
      </div>
    );
  }
  return <>{children}</>;
}
