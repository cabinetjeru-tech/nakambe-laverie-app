import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { COMPANY } from '@/lib/constants';

const SERVICE_TILES = [
  { emoji: '🧺', label: 'Laver mon linge', href: '/nouvelle-demande?domaine=LAVERIE_PRESSING' },
  { emoji: '👟', label: 'Laver & désinfecter mes chaussures', href: '/nouvelle-demande?domaine=LAVERIE_PRESSING' },
  { emoji: '🚗', label: 'Laver ma voiture', href: '/nouvelle-demande?domaine=AUTO_MOTO' },
  { emoji: '🏍️', label: 'Laver ma moto', href: '/nouvelle-demande?domaine=AUTO_MOTO' },
  { emoji: '🛋️', label: 'Nettoyer mon divan', href: '/nouvelle-demande?domaine=TEXTILE_MAISON' },
  { emoji: '🧼', label: 'Nettoyer tapis/moquette', href: '/nouvelle-demande?domaine=TEXTILE_MAISON' },
  { emoji: '🏠', label: 'Nettoyer mon domicile', href: '/nouvelle-demande?domaine=TEXTILE_MAISON&mode=A_DOMICILE' },
  { emoji: '🏗️', label: 'Nettoyer mon chantier', href: '/nouvelle-demande?domaine=CHANTIER' },
  { emoji: '📦', label: 'Suivre ma commande', href: '/suivi' },
  { emoji: '📅', label: 'Prendre rendez-vous', href: '/nouvelle-demande' },
  { emoji: '📞', label: 'Nous contacter', href: '/#contact' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <section className="bg-gradient-to-b from-brand-blue-light to-white">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <h1 className="text-3xl font-extrabold text-brand-blue sm:text-5xl">{COMPANY.name}</h1>
          <p className="mx-auto mt-3 max-w-xl text-xl font-bold text-brand-gold">« {COMPANY.slogan} »</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/inscription" className="btn-primary text-lg">
              Créer mon compte client
            </Link>
            <Link href="/nouvelle-demande" className="btn-secondary text-lg">
              Faire une demande
            </Link>
            <Link href="/suivi" className="btn-secondary text-lg">
              Suivre ma commande
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Déjà client ?{' '}
            <Link href="/connexion" className="font-semibold text-brand-blue underline">
              Connectez-vous
            </Link>
          </p>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-center text-2xl font-bold text-brand-blue">Que voulez-vous faire aujourd&apos;hui ?</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {SERVICE_TILES.map((tile) => (
            <Link
              key={tile.label}
              href={tile.href}
              className="card flex flex-col items-center gap-2 py-6 text-center transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="text-4xl">{tile.emoji}</span>
              <span className="text-sm font-semibold text-slate-700">{tile.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-brand-blue-light py-12">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-2xl font-bold text-brand-blue">Comment ça marche ?</h2>
          <div className="mt-6 grid gap-6 text-left sm:grid-cols-2 md:grid-cols-4">
            {[
              ['1. Faites votre demande', 'Choisissez le service, la date et l\'adresse.'],
              ['2. Nous intervenons', 'Collecte à domicile ou dépôt à notre siège.'],
              ['3. Traitement suivi', 'Suivez chaque étape en temps réel.'],
              ['4. Livraison & paiement', 'Recevez vos articles et payez facilement.'],
            ].map(([title, desc]) => (
              <div key={title} className="card">
                <div className="font-semibold text-brand-blue">{title}</div>
                <div className="mt-1 text-sm text-slate-600">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
