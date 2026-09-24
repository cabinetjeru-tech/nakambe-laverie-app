'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { PlatformShell } from '@/components/platform-shell';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Console super administrateur : réservée à l'équipe plateforme, avec ou sans salon actif. */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  const { status, me } = useAuth();
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
  if (!me.platformRole) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-semibold text-stone-900">Accès réservé à l’équipe de la plateforme</p>
        <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
          Retour à l’application
        </Link>
      </div>
    );
  }
  return <PlatformShell>{children}</PlatformShell>;
}
