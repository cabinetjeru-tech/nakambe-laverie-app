/** Campagne de lancement : liens et messages prêts à partager (WhatsApp, Facebook, SMS). */

/** Adresse publique du site (NEXT_PUBLIC_APP_URL quand un nom de domaine est branché). */
export const SITE = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://pedagogue-ia.vercel.app").replace(/\/$/, "");

export function lienDecouvrir(parrain?: string | null, origin = SITE): string {
  return `${origin}/decouvrir${parrain ? `?parrain=${parrain}` : ""}`;
}

export type MessageCampagne = { titre: string; texte: string };

export function messagesCampagne(lien: string, promo?: { code: string; remise_pct: number } | null): MessageCampagne[] {
  const offre = promo ? `\n🎟️ Code *${promo.code}* : -${promo.remise_pct} % sur votre premier abonnement.` : "";
  return [
    {
      titre: "Invitation courte (groupes WhatsApp d'enseignants)",
      texte: `📚 *PÉDAGOGUE.IA* — l'assistant pédagogique des enseignants du Burkina Faso 🇧🇫
Fiches de cours, devoirs avec corrigés et barèmes, remédiation, progressions : prêts en quelques minutes, du préscolaire à la Terminale.
🎁 24 h d'essai gratuit, sans paiement.${offre}
👉 ${lien}`,
    },
    {
      titre: "Message détaillé (collègues, direction, CAP)",
      texte: `Chers collègues,
Je vous recommande *PÉDAGOGUE.IA*, un assistant conçu pour les enseignants du Burkina Faso, du préscolaire au secondaire :
✅ fiches pédagogiques complètes avec déroulement minuté ;
✅ devoirs et interrogations avec sujet, corrigé et barème (versions A/B/C) ;
✅ activités de remédiation et progressions annuelles ;
✅ téléchargement en PDF ou Word, prêt à imprimer.
Il distingue toujours ce qui vient des documents officiels de ce qui est une proposition, et vérifie les calculs et les durées.
🎁 Essai gratuit 24 h, puis 300 FCFA la journée, 3 000 FCFA/mois ou 30 000 FCFA/an — 10 mois payés pour 12 (Orange Money, Moov Money).${offre}
Inscription : ${lien}`,
    },
    {
      titre: "Parrainage (pour les enseignants abonnés)",
      texte: `💰 Enseignant(e) abonné(e) à PÉDAGOGUE.IA ? Partagez votre lien de parrainage : vous touchez *20 %* de chaque abonnement de vos filleuls, chaque mois ou chaque année.
Votre lien est dans « Mon compte ». Découvrir : ${lien}`,
    },
    {
      titre: "Statut / publication Facebook",
      texte: `🇧🇫 Enseignants du Burkina Faso : gagnez des heures chaque semaine !
PÉDAGOGUE.IA prépare vos fiches, devoirs corrigés, remédiations et progressions, du préscolaire à la Terminale.
24 h gratuites pour essayer 👉 ${lien}${offre}
#Enseignants #BurkinaFaso #Éducation #PédagogueIA`,
    },
    {
      titre: "SMS (160 caractères)",
      texte: `PEDAGOGUE.IA: fiches, devoirs corriges, remediation pour enseignants BF. 24h gratuites: ${lien.replace(/^https:\/\//, "")}`,
    },
  ];
}
