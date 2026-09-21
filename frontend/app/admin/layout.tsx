'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/use-require-auth';
import { useAuth, UserRole } from '@/lib/auth-context';
import { COMPANY, ROLE_LABELS } from '@/lib/constants';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles?: UserRole[];
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Tableau de bord', icon: '📊', roles: ['ADMIN', 'GERANT'] },
  { href: '/admin/commandes', label: 'Commandes', icon: '📦' },
  { href: '/admin/rendez-vous', label: 'Rendez-vous', icon: '📅', roles: ['ADMIN', 'GERANT', 'RECEPTIONNISTE'] },
  { href: '/admin/mes-missions', label: 'Mes missions', icon: '🚚', roles: ['AGENT_LAVERIE', 'AGENT_NETTOYAGE', 'CHAUFFEUR'] },
  { href: '/admin/clients', label: 'Clients', icon: '👥', roles: ['ADMIN', 'GERANT', 'RECEPTIONNISTE'] },
  { href: '/admin/devis', label: 'Devis', icon: '📝', roles: ['ADMIN', 'GERANT', 'RECEPTIONNISTE'] },
  { href: '/admin/factures', label: 'Factures & paiements', icon: '🧾', roles: ['ADMIN', 'GERANT', 'RECEPTIONNISTE'] },
  { href: '/admin/catalogue', label: 'Services & tarifs', icon: '🏷️', roles: ['ADMIN', 'GERANT'] },
  { href: '/admin/employes', label: 'Employés', icon: '🧑‍💼', roles: ['ADMIN', 'GERANT'] },
  { href: '/admin/stock', label: 'Stock & fournisseurs', icon: '📦', roles: ['ADMIN', 'GERANT'] },
  { href: '/admin/finances', label: 'Finances', icon: '💰', roles: ['ADMIN', 'GERANT'] },
  { href: '/admin/reclamations', label: 'Réclamations & avis', icon: '💬', roles: ['ADMIN', 'GERANT', 'RECEPTIONNISTE'] },
  { href: '/admin/parametres', label: 'Paramètres', icon: '⚙️', roles: ['ADMIN'] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth([
    'ADMIN',
    'GERANT',
    'RECEPTIONNISTE',
    'AGENT_LAVERIE',
    'AGENT_NETTOYAGE',
    'CHAUFFEUR',
  ]);
  const { logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Chargement...</div>;
  }

  const items = NAV.filter((item) => !item.roles || item.roles.includes(user.role));
  const showBack = pathname !== '/admin';

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-brand-blue-light text-brand-blue' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-4">
          <Image src="/icons/icon-192.png" alt={COMPANY.name} width={36} height={36} className="rounded-full" />
          <div className="leading-tight">
            <div className="text-sm font-extrabold text-brand-blue">{COMPANY.name}</div>
            <div className="text-[10px] text-slate-400">Espace professionnel</div>
          </div>
        </div>
        <NavLinks />
        <div className="border-t border-slate-100 p-4">
          <div className="text-sm font-semibold text-slate-800">{user.fullName}</div>
          <div className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</div>
          <button onClick={() => logout()} className="mt-2 text-xs font-semibold text-red-600 hover:underline">
            Déconnexion
          </button>
        </div>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-4">
              <div className="flex items-center gap-2">
                <Image src="/icons/icon-192.png" alt={COMPANY.name} width={32} height={32} className="rounded-full" />
                <div className="text-sm font-extrabold text-brand-blue">{COMPANY.name}</div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Fermer le menu"
                className="rounded-full p-1.5 text-xl text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <NavLinks onNavigate={() => setMenuOpen(false)} />
            <div className="border-t border-slate-100 p-4">
              <div className="text-sm font-semibold text-slate-800">{user.fullName}</div>
              <div className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</div>
              <button onClick={() => logout()} className="mt-2 text-xs font-semibold text-red-600 hover:underline">
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-1">
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
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Ouvrir le menu"
              className="rounded-full p-2 text-xl text-brand-blue hover:bg-brand-blue-light"
            >
              ☰
            </button>
            <div className="text-sm font-extrabold text-brand-blue">{COMPANY.shortName}</div>
          </div>
          <button onClick={() => logout()} className="text-xs font-semibold text-red-600">
            Déconnexion
          </button>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
