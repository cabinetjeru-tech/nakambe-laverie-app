import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-5xl font-extrabold text-brand">404</p>
      <p className="text-slate-600">Cette page n’existe pas.</p>
      <Link href="/" className="font-semibold text-brand-light">Retour à l’accueil</Link>
    </main>
  );
}
