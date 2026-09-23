import { ReactNode } from 'react';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-stone-50 px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-lg font-semibold text-brand-700">Gestion de salon</p>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
