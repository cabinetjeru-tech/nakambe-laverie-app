'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { COMPANY } from '@/lib/constants';

export function SiteHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const showBack = pathname !== '/';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Retour"
              className="-ml-1 rounded-full p-2 text-xl text-brand-blue hover:bg-brand-blue-light"
            >
              ←
            </button>
          )}
          <Link href="/" className="flex items-center gap-2">
            <Image src="/icons/icon-192.png" alt="Nakambé" width={40} height={40} className="rounded-full" />
            <div className="leading-tight">
              <div className="text-lg font-extrabold text-brand-blue">{COMPANY.name}</div>
              <div className="text-[11px] font-medium text-brand-gold">{COMPANY.slogan}</div>
            </div>
          </Link>
        </div>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-700 md:flex">
          <Link href="/suivi" className="hover:text-brand-blue">Suivre ma commande</Link>
          <Link href="/#services" className="hover:text-brand-blue">Nos services</Link>
          <Link href="/#contact" className="hover:text-brand-blue">Contact</Link>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                href={user.role === 'CLIENT' ? '/espace-client' : '/admin'}
                className="btn-secondary !px-4 !py-2 text-sm"
              >
                {user.role === 'CLIENT' ? 'Mon espace' : 'Tableau de bord'}
              </Link>
              <button onClick={() => logout()} className="text-sm font-medium text-slate-500 hover:text-red-600">
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link href="/connexion" className="btn-secondary !px-4 !py-2 text-sm">Connexion</Link>
              <Link href="/inscription" className="btn-primary !px-4 !py-2 text-sm">Créer un compte</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
