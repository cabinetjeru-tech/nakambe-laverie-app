import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Salon', template: '%s · Salon' },
  description: 'Gestion du salon : agenda, clients, caisse, stock et rapports.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#6d28d9' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
