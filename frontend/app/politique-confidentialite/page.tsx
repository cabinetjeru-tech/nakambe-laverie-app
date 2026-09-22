import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { COMPANY } from '@/lib/constants';

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. Quelles données nous collectons',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Identité et contact : nom complet, numéro de téléphone, email (facultatif), adresse ou quartier.</li>
        <li>
          Position GPS : uniquement lorsque vous l&apos;autorisez, pour localiser une collecte/livraison ou
          suivre en direct le tricycle chargé de votre commande.
        </li>
        <li>Historique de commandes, devis, factures et paiements (montants, méthode, référence de transaction).</li>
        <li>Messages échangés avec notre assistante en ligne, si vous l&apos;utilisez.</li>
      </ul>
    ),
  },
  {
    title: '2. Pourquoi nous les utilisons',
    body: (
      <p>
        Uniquement pour assurer le service : traiter vos demandes, calculer vos devis, organiser les collectes et
        livraisons, vous tenir informé de l&apos;avancement, émettre vos factures/reçus, et répondre à vos
        questions ou réclamations. Nous n&apos;utilisons pas vos données à des fins publicitaires et nous ne les
        vendons à personne.
      </p>
    ),
  },
  {
    title: '3. Qui y a accès',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Notre équipe (réception, agents, chauffeurs, gérance), uniquement dans le cadre de votre commande.</li>
        <li>
          Nos prestataires de paiement Mobile Money (CinetPay, LigdiCash) pour traiter une transaction que vous
          initiez vous-même — nous ne recevons jamais votre code secret Mobile Money.
        </li>
        <li>
          Anthropic (fournisseur de l&apos;intelligence artificielle de notre assistante en ligne), uniquement le
          texte de votre conversation avec elle si vous choisissez de l&apos;utiliser — jamais vos données de
          commande ou de paiement.
        </li>
      </ul>
    ),
  },
  {
    title: '4. Combien de temps nous les gardons',
    body: (
      <p>
        Vos données sont conservées tant que votre compte client est actif, puis pendant la durée exigée par la
        réglementation comptable et commerciale en vigueur. Les conversations avec l&apos;assistante en ligne ne
        sont pas conservées par nos soins au-delà du temps nécessaire pour générer une réponse.
      </p>
    ),
  },
  {
    title: '5. Sécurité',
    body: (
      <p>
        Vos mots de passe sont stockés de façon chiffrée (jamais en clair) et l&apos;accès à vos informations dans
        nos outils internes est limité selon le rôle de chaque employé (un chauffeur ne voit par exemple pas vos
        factures).
      </p>
    ),
  },
  {
    title: '6. Vos droits',
    body: (
      <p>
        Vous pouvez à tout moment consulter et corriger vos informations depuis votre espace client, ou nous
        demander l&apos;accès, la correction ou la suppression de vos données en nous contactant par WhatsApp,
        téléphone, ou depuis la rubrique « Réclamations » de votre espace client.
      </p>
    ),
  },
  {
    title: '7. Application installée sur votre téléphone (PWA)',
    body: (
      <p>
        L&apos;application peut fonctionner brièvement hors connexion grâce à un cache technique sur votre
        téléphone. Ce cache ne contient aucune donnée personnelle : il ne sert qu&apos;à afficher plus vite les
        pages déjà visitées.
      </p>
    ),
  },
];

export default function PolitiqueConfidentialitePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold text-brand-blue sm:text-3xl">Politique de confidentialité</h1>
        <p className="mt-2 text-sm text-slate-500">
          {COMPANY.name} respecte votre vie privée. Voici quelles données nous collectons, pourquoi, et comment
          vous pouvez en garder le contrôle.
        </p>

        <div className="mt-8 flex flex-col gap-6">
          {SECTIONS.map((s) => (
            <div key={s.title} className="card">
              <h2 className="mb-2 text-base font-bold text-brand-blue">{s.title}</h2>
              <div className="text-sm leading-relaxed text-slate-600">{s.body}</div>
            </div>
          ))}
        </div>

        <div className="card mt-6 bg-brand-blue-light">
          <h2 className="mb-2 text-base font-bold text-brand-blue">Une question sur vos données ?</h2>
          <p className="text-sm text-slate-700">
            Écrivez-nous sur WhatsApp, appelez-nous, ou passez par la rubrique « Réclamations » de votre{' '}
            <Link href="/espace-client" className="font-semibold text-brand-blue underline">
              espace client
            </Link>
            . Nos coordonnées sont en bas de page.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
