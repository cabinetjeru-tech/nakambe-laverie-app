import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Allô-Coursier Partenaire', template: '%s · Partenaire Allô-Coursier' },
  manifest: '/manifest-commercant.webmanifest',
  appleWebApp: { capable: true, title: 'AC Partenaire', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/partenaire-192.png' },
};

export const viewport: Viewport = { themeColor: '#0B2A5B' };

export default function MerchantRootLayout({ children }: { children: ReactNode }) {
  return children;
}
