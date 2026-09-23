import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Allô-Coursier Livreur', template: '%s · Livreur Allô-Coursier' },
  manifest: '/manifest-livreur.webmanifest',
  appleWebApp: { capable: true, title: 'AC Livreur', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/livreur-192.png' },
};

export const viewport: Viewport = { themeColor: '#0B2A5B' };

export default function DriverRootLayout({ children }: { children: ReactNode }) {
  return children;
}
