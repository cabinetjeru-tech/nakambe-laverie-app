'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, useAuth } from '@/lib/auth';

/** Une fois connecté, l'accueil public renvoie vers l'espace adapté au compte. */
export function HomeRedirect() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready || !user) return;
    router.replace(homeFor(user));
  }, [ready, user, router]);
  return null;
}
