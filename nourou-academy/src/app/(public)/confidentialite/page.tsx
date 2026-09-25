import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default async function PrivacyPage() {
  const b = await getBrand();
  return (
    <article className="prose-nga mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-navy">Politique de confidentialité</h1>
      <p className="text-sm text-muted">Modèle à faire valider par un juriste et à compléter (coordonnées du responsable, déclaration auprès de l'autorité compétente, par ex. la CIL au Burkina Faso ou l'APDP au Bénin).</p>
      <h2>Responsable du traitement</h2>
      <p>{b.promoter}, exploitant de la plateforme {b.name} — {b.address} — {b.email}.</p>
      <h2>Données collectées</h2>
      <ul>
        <li>Compte : nom, email, téléphone (facultatif), pays, ville, niveau déclaré.</li>
        <li>Apprentissage : inscriptions, progression, notes personnelles, résultats, devoirs, certificats, présences aux classes virtuelles.</li>
        <li>Tuteur IA : messages échangés, pièces jointes envoyées (analysées puis non conservées), mesures de consommation (sans contenu).</li>
        <li>Paiements : commandes, montants, références de transaction. Aucun code Mobile Money ni numéro de carte n'est stocké.</li>
        <li>Techniques : journal de connexion (adresse IP, navigateur) à des fins de sécurité.</li>
      </ul>
      <h2>Finalités et bases légales</h2>
      <ul>
        <li>Fournir les formations et le suivi pédagogique (exécution du contrat).</li>
        <li>Facturation et obligations comptables (obligation légale).</li>
        <li>Sécurité, prévention de la fraude (intérêt légitime).</li>
        <li>Communications commerciales, uniquement avec votre consentement.</li>
      </ul>
      <h2>Intelligence artificielle</h2>
      <p>Pour répondre à vos questions, le contenu de vos messages et des extraits de cours sont transmis au fournisseur d'IA configuré (par exemple Anthropic ou OpenAI) via leur API professionnelle. Ne transmettez pas d'informations sensibles au tuteur. Les certificats ne sont jamais attribués par l'IA seule.</p>
      <h2>Destinataires et transferts</h2>
      <p>Prestataires techniques (hébergement, stockage, email, paiement, IA) agissant pour notre compte. Certains peuvent être situés hors de votre pays : des garanties contractuelles appropriées doivent être mises en place.</p>
      <h2>Durées de conservation</h2>
      <p>Données de compte : durée de l'inscription puis suppression ou anonymisation. Factures : durée légale comptable. Journaux techniques : 12 mois maximum.</p>
      <h2>Vos droits</h2>
      <p>Accès, rectification, opposition, effacement et portabilité : depuis votre profil (« Télécharger mes données », « Supprimer mon compte ») ou en écrivant à {b.email}. Vous pouvez également saisir l'autorité de protection des données de votre pays.</p>
      <h2>Cookies</h2>
      <p>Uniquement des cookies strictement nécessaires (session de connexion, préférence de mode faible consommation). Aucun cookie publicitaire.</p>
    </article>
  );
}
