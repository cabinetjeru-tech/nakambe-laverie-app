import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { QueryProvider } from '@/lib/query-provider';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { AssistantWidget } from '@/components/assistant-widget';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'NOUVELLE LAVERIE AFRICAINE',
  description: "Laverie, pressing, lavage auto/moto et nettoyage professionnel à Tenkodogo. Laverie express et digitale.",
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f4a9c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} font-sans antialiased`}>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
        <WhatsAppButton />
        <AssistantWidget />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
