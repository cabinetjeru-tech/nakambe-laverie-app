import { Bike, Clock, MapPinned, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import Link from 'next/link';
import { FullLogo, Logo } from '@/components/logo';
import { InstallButton } from '@/components/pwa';
import { SERVICES } from '@/lib/services';
import { HomeRedirect } from './home-redirect';

export default function LandingPage() {
  return (
    <main className="bg-white">
      <HomeRedirect />
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-dark via-brand to-[#123E80] text-white">
        <div className="mx-auto max-w-5xl px-5 pb-16 pt-6">
          <header className="flex items-center justify-between">
            <Logo light />
            <Link href="/connexion" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/20">
              Se connecter
            </Link>
          </header>
          <div className="mt-12 flex flex-col-reverse gap-10 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100 ring-1 ring-white/15">
                <MapPinned className="h-3.5 w-3.5" /> Ouagadougou · Tenkodogo
              </p>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">
                Vos colis et vos courses, livrés <span className="text-brand-green">vite</span> et en toute confiance.
              </h1>
              <p className="mt-4 text-lg text-blue-100">
                Un livreur à moto ou en tricycle récupère, achète et livre pour vous. Prix connu d’avance, suivi en direct, paiement en espèces ou Mobile Money.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/commander" className="rounded-xl bg-brand-green px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-green-900/30 hover:bg-brand-greenDark">
                  Commander une livraison
                </Link>
                <InstallButton variant="secondary" />
              </div>
            </div>
            <div className="mx-auto w-full max-w-xs shrink-0 rounded-3xl bg-white p-5 shadow-2xl lg:max-w-sm">
              <FullLogo className="w-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-bold text-brand">Nos services</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <Link key={s.code} href={`/commander?service=${s.code}`} className="flex gap-4 rounded-2xl border border-slate-200 p-5 transition hover:border-brand-light hover:shadow-card">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${s.color}`}>
                <s.icon className="h-6 w-6" />
              </span>
              <span>
                <span className="block font-bold text-brand">{s.title}</span>
                <span className="text-sm text-slate-600">{s.description}</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-500">Bientôt : livraison de repas de vos restaurants préférés et services aux entreprises.</p>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-14 sm:grid-cols-3">
          {[
            { icon: Smartphone, title: '1. Commandez', text: 'Placez le point de départ et d’arrivée sur la carte, avec un repère. Le prix s’affiche tout de suite.' },
            { icon: Bike, title: '2. Suivez', text: 'Un livreur accepte votre course. Suivez-le en direct et échangez avec lui par messages.' },
            { icon: ShieldCheck, title: '3. Recevez', text: 'Le destinataire donne son code de livraison : le colis est remis à la bonne personne.' },
          ].map((step) => (
            <div key={step.title}>
              <step.icon className="h-8 w-8 text-brand-light" />
              <h3 className="mt-3 font-bold text-brand">{step.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-5 py-14 sm:grid-cols-2">
        <div className="rounded-3xl bg-brand-sky p-6">
          <Wallet className="h-8 w-8 text-brand" />
          <h3 className="mt-3 text-lg font-bold text-brand">Payez comme vous voulez</h3>
          <p className="mt-1 text-sm text-slate-700">Espèces au ramassage ou à la livraison, Orange Money, Moov Money ou portefeuille Allô-Coursier.</p>
        </div>
        <div className="rounded-3xl bg-green-50 p-6">
          <Clock className="h-8 w-8 text-brand-greenDark" />
          <h3 className="mt-3 text-lg font-bold text-brand">Standard, express ou programmée</h3>
          <p className="mt-1 text-sm text-slate-700">Besoin urgent ? Choisissez l’express. Pas pressé ? Programmez la livraison à l’heure qui vous arrange.</p>
        </div>
      </section>

      <section className="bg-brand text-white">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-5 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Vous avez une moto ou un tricycle ?</h2>
            <p className="mt-1 text-blue-100">Devenez livreur Allô-Coursier : missions près de chez vous, gains suivis dans l’application.</p>
          </div>
          <Link href="/livreur/inscription" className="rounded-xl bg-brand-green px-6 py-3 font-bold text-white hover:bg-brand-greenDark">
            Devenir livreur
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-5 py-8 text-sm text-slate-500">
        <FullLogo className="w-48" />
        <p className="mt-3">ALLÔ-COURSIER est un service du GROUPE AKAMBI SARL — Burkina Faso.</p>
        <p className="mt-1">
          <Link href="/suivi" className="underline">Suivre un colis</Link> · <Link href="/connexion" className="underline">Espace client</Link> ·{' '}
          <Link href="/livreur" className="underline">Espace livreur</Link> · <Link href="/partenaires/inscription" className="underline">Devenir partenaire</Link> ·{' '}
          <Link href="/admin" className="underline">Administration</Link>
        </p>
      </footer>
    </main>
  );
}
