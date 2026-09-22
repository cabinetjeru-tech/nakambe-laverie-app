import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { COMPANY } from '@/lib/constants';

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. Vérification à la réception',
    body: (
      <p>
        Nous vous invitons à vérifier vos articles (linge, chaussures, véhicule, tapis...) au moment de la
        livraison ou du retrait, en présence de notre agent si possible. Toute anomalie constatée après coup est
        plus difficile à établir.
      </p>
    ),
  },
  {
    title: '2. Délai pour signaler un problème',
    body: (
      <p>
        Une réclamation (tache non enlevée, dommage, article manquant...) doit être signalée dans les{' '}
        <strong>48 heures</strong> suivant la livraison ou le retrait, via votre espace client (rubrique
        « Réclamations ») ou par WhatsApp/téléphone en précisant votre numéro de commande. Passé ce délai, nous ne
        pourrons plus garantir un traitement dans de bonnes conditions.
      </p>
    ),
  },
  {
    title: '3. Traitement de votre réclamation',
    body: (
      <p>
        Chaque réclamation est examinée sous 48 à 72 heures ouvrées. Selon le cas, nous proposons en priorité une{' '}
        <strong>reprise gratuite</strong> de la prestation (relavage, retouche, second passage) ; si cela n&apos;est
        pas possible ou pas satisfaisant, un <strong>remboursement partiel ou total</strong> de la prestation
        concernée, ou un <strong>avoir</strong> utilisable sur une prochaine commande.
      </p>
    ),
  },
  {
    title: '4. Perte ou dommage sur un article',
    body: (
      <p>
        En cas de perte ou de dommage avéré causé par notre équipe, l&apos;indemnisation est plafonnée à{' '}
        <strong>cinq (5) fois le montant facturé pour la prestation concernée</strong>, sauf valeur particulière
        signalée et acceptée par écrit au moment du dépôt. Merci de nous informer au dépôt de tout article fragile
        ou de valeur.
      </p>
    ),
  },
  {
    title: '5. Cas non couverts',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Usure normale, décoloration ou défaut déjà présent avant le dépôt de l&apos;article.</li>
        <li>Tache ou état signalé à l&apos;avance comme « à risque » et accepté par le client avant traitement.</li>
        <li>Réclamation transmise après le délai de 48 heures.</li>
        <li>Absence de numéro de commande ou de preuve de dépôt permettant d&apos;identifier la prestation.</li>
      </ul>
    ),
  },
  {
    title: '6. Annulation et paiement en ligne',
    body: (
      <p>
        Si vous avez payé en ligne (Mobile Money) avant la prestation et que vous annulez avant notre passage pour
        la collecte, vous êtes intégralement remboursé. Si le traitement a déjà commencé, seule la part non
        encore exécutée peut être remboursée ou reportée sur une autre commande.
      </p>
    ),
  },
  {
    title: '7. Modalités de remboursement',
    body: (
      <p>
        Le remboursement, une fois validé, est effectué par Mobile Money (Orange Money / Moov Money), en espèces
        à notre siège ou dans l&apos;une de nos agences, par chèque, ou sous forme d&apos;avoir sur votre compte
        client — selon ce qui vous convient le mieux — sous un délai de 5 jours ouvrés.
      </p>
    ),
  },
];

export default function PolitiqueRemboursementPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold text-brand-blue sm:text-3xl">Politique de remboursement</h1>
        <p className="mt-2 text-sm text-slate-500">
          {COMPANY.name} s&apos;engage sur la qualité de ses prestations. Voici les règles qui s&apos;appliquent en
          cas d&apos;insatisfaction, de dommage ou de perte.
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
          <h2 className="mb-2 text-base font-bold text-brand-blue">Comment déposer une réclamation ?</h2>
          <p className="text-sm text-slate-700">
            Le plus simple : connectez-vous à votre{' '}
            <Link href="/espace-client" className="font-semibold text-brand-blue underline">
              espace client
            </Link>{' '}
            et ouvrez une réclamation liée à votre commande. Vous pouvez aussi nous écrire directement sur WhatsApp
            ou nous appeler — nos coordonnées sont en bas de page.
          </p>
        </div>

        <p className="mt-8 text-xs text-slate-400">
          Cette politique peut être adaptée au cas par cas par {COMPANY.name} lorsque les circonstances le
          justifient, dans l&apos;intérêt du client comme de l&apos;entreprise.
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
