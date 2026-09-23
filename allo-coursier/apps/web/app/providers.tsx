'use client';

import { ReactNode } from 'react';
import { OfflineBanner, ServiceWorkerRegister } from '@/components/pwa';
import { AuthProvider } from '@/lib/auth';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ServiceWorkerRegister />
      <OfflineBanner />
      {children}
    </AuthProvider>
  );
}
