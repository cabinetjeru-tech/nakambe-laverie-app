/**
 * Modèles des e-mails automatiques (HTML simple compatible avec les messageries mobiles, et version texte).
 * Fonctions pures, sans accès au réseau : testables.
 */
import { formatDate, formatFcfa } from "../abonnement";
import { CONTACT } from "../contact";

export type Email = { sujet: string; html: string; texte: string };

type Bloc = { titre: string; paragraphes: string[]; bouton?: { libelle: string; lien: string }; apres?: string[] };

export function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** « **gras** » → <strong> (après échappement) ; retiré dans la version texte. */
function enHtml(s: string): string {
  return echapper(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
function enTexte(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1");
}

function composer(sujet: string, b: Bloc): Email {
  const p = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#17202a">${enHtml(s)}</p>`;
  const bouton = b.bouton
    ? `<p style="margin:22px 0"><a href="${echapper(b.bouton.lien)}" style="display:inline-block;background:#00843d;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;font-size:15px">${echapper(b.bouton.libelle)}</a></p>`
    : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(sujet)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f5"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e6ea">
<tr><td style="background:#00843d;padding:16px 22px;color:#ffffff;font-size:20px;font-weight:bold">PÉDAGOGUE.IA</td></tr>
<tr><td style="padding:22px">
<h1 style="margin:0 0 16px;font-size:19px;color:#00592a">${enHtml(b.titre)}</h1>
${b.paragraphes.map(p).join("\n")}${bouton}${(b.apres ?? []).map(p).join("\n")}
</td></tr>
<tr><td style="padding:14px 22px;border-top:1px solid #e2e6ea;font-size:12px;line-height:1.5;color:#5b6573">
${echapper(CONTACT.entreprise)}, ${echapper(CONTACT.ville)} · ${echapper(CONTACT.telephone)} · <a href="mailto:${CONTACT.email}" style="color:#00843d">${CONTACT.email}</a><br>
Vous recevez ce message parce que vous avez un compte PÉDAGOGUE.IA.
</td></tr></table></td></tr></table></body></html>`;
  const texte = [
    enTexte(b.titre),
    "",
    ...b.paragraphes.map(enTexte).flatMap((x) => [x, ""]),
    ...(b.bouton ? [`${b.bouton.libelle} : ${b.bouton.lien}`, ""] : []),
    ...(b.apres ?? []).map(enTexte).flatMap((x) => [x, ""]),
    "—",
    `PÉDAGOGUE.IA · ${CONTACT.entreprise}, ${CONTACT.ville} · ${CONTACT.telephone} · ${CONTACT.email}`,
  ].join("\n");
  return { sujet, html, texte };
}

const salut = (nom: string | null | undefined) => (nom?.trim() ? `Bonjour ${nom.trim()},` : "Bonjour,");

export function emailBienvenue(o: { nom?: string | null; site: string; lienParrainage: string; essaiFin?: Date | null }): Email {
  return composer("Bienvenue sur PÉDAGOGUE.IA : votre essai gratuit a commencé", {
    titre: "Bienvenue sur PÉDAGOGUE.IA 🎉",
    paragraphes: [
      salut(o.nom),
      o.essaiFin
        ? `Votre espace enseignant est prêt. Une **fiche complète vous est offerte** (à utiliser avant le ${formatDate(o.essaiFin)}) : essayez PÉDAGOGUE.IA sur votre prochaine leçon.`
        : "Votre espace enseignant est prêt : tous les générateurs sont ouverts.",
      "Pour bien commencer, demandez par exemple : « Fiche pédagogique de SVT, 4e, la digestion, 55 minutes » ou « Devoir de mathématiques, 3e, théorème de Pythagore, avec corrigé et barème ».",
      "Chaque préparation se télécharge en PDF ou en Word, prête à imprimer.",
    ],
    bouton: { libelle: "Ouvrir PÉDAGOGUE.IA", lien: o.site },
    apres: [
      `Vos collègues aussi peuvent en profiter : partagez votre lien de parrainage ${o.lienParrainage} et touchez une commission sur chacun de leurs abonnements.`,
    ],
  });
}

export function emailPaiement(o: { nom?: string | null; formule: string; montant: number; fin: Date | null; lienRecu: string; site: string }): Email {
  return composer(`Paiement reçu : ${formatFcfa(o.montant)} — PÉDAGOGUE.IA`, {
    titre: "Merci, votre paiement est confirmé ✅",
    paragraphes: [
      salut(o.nom),
      `Nous avons bien reçu **${formatFcfa(o.montant)}** pour la formule **${o.formule}**.`,
      o.fin ? `Votre accès est actif jusqu'au **${formatDate(o.fin)}**.` : "Votre accès est actif.",
    ],
    bouton: { libelle: "Voir mon reçu", lien: o.lienRecu },
    apres: [`Bonnes préparations ! ${o.site}`],
  });
}

export function emailCommission(o: { nom?: string | null; montant: number; filleul: string; totalDu: number; site: string }): Email {
  return composer(`Vous avez gagné ${formatFcfa(o.montant)} de commission — PÉDAGOGUE.IA`, {
    titre: "Nouvelle commission de parrainage 💰",
    paragraphes: [
      salut(o.nom),
      `Votre filleul **${o.filleul}** vient de payer son abonnement : vous gagnez **${formatFcfa(o.montant)}**.`,
      `Total de vos commissions à recevoir : **${formatFcfa(o.totalDu)}**. Elles sont versées par mobile money au numéro de votre profil : vérifiez qu'il est à jour dans « Mon compte ».`,
    ],
    bouton: { libelle: "Voir mon parrainage", lien: o.site },
  });
}

export function emailFinEssai(o: { nom?: string | null; site: string; prix: { journalier?: number | null; mensuel: number; annuel: number }; promo?: { code: string; remise_pct: number } | null }): Email {
  const offres = [
    o.prix.journalier ? `${formatFcfa(o.prix.journalier)} la journée` : null,
    `${formatFcfa(o.prix.mensuel)} le mois`,
    `${formatFcfa(o.prix.annuel)} l'année`,
  ]
    .filter(Boolean)
    .join(", ");
  return composer("Votre essai gratuit PÉDAGOGUE.IA est terminé", {
    titre: "Votre essai gratuit est terminé",
    paragraphes: [
      salut(o.nom),
      "Merci d'avoir essayé PÉDAGOGUE.IA ! Vos préparations restent enregistrées dans votre espace.",
      `Pour continuer à préparer vos cours en quelques minutes : ${offres}, par Orange Money, Moov Money ou carte.`,
      ...(o.promo ? [`🎟️ Avec le code **${o.promo.code}**, profitez de **-${o.promo.remise_pct} %** sur votre abonnement.`] : []),
    ],
    bouton: { libelle: "M'abonner", lien: o.site },
  });
}

export function emailApresFicheOfferte(o: { nom?: string | null; site: string; prix: { journalier?: number | null; mensuel: number; annuel: number }; promo?: { code: string; remise_pct: number } | null }): Email {
  return composer("Votre fiche PÉDAGOGUE.IA est prête : et la suivante ?", {
    titre: "Votre fiche offerte est prête 🎉",
    paragraphes: [
      salut(o.nom),
      "Merci d'avoir essayé PÉDAGOGUE.IA ! Votre fiche est enregistrée dans « Mes préparations » : vous pouvez la télécharger en PDF ou en Word et l'imprimer.",
      "Pour préparer toutes vos leçons de l'année avec la même qualité :",
      ...(o.prix.journalier ? [`• **Pass 24 h : ${formatFcfa(o.prix.journalier)}**, pour un besoin ponctuel. Payé dans les 7 jours avant un abonnement annuel, il est **déduit de l'annuel**.`] : []),
      `• **Annuel : ${formatFcfa(o.prix.annuel)}**, soit ${formatFcfa(Math.round(o.prix.annuel / 12))} par mois : la formule la plus avantageuse.`,
      `• Mensuel : ${formatFcfa(o.prix.mensuel)}.`,
      ...(o.promo ? [`🎟️ Avec le code **${o.promo.code}**, profitez de **-${o.promo.remise_pct} %**.`] : []),
      "Paiement par Orange Money, Moov Money ou carte bancaire.",
    ],
    bouton: { libelle: "Choisir ma formule", lien: o.site },
  });
}

export function emailRappelFin(o: { nom?: string | null; fin: Date; jours: number; site: string }): Email {
  const quand = o.jours <= 1 ? "demain" : `dans ${o.jours} jours`;
  return composer(`Votre abonnement PÉDAGOGUE.IA se termine ${quand}`, {
    titre: `Votre abonnement se termine ${quand}`,
    paragraphes: [
      salut(o.nom),
      `Votre accès à PÉDAGOGUE.IA prend fin le **${formatDate(o.fin)}**.`,
      "Renouvelez dès maintenant : les jours restants ne sont pas perdus, le nouvel abonnement commence à la fin de l'actuel.",
    ],
    bouton: { libelle: "Renouveler mon abonnement", lien: o.site },
  });
}

export function emailAdminPaiement(o: { email: string; nom?: string | null; formule: string; montant: number; transaction: string; lienAdmin: string }): Email {
  return composer(`💵 Nouveau paiement : ${formatFcfa(o.montant)} (${o.formule})`, {
    titre: "Nouveau paiement reçu",
    paragraphes: [`**${o.nom || o.email}** (${o.email}) a payé **${formatFcfa(o.montant)}** pour la formule **${o.formule}**.`, `Transaction : ${o.transaction}`],
    bouton: { libelle: "Ouvrir l'administration", lien: o.lienAdmin },
  });
}

export function emailTest(site: string): Email {
  return composer("Test d'envoi — PÉDAGOGUE.IA", {
    titre: "Les e-mails automatiques fonctionnent ✅",
    paragraphes: ["Ce message confirme que l'envoi d'e-mails de PÉDAGOGUE.IA est bien configuré."],
    bouton: { libelle: "Ouvrir PÉDAGOGUE.IA", lien: site },
  });
}
