/**
 * Abonnements : règles de calcul, sans accès à la base (testables).
 * Un abonnement payé ou accordé avant la fin du précédent le prolonge : l'enseignant ne perd aucun jour.
 */

export type Formule = {
  id: string;
  libelle: string;
  prix_fcfa: number;
  duree_jours: number;
  active: boolean;
  ordre: number;
  /** Générations par jour (null = illimité). */
  quota_jour?: number | null;
  /** Générations sur toute la durée de la formule (null = pas de plafond de période). Le mode expert compte double. */
  quota_periode?: number | null;
};
export type Periode = { debut: Date; fin: Date };

const JOUR = 86_400_000;

/** Nouvelle période : elle commence maintenant, ou à la fin de l'abonnement en cours s'il n'est pas terminé. */
export function nouvellePeriode(maintenant: Date, finActuelle: Date | null, jours: number): Periode {
  const debut = finActuelle && finActuelle > maintenant ? finActuelle : maintenant;
  return { debut, fin: new Date(debut.getTime() + jours * JOUR) };
}

/** Fin la plus lointaine parmi les abonnements (null s'il n'y en a aucun). */
export function finAbonnement(abonnements: { fin: string | Date }[]): Date | null {
  let max: Date | null = null;
  for (const a of abonnements) {
    const d = new Date(a.fin);
    if (!Number.isNaN(d.getTime()) && (!max || d > max)) max = d;
  }
  return max;
}

export function joursRestants(fin: Date | null, maintenant: Date): number {
  return fin && fin > maintenant ? Math.ceil((fin.getTime() - maintenant.getTime()) / JOUR) : 0;
}

/** Mobile money (XOF) : montant entier, multiple de 5, au moins 100 FCFA. */
export function prixValide(prix: number): boolean {
  return Number.isInteger(prix) && prix >= 100 && prix % 5 === 0 && prix <= 10_000_000;
}

export function formatFcfa(n: number): string {
  return `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
}

export function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Identifiant de transaction unique, lisible dans les relevés (lettres et chiffres seulement). */
export function nouvelleTransaction(maintenant = new Date()): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PIA${maintenant.getTime().toString(36).toUpperCase()}${rand}`;
}

export type StatutPaiement = "en_attente" | "reussi" | "echoue" | "annule";

/** Statut CinetPay (vérification de transaction) → statut PÉDAGOGUE.IA. */
export function statutCinetpay(status: string | undefined): StatutPaiement {
  switch ((status ?? "").toUpperCase()) {
    case "ACCEPTED":
      return "reussi";
    case "REFUSED":
      return "echoue";
    case "CANCELED":
    case "CANCELLED":
      return "annule";
    default:
      return "en_attente";
  }
}

// ---------------------------------------------------------------- Essai gratuit et parrainage

/** Durée de validité de la fiche offerte à l'inscription (appliquée par la base, voir supabase/migrations/0011). */
export const ESSAI_HEURES = 30 * 24;

/** Commission du parrain sur chaque paiement de son filleul (mensuel ou annuel), en pourcentage. */
export function tauxCommission(): number {
  const t = Number(process.env.PARRAINAGE_TAUX);
  return Number.isFinite(t) && t > 0 && t <= 50 ? t : 10;
}

export function montantCommission(montant: number, taux: number): number {
  return Math.floor((montant * taux) / 100);
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Code de parrainage : 6 caractères sans ambiguïté (pas de 0/O ni 1/I/L). */
export function codeParrainageValide(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/.test(c) ? c : null;
}

export function nouveauCodeParrainage(): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
}

export function heuresRestantes(fin: Date | null, maintenant: Date): number {
  return fin && fin > maintenant ? Math.ceil((fin.getTime() - maintenant.getTime()) / 3_600_000) : 0;
}

// ---------------------------------------------------------------- Codes promo

export type CodePromo = {
  code: string;
  description: string | null;
  remise_pct: number;
  actif: boolean;
  expire_le: string | null;
  max_utilisations: number | null;
};

export function normaliserCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9]{3,20}$/.test(c) ? c : null;
}

/** Prix après remise, arrondi au multiple de 5 FCFA inférieur (exigence mobile money), au moins 100 FCFA. */
export function prixRemise(prix: number, remisePct: number): number {
  const p = Math.floor((prix * (100 - remisePct)) / 100 / 5) * 5;
  return Math.max(100, p);
}

/** Raison pour laquelle un code n'est pas utilisable (null s'il l'est). */
export function refusPromo(p: CodePromo | null, utilisations: number, dejaUtiliseParLui: boolean, maintenant = new Date()): string | null {
  if (!p || !p.actif) return "Code promo inconnu ou désactivé.";
  if (p.expire_le && new Date(p.expire_le) <= maintenant) return "Ce code promo a expiré.";
  if (p.max_utilisations !== null && utilisations >= p.max_utilisations) return "Ce code promo a atteint son nombre maximal d'utilisations.";
  if (dejaUtiliseParLui) return "Vous avez déjà utilisé ce code promo.";
  return null;
}

/** Durée d'une formule en clair : « 24 h », « 30 jours », « 1 an ». */
export function dureeFormule(jours: number): string {
  if (jours === 1) return "24 h";
  if (jours === 365) return "1 an";
  return `${jours} jours`;
}

// ---------------------------------------------------------------- Pass 24 h déduit de l'annuel

/** Délai pendant lequel un pass 24 h payé est déduit d'un abonnement annuel. */
export const JOURS_CREDIT_PASS = 7;

/** Une formule « courte » (pass) peut être déduite ; une formule d'au moins un an peut en bénéficier. */
export const estPass = (dureeJours: number) => dureeJours < 30;
export const accepteCreditPass = (dureeJours: number) => dureeJours >= 365;

/** Pass encore déductibles : payés depuis moins de 7 jours et jamais déduits. */
export function passesDeductibles<T extends { montant_fcfa: number; cree_le: string; deduit_par?: string | null }>(passes: T[], maintenant = new Date()): T[] {
  const limite = maintenant.getTime() - JOURS_CREDIT_PASS * 86_400_000;
  return passes.filter((p) => !p.deduit_par && new Date(p.cree_le).getTime() >= limite);
}

/** Prix après déduction du crédit, arrondi au multiple de 5 FCFA inférieur, au moins 100 FCFA (exigence mobile money). */
export function prixApresCredit(prix: number, credit: number): number {
  if (credit <= 0) return prix;
  return Math.max(100, Math.floor((prix - credit) / 5) * 5);
}

// ---------------------------------------------------------------- Licences établissement

/** Code de licence : 8 caractères sans ambiguïté. */
export function nouveauCodeLicence(): string {
  return Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
}

export function codeLicenceValide(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase().replace(/[\s-]+/g, "");
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/.test(c) ? c : null;
}

/** Message lisible pour une erreur de réservation de place (fonction rejoindre_licence). */
export function messageLicence(erreur: string): string {
  if (erreur.includes("LICENCE_DEJA_MEMBRE")) return "Vous faites déjà partie de cette licence.";
  if (erreur.includes("LICENCE_COMPLETE")) return "Toutes les places de cette licence sont déjà utilisées. Contactez votre établissement.";
  if (erreur.includes("LICENCE_EXPIREE")) return "Ce code de licence a expiré. Contactez votre établissement.";
  if (erreur.includes("LICENCE_INCONNUE")) return "Code de licence inconnu ou désactivé. Vérifiez le code donné par votre établissement.";
  return "Activation impossible pour le moment. Réessayez plus tard.";
}

// ---------------------------------------------------------------- Ambassadeurs

/** Taux de commission d'un parrain : celui de l'ambassadeur actif s'il en a un, sinon le taux général. */
export function tauxPour(ambassadeur: { actif: boolean; taux: number | string | null } | null, tauxGeneral: number): number {
  const t = ambassadeur?.actif && ambassadeur.taux !== null ? Number(ambassadeur.taux) : NaN;
  return Number.isFinite(t) && t > 0 && t <= 50 ? t : tauxGeneral;
}

export type FilleulStat = { id: string; cree_le: string };
export type VenteStat = { utilisateur_id: string; montant_fcfa: number; cree_le: string };

/** Indicateurs d'un ambassadeur : inscriptions, conversions et ventes, au total et sur le mois en cours. */
export function statsAmbassadeur(filleuls: FilleulStat[], ventes: VenteStat[], debutMois: Date) {
  const ids = new Set(filleuls.map((f) => f.id));
  const siennes = ventes.filter((v) => ids.has(v.utilisateur_id));
  const payeurs = new Set(siennes.map((v) => v.utilisateur_id));
  const duMois = (d: string) => new Date(d) >= debutMois;
  const ventesMois = siennes.filter((v) => duMois(v.cree_le));
  return {
    inscrits: filleuls.length,
    inscritsMois: filleuls.filter((f) => duMois(f.cree_le)).length,
    payeurs: payeurs.size,
    conversion: filleuls.length ? Math.round((payeurs.size / filleuls.length) * 100) : 0,
    ventes: siennes.reduce((s, v) => s + v.montant_fcfa, 0),
    ventesMois: ventesMois.reduce((s, v) => s + v.montant_fcfa, 0),
    payeursMois: new Set(ventesMois.map((v) => v.utilisateur_id)).size,
  };
}
