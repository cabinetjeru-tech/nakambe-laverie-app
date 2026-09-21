'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth, UserRole, getRoleHomePath } from './auth-context';

export function useRequireAuth(allowedRoles?: UserRole[]) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/connexion?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace(getRoleHomePath(user.role));
    }
  }, [user, loading, allowedRoles, router, pathname]);

  return { user, loading };
}
