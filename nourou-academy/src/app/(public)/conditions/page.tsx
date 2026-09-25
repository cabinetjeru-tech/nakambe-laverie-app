import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default async function TermsPage() {
  const b = await getBrand();
  return (
    <article className="prose-nga mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-navy">Conditions générales d'utilisation et de vente</h1>
      <p className="text-sm text-muted">Modèle à adapter et faire valider juridiquement avant la mise en production.</p>
      <h2>Objet</h2>
      <p>Les présentes conditions encadrent l'utilisation de la plateforme {b.name}, éditée par {b.promoter}, et l'achat de formations en ligne.</p>
      <h2>Compte</h2>
      <p>Le compte est personnel. L'utilisateur est responsable de la confidentialité de son mot de passe. Le partage d'accès est interdit.</p>
      <h2>Offres et prix</h2>
      <p>Les prix sont indiqués en francs CFA (XOF), toutes taxes applicables comprises selon le régime fiscal de l'éditeur. L'accès est activé après confirmation effective du paiement par le prestataire.</p>
      <h2>Abonnements</h2>
      <p>Les abonnements donnent accès, pendant leur durée, aux formations marquées comme incluses. Ils ne sont pas reconduits automatiquement.</p>
      <h2>Remboursements</h2>
      <p>Une demande de remboursement peut être formulée depuis l'espace « Paiements ». Elle est étudiée au cas par cas (par exemple : problème technique empêchant l'accès, double paiement). Le remboursement, s'il est accordé, entraîne la suppression de l'accès correspondant.</p>
      <h2>Propriété intellectuelle</h2>
      <p>Les contenus pédagogiques sont protégés. Leur reproduction ou diffusion hors de la plateforme est interdite, sauf supports expressément marqués comme téléchargeables pour un usage personnel.</p>
      <h2>Certificats</h2>
      <p>Les certificats attestent du suivi et de la validation d'une formation selon les critères définis par le formateur. Ils ne constituent pas des diplômes ou titres reconnus par l'État, sauf mention contraire expresse fondée sur une accréditation officielle.</p>
      <h2>Tuteur IA</h2>
      <p>Le tuteur IA est un outil d'aide à l'apprentissage. Ses réponses peuvent comporter des erreurs et ne remplacent pas l'avis d'un professionnel. Tout usage visant à contourner les évaluations est interdit.</p>
      <h2>Contact</h2>
      <p>{b.email} — {b.phone}</p>
    </article>
  );
}
