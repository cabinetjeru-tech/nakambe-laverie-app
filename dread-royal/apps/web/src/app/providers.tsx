'use client';
import { useEffect } from 'react';
import { AuthProvider } from '@/lib/auth';
import { UiProvider } from '@/components/ui';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && !(window as any).Capacitor?.isNativePlatform?.() && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => null);
    }
  }, []);
  return (
    <AuthProvider>
      <UiProvider>{children}</UiProvider>
    </AuthProvider>
  );
}
