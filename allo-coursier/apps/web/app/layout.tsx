import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Allô-Coursier — Livraison • Courses • Services', template: '%s · Allô-Coursier' },
  description:
    'Livraison de colis et documents, petites courses et achats par un livreur, à Ouagadougou et Tenkodogo. Une entreprise du GROUPE AKAMBI SARL.',
  applicationName: 'Allô-Coursier',
  manifest: '/manifest-client.webmanifest',
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32' }, { url: '/icons/icon-192.png', sizes: '192x192' }],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'Allô-Coursier', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0B2A5B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
