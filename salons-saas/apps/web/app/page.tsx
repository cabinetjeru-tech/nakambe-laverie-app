'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { status, me } = useAuth();
  const router = useRouter();
  useEffect(() => {
    // L'équipe plateforme sans salon actif arrive directement sur la console.
    if (status === 'authenticated') router.replace(me && !me.activeTenant && me.platformRole ? '/plateforme' : '/tableau-de-bord');
    if (status === 'anonymous') router.replace('/connexion');
  }, [status, me, router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}
