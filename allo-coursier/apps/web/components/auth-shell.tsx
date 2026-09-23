import Link from 'next/link';
import { ReactNode } from 'react';
import { Logo } from './logo';

export function AuthShell({ title, subtitle, children, footer, suffix }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; suffix?: string }) {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-brand to-brand-dark px-4 py-6">
      <Link href="/" className="mx-auto">
        <Logo light tagline suffix={suffix} />
      </Link>
      <div className="mx-auto mt-8 w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-bold text-brand">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mx-auto mt-5 max-w-md text-center text-sm text-blue-100">{footer}</div>}
    </main>
  );
}
