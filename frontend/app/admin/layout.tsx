'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
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

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Chargement...</div>;
  }

  const items = NAV.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-4">
          <Image src="/icons/icon-192.png" alt="Nakambé" width={36} height={36} className="rounded-full" />
          <div className="leading-tight">
            <div className="text-sm font-extrabold text-brand-blue">{COMPANY.name}</div>
            <div className="text-[10px] text-slate-400">Espace professionnel</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
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
        <div className="border-t border-slate-100 p-4">
          <div className="text-sm font-semibold text-slate-800">{user.fullName}</div>
          <div className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</div>
          <button onClick={() => logout()} className="mt-2 text-xs font-semibold text-red-600 hover:underline">
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="text-sm font-extrabold text-brand-blue">{COMPANY.name}</div>
          <button onClick={() => logout()} className="text-xs font-semibold text-red-600">
            Déconnexion
          </button>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
