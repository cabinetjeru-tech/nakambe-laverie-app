/**
 * Abonnements : règles de calcul, sans accès à la base (testables).
 * Un abonnement payé ou accordé avant la fin du précédent le prolonge : l'enseignant ne perd aucun jour.
 */

export type Formule = { id: string; libelle: string; prix_fcfa: number; duree_jours: number; active: boolean; ordre: number };
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
