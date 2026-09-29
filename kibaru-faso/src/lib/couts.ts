/**
 * Coût des appels à l'IA, d'après les tarifs publics Anthropic (dollars US par million de jetons).
 * Écriture en cache (5 min) = 1,25 × entrée ; lecture en cache = tarif indiqué. Les jetons de réflexion sont
 * facturés comme des jetons de sortie (déjà inclus dans output_tokens).
 */

type Tarif = { entree: number; sortie: number; cacheLecture: number };

const TARIFS: [RegExp, Tarif][] = [
  [/^claude-fable-5/, { entree: 10, sortie: 50, cacheLecture: 0.25 }],
  [/^claude-opus-5-5/, { entree: 4, sortie: 20, cacheLecture: 0.2 }],
  [/^claude-opus-5/, { entree: 5, sortie: 25, cacheLecture: 0.5 }],
  [/^claude-opus-4/, { entree: 5, sortie: 25, cacheLecture: 0.5 }],
  [/^claude-sonnet-5-5/, { entree: 2, sortie: 10, cacheLecture: 0.2 }],
  [/^claude-sonnet/, { entree: 2, sortie: 10, cacheLecture: 0.2 }],
  [/^claude-haiku/, { entree: 1, sortie: 5, cacheLecture: 0.1 }],
];
const DEFAUT: Tarif = { entree: 5, sortie: 25, cacheLecture: 0.5 };

export type Consommation = { entree: number; sortie: number; cacheLecture: number; cacheEcriture: number };

export function tarif(modele: string): Tarif {
  return TARIFS.find(([re]) => re.test(modele))?.[1] ?? DEFAUT;
}

export function coutUsd(modele: string, c: Consommation): number {
  const t = tarif(modele);
  const usd = (c.entree * t.entree + c.sortie * t.sortie + c.cacheLecture * t.cacheLecture + c.cacheEcriture * t.entree * 1.25) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Taux de conversion pour l'affichage (variable TAUX_USD_FCFA, 600 par défaut). */
export function tauxUsdFcfa(): number {
  const t = Number(process.env.TAUX_USD_FCFA);
  return Number.isFinite(t) && t > 100 ? t : 600;
}

export function usdEnFcfa(usd: number, taux = tauxUsdFcfa()): number {
  return Math.round(usd * taux);
}

/** Début de la journée en cours au Burkina Faso (UTC, sans heure d'été). */
export function debutJour(maintenant = new Date()): Date {
  return new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
}
