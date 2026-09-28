import type { TeacherContext } from "./conversation";

/**
 * Module 01 — Générateur de fiches pédagogiques : du formulaire structuré au modèle de demande rapide
 * (section 20), que le moteur de décision reconnaît et traite comme une demande de fiche.
 */

export type FicheForm = {
  classe: string;
  discipline: string;
  theme: string;
  sousTheme: string;
  typeSeance: string;
  duree: string;
  effectif: string;
  niveau: string;
  difficultes: string;
  prerequis: string;
  materiel: string;
  methode: string;
  contexteParticulier: string;
  objectifPersonnel: string;
  mode: "standard" | "expert" | "rapide";
  corrige: boolean;
  differenciation: boolean;
};

export function emptyFiche(ctx: TeacherContext): FicheForm {
  return {
    classe: ctx.classe ?? "",
    discipline: ctx.discipline ?? "",
    theme: ctx.theme ?? "",
    sousTheme: ctx.sousTheme ?? "",
    typeSeance: ctx.typeSeance ?? "apprentissage",
    duree: ctx.duree ?? "55 minutes",
    effectif: ctx.effectif ?? "",
    niveau: "",
    difficultes: "",
    prerequis: ctx.prerequis ?? "",
    materiel: ctx.materiel ?? "",
    methode: ctx.methode ?? "",
    contexteParticulier: ctx.contexteParticulier ?? "",
    objectifPersonnel: ctx.objectifPersonnel ?? "",
    mode: ctx.mode === "expert" || ctx.mode === "rapide" ? ctx.mode : "standard",
    corrige: true,
    differenciation: false,
  };
}

/** Champs indispensables : sans eux, le moteur devrait poser une question. */
export function ficheMissing(f: FicheForm): string[] {
  return [
    ["classe", f.classe],
    ["discipline", f.discipline],
    ["thème", f.theme],
  ]
    .filter(([, v]) => !v?.trim())
    .map(([k]) => k!);
}

/** Message au format « Classe : … / Matière : … » et mise à jour du contexte de la classe. */
export function buildFicheRequest(f: FicheForm): { message: string; context: Partial<TeacherContext> } {
  const typeLabel = f.typeSeance ? `Séance ${/^[aeéiou]/i.test(f.typeSeance) ? "d'" : "de "}${f.typeSeance}` : "";
  const niveau = [f.niveau && `niveau ${f.niveau}`, f.difficultes && `difficultés : ${f.difficultes}`].filter(Boolean).join(" ; ");
  const lines: [string, string][] = [
    ["Classe", f.classe],
    ["Matière", f.discipline],
    ["Thème", f.theme],
    ["Sous-thème", f.sousTheme],
    ["Durée", f.duree],
    ["Type", typeLabel],
    ["Nombre d'apprenants", f.effectif],
    ["Difficulté de la classe", niveau],
    ["Prérequis déjà maîtrisés", f.prerequis],
    ["Matériel disponible", f.materiel],
    ["Méthode souhaitée", f.methode],
    ["Contexte particulier", f.contexteParticulier],
    ["Objectif personnel", f.objectifPersonnel],
  ];
  const body = lines.filter(([, v]) => v?.trim()).map(([k, v]) => `${k} : ${v.trim()}`);
  const extras = [f.corrige ? "avec le corrigé" : "sans corrigé", f.differenciation ? "avec une différenciation" : ""].filter(Boolean).join(", ");
  const head = `Prépare une fiche pédagogique${f.mode !== "standard" ? ` (mode ${f.mode})` : ""}, ${extras}.`;
  return {
    message: [head, ...body].join("\n"),
    context: {
      classe: f.classe || undefined,
      discipline: f.discipline || undefined,
      theme: f.theme || undefined,
      sousTheme: f.sousTheme || undefined,
      typeSeance: f.typeSeance || undefined,
      duree: f.duree || undefined,
      effectif: f.effectif || undefined,
      niveau: niveau || undefined,
      prerequis: f.prerequis || undefined,
      materiel: f.materiel || undefined,
      methode: f.methode || undefined,
      contexteParticulier: f.contexteParticulier || undefined,
      objectifPersonnel: f.objectifPersonnel || undefined,
      mode: f.mode,
    },
  };
}
