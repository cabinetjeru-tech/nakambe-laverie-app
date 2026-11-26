'use client';
import clsx from 'clsx';
import { CloudOff, KeyRound, LogOut, Menu, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { flush, isFlushing, listOps, startAutoSync, subscribe } from '@/lib/offline';
import { NAV } from './nav';
import { Spinner } from './ui';

function SyncIndicator() {
  const [state, setState] = useState({ online: true, pending: 0, conflicts: 0, flushing: false });
  useEffect(() => {
    const update = async () => {
      const ops = await listOps().catch(() => []);
      setState({ online: navigator.onLine, pending: ops.filter((o) => o.status === 'pending').length, conflicts: ops.filter((o) => o.status !== 'pending').length, flushing: isFlushing() });
    };
    startAutoSync();
    update();
    return subscribe(update);
  }, []);
  const tone = !state.online ? 'bg-red-600 text-white' : state.conflicts ? 'bg-amber-500 text-black' : state.pending ? 'bg-amber-300 text-black' : 'bg-emerald-600/90 text-white';
  const label = !state.online ? 'Hors ligne' : state.flushing ? 'Synchronisation…' : state.conflicts ? `${state.conflicts} conflit(s)` : state.pending ? `${state.pending} en attente` : 'Synchronisé';
  return (
    <Link href="/synchronisation/" onClick={() => state.online && flush()} className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', tone)} title="État de la synchronisation">
      {!state.online ? <CloudOff className="h-3.5 w-3.5" /> : <RefreshCw className={clsx('h-3.5 w-3.5', state.flushing && 'animate-spin')} />}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login/');
    else if (user?.mustChangePassword && pathname !== '/mon-compte/') router.replace('/mon-compte/');
  }, [loading, user, router, pathname]);
  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user) return <div className="flex min-h-screen items-center justify-center bg-royal-black"><Spinner label="DREAD ROYAL…" /></div>;

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.perms.length === 0 || can(...i.perms)) })).filter((g) => g.items.length);
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href.replace(/\/$/, '')));

  const sidebar = (
    <nav className="flex h-full flex-col bg-royal-black text-neutral-300">
      <div className="flex items-center gap-3 border-b border-royal-gold/20 px-4 py-4">
        <img src="/logo.jpg" alt="DREAD ROYAL" className="h-12 w-12 rounded-full ring-2 ring-royal-gold/60" />
        <div className="leading-tight">
          <p className="font-display text-lg font-bold gold-text">DREAD ROYAL</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Management System</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((g) => (
          <div key={g.label} className="mb-2">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{g.label}</p>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className={clsx('mb-0.5 flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition', isActive(i.href) ? 'bg-gradient-to-r from-royal-gold/25 to-transparent text-royal-gold ring-1 ring-royal-gold/30' : 'hover:bg-royal-coal hover:text-white')}>
                <i.icon className="h-4 w-4 shrink-0" />{i.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="kente h-1.5 opacity-80" />
      <div className="px-4 py-3 text-[11px] italic text-royal-gold/80">« Votre couronne, votre identité. »</div>
    </nav>
  );

  return (
    <div className="min-h-screen md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">{sidebar}<button onClick={() => setOpen(false)} className="absolute right-3 top-5 text-neutral-400" aria-label="Fermer le menu"><X /></button></aside>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-2.5 backdrop-blur" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
        <button className="rounded-lg p-1.5 hover:bg-neutral-100 md:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>
        <img src="/logo.jpg" alt="" className="h-8 w-8 rounded-full md:hidden" />
        <div className="flex-1" />
        <SyncIndicator />
        <Link href="/mon-compte/" className="hidden items-center gap-2 rounded-lg px-2 py-1 text-right hover:bg-neutral-100 sm:flex" title="Mon compte">
          <div className="leading-tight">
            <p className="text-sm font-semibold">{user.fullName}</p>
            <p className="text-[11px] text-neutral-500">{user.role.name}</p>
          </div>
          <KeyRound className="h-4 w-4 text-neutral-400" />
        </Link>
        <button onClick={() => logout().then(() => router.replace('/login/'))} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-red-600" title="Se déconnecter" aria-label="Se déconnecter"><LogOut className="h-4 w-4" /></button>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-5 sm:px-5" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>{children}</main>
    </div>
  );
}

/** Garde de page : affiche un message si la permission manque (le serveur refuse de toute façon). */
export function RequirePerm({ perms, children }: { perms: string[]; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(...perms)) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Accès réservé : vous n&apos;avez pas l&apos;autorisation de consulter cette page.</div>;
  return <>{children}</>;
}
