import Link from 'next/link';
import { ReactNode } from 'react';
import { FullLogo } from './logo';

export function AuthShell({ title, subtitle, children, footer, suffix }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; suffix?: string }) {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-brand to-brand-dark px-4 py-6">
      <Link href="/" className="mx-auto flex flex-col items-center gap-2 rounded-3xl bg-white px-5 py-3 shadow-xl">
        <FullLogo className="w-52" />
        {suffix && <span className="rounded-md bg-brand-orange px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">{suffix}</span>}
      </Link>
      <div className="mx-auto mt-5 w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-bold text-brand">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mx-auto mt-5 max-w-md text-center text-sm text-blue-100">{footer}</div>}
    </main>
  );
}
