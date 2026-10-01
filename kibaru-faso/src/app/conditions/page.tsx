import type { Metadata } from "next";
import Link from "next/link";
import { ESSAI_HEURES } from "@/lib/abonnement";
import { CONTACT } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Conditions d'utilisation et de vente — PÉDAGOGUE.IA",
  description: "Conditions générales d'utilisation et de vente, protection des données personnelles et mentions légales de PÉDAGOGUE.IA.",
};

const MAJ = "29 septembre 2026";

const SECTIONS: [string, string, React.ReactNode][] = [
  [
    "editeur",
    "1. Éditeur du service",
    <>
      <p>
        PÉDAGOGUE.IA est un service en ligne édité par <strong>{CONTACT.entreprise}</strong>, {CONTACT.ville}. Contact : {CONTACT.telephone} ·{" "}
        {CONTACT.email}.
      </p>
      <p>Le site est hébergé par Vercel Inc. (États-Unis) ; les comptes et les données sont stockés chez Supabase (serveurs situés dans l&apos;Union européenne).</p>
    </>,
  ],
  [
    "service",
    "2. Le service",
    <>
      <p>
        PÉDAGOGUE.IA aide les enseignants, du préscolaire au secondaire, à préparer leurs cours : fiches pédagogiques, exercices, devoirs avec corrigés et barèmes,
        remédiation, progressions. Les contenus sont produits par une intelligence artificielle à partir des demandes de l&apos;enseignant.
      </p>
      <p>
        <strong>L&apos;enseignant reste responsable de ce qu&apos;il utilise en classe.</strong> Les contenus générés peuvent comporter des erreurs ou ne
        pas correspondre exactement au programme officiel en vigueur : ils doivent être relus et adaptés avant usage. PÉDAGOGUE.IA n&apos;est pas un
        service du ministère de l&apos;Éducation.
      </p>
    </>,
  ],
  [
    "compte",
    "3. Compte enseignant",
    <>
      <p>
        L&apos;accès nécessite un compte créé avec une adresse e-mail et un mot de passe. Le compte est personnel : il ne doit pas être partagé. Les
        informations fournies doivent être exactes.
      </p>
      <p>
        {CONTACT.entreprise} peut suspendre un compte en cas d&apos;usage abusif (partage du compte, revente des contenus, tentative de contournement des
        limites, usage contraire à la loi), après avoir, sauf urgence, contacté l&apos;enseignant.
      </p>
    </>,
  ],
  [
    "vente",
    "4. Essai gratuit, formules et paiement",
    <>
      <p>
        Chaque nouveau compte bénéficie d&apos;un <strong>essai gratuit de {ESSAI_HEURES} heures</strong>, sans paiement ni engagement.
      </p>
      <p>
        Les formules (pass journalier, mensuel, annuel) et leurs prix en FCFA sont affichés dans l&apos;application au moment de l&apos;achat. Le paiement
        se fait par mobile money ou carte via CinetPay ; {CONTACT.entreprise} n&apos;a jamais accès à votre code secret mobile money ni à votre carte.
      </p>
      <p>
        L&apos;accès est ouvert dès la confirmation du paiement, pour la durée de la formule. Un nouveau paiement effectué avant la fin prolonge
        l&apos;abonnement sans perte de jours. <strong>Il n&apos;y a pas de renouvellement automatique</strong> : aucun montant n&apos;est prélevé sans
        action de votre part. Un reçu est disponible dans « Mon compte ».
      </p>
      <p>
        Pour garantir la qualité du service à tous, chaque formule comprend un nombre de générations par jour, indiqué dans « Mon compte ». Les simples
        questions de précision sur une préparation ne sont pas décomptées.
      </p>
      <p>
        Les codes promo sont utilisables une fois par compte, dans la limite de leur validité. L&apos;accès étant fourni immédiatement, un paiement
        n&apos;est pas remboursable, sauf en cas de double débit ou si un incident technique imputable au service vous a empêché d&apos;y accéder : dans ce
        cas, contactez-nous dans les 7 jours avec le numéro du reçu.
      </p>
    </>,
  ],
  [
    "parrainage",
    "5. Parrainage",
    <>
      <p>
        Chaque enseignant dispose d&apos;un lien de parrainage. Un collègue qui s&apos;inscrit par ce lien devient son filleul. Le parrain reçoit une
        commission sur chaque paiement réussi de ses filleuls, au taux affiché dans « Mon compte », à condition d&apos;avoir lui-même un abonnement actif
        au moment du paiement.
      </p>
      <p>
        Les commissions sont versées par {CONTACT.entreprise} par mobile money, au numéro indiqué dans le profil du parrain. Les inscriptions fictives ou
        l&apos;auto-parrainage entraînent l&apos;annulation des commissions concernées.
      </p>
    </>,
  ],
  [
    "donnees",
    "6. Données personnelles",
    <>
      <p>
        Nous collectons : votre e-mail, et, si vous les renseignez, votre nom, téléphone, établissement et ville ; vos préparations enregistrées ; vos
        paiements ; le nombre de générations et leur coût technique. Ces données servent uniquement à fournir le service, à gérer les abonnements, les
        paiements et le parrainage, et à vous contacter à ce sujet.
      </p>
      <p>
        Vos demandes sont transmises à notre fournisseur d&apos;intelligence artificielle (Anthropic) pour produire les réponses. Elles ne sont pas
        utilisées pour entraîner ses modèles. N&apos;y indiquez pas d&apos;informations personnelles sur vos élèves (noms, notes nominatives, situation
        familiale).
      </p>
      <p>
        Vos données ne sont ni vendues ni cédées. Elles sont conservées tant que votre compte existe, puis supprimées, à l&apos;exception des informations
        de paiement que la loi impose de conserver.
      </p>
      <p>
        Conformément à la loi burkinabè sur la protection des données à caractère personnel, vous pouvez demander l&apos;accès à vos données, leur
        rectification ou la suppression de votre compte en écrivant à {CONTACT.email}.
      </p>
    </>,
  ],
  [
    "propriete",
    "7. Propriété des contenus",
    <>
      <p>
        Les préparations générées à votre demande vous appartiennent : vous pouvez les imprimer, les modifier et les utiliser librement avec vos élèves et
        vos collègues. Le logiciel, la marque PÉDAGOGUE.IA et la présentation du site restent la propriété de {CONTACT.entreprise}.
      </p>
    </>,
  ],
  [
    "disponibilite",
    "8. Disponibilité et responsabilité",
    <>
      <p>
        Nous faisons le nécessaire pour que le service soit disponible en permanence, sans pouvoir le garantir (maintenance, panne d&apos;un fournisseur,
        réseau). La responsabilité de {CONTACT.entreprise} est limitée au montant payé pour la période en cours.
      </p>
    </>,
  ],
  [
    "modification",
    "9. Modification et droit applicable",
    <>
      <p>
        Ces conditions peuvent évoluer ; la version en vigueur est celle publiée sur cette page. Les prix d&apos;un abonnement déjà payé ne changent pas.
      </p>
      <p>Ces conditions sont régies par le droit burkinabè. En cas de litige, une solution amiable est recherchée avant toute action.</p>
    </>,
  ],
];

export default function Conditions() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-ink">
      <Link href="/" className="font-semibold text-faso underline underline-offset-2 print:hidden">
        ← Retour à PÉDAGOGUE.IA
      </Link>
      <h1 className="mt-4 text-2xl font-extrabold text-faso-dark">Conditions d&apos;utilisation et de vente</h1>
      <p className="text-sm text-muted">Protection des données et mentions légales · mise à jour le {MAJ}</p>

      <nav className="mt-5 rounded-lg border border-line bg-surface p-4 text-sm print:hidden">
        <ul className="grid gap-1 sm:grid-cols-2">
          {SECTIONS.map(([id, titre]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-faso underline underline-offset-2">
                {titre}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {SECTIONS.map(([id, titre, contenu]) => (
        <section key={id} id={id} className="mt-7 scroll-mt-4 space-y-2 leading-relaxed">
          <h2 className="text-lg font-bold text-faso-dark">{titre}</h2>
          {contenu}
        </section>
      ))}
    </main>
  );
}
