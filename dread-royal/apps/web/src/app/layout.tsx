import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'DREAD ROYAL — Management System',
  description: 'Gestion intégrée du salon DREAD ROYAL — Votre couronne, votre identité.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Dread Royal', statusBarStyle: 'black-translucent' },
};
export const viewport: Viewport = { themeColor: '#0B0B0B', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans text-neutral-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
