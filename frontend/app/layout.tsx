import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { QueryProvider } from '@/lib/query-provider';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'NAKAMBÉ Laverie Exprès et Digitale',
  description: "Laverie, pressing, lavage auto/moto et nettoyage professionnel à Tenkodogo. La propreté qui vient à vous.",
  manifest: '/manifest.webmanifest',
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
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
