import { describe, expect, it } from "vitest";
import { decide, formatDecisionBlock, identifyConversation, identifyRequest, parseQuickRequest } from "@/lib/base/decision";
import { finalCheck, parseMinutes, scheduleDurations } from "@/lib/base/final-check";
import { buildFicheRequest, emptyFiche, ficheMissing } from "@/lib/fiche";
import { SYSTEM_PROMPT } from "@/lib/prompt";

describe("Module 01 — identification d'une demande de fiche", () => {
  it("section 2 : « fiche de cours sur les fractions pour une classe de 6e » → demande la discipline", () => {
    const p = identifyRequest("Prépare-moi une fiche de cours sur les fractions pour une classe de 6e.", {});
    expect(p).toMatchObject({ fiche: true, classe: "6e", missing: ["matiere"], matiereSuggeree: "Mathématiques" });
    expect(p.question).toBe("Très bien. Pour quelle discipline souhaitez-vous cette fiche : Mathématiques ou une autre matière ?");
    const q = identifyConversation(["Prépare-moi une fiche de cours sur les fractions pour une classe de 6e.", "Matière : Mathématiques."], {});
    expect(q).toMatchObject({ fiche: true, classe: "6e", matiere: "Mathématiques", missing: [] });
  });
  it("section 20 : le modèle de demande rapide est reconnu et prime sur le panneau « Ma classe »", () => {
    const msg = "Classe : 6e\nMatière : Mathématiques\nThème : Fractions\nDurée : 55 minutes\nType : Séance d’apprentissage\nDifficulté de la classe : moyenne";
    expect(parseQuickRequest(msg)).toEqual({ classe: "6e", discipline: "Mathématiques", theme: "Fractions", duree: "55 minutes", typeSeance: "Séance d’apprentissage", niveau: "moyenne" });
    const p = identifyRequest(msg, { classe: "4e", discipline: "Français" });
    expect(p).toMatchObject({ fiche: true, needs: ["fiche_pedagogique"], classe: "6e", matiere: "Mathématiques", theme: "Fractions", duree: "55 minutes", typeSeance: "apprentissage", missing: [] });
  });
  it("sections 21-22 : modes expert et rapide", () => {
    expect(identifyRequest("Mode expert : fiche sur Thalès en 3e, maths", {}).mode).toBe("expert");
    expect(identifyRequest("Fiche de maths de 3e sur Thalès", { mode: "rapide" }).mode).toBe("rapide");
  });
  it("le bloc de décision active le Module 01 avec la recherche ciblée (section 6)", () => {
    const p = identifyRequest("Classe : 6e\nMatière : Mathématiques\nThème : Fractions\nType : Séance de révision", {});
    expect(formatDecisionBlock(decide(p, [], [], [], []))).toContain("Module 01 — fiche pédagogique : actif ; mode STANDARD ; applique la structure et les contrôles du Module 01 (recherche ciblée : Burkina Faso + 6e + Mathématiques + Fractions + révision)");
  });
});

describe("Module 01 — formulaire structuré", () => {
  it("n'exige que classe, discipline et thème", () => {
    expect(ficheMissing(emptyFiche({}))).toEqual(["classe", "discipline", "thème"]);
    expect(ficheMissing({ ...emptyFiche({}), classe: "6e", discipline: "Mathématiques", theme: "Fractions" })).toEqual([]);
  });
  it("produit une demande que le moteur reconnaît entièrement", () => {
    const f = { ...emptyFiche({}), classe: "5e", discipline: "SVT", theme: "La respiration", sousTheme: "Les organes", typeSeance: "découverte", duree: "1 h", effectif: "90", niveau: "faible", difficultes: "vocabulaire", mode: "expert" as const, differenciation: true };
    const { message, context } = buildFicheRequest(f);
    expect(message.split("\n")[0]).toBe("Prépare une fiche pédagogique (mode expert), avec le corrigé, avec une différenciation.");
    expect(message).toContain("Type : Séance de découverte");
    expect(message).toContain("Difficulté de la classe : niveau faible ; difficultés : vocabulaire");
    const p = identifyRequest(message, {});
    expect(p).toMatchObject({ fiche: true, mode: "expert", classe: "5e", matiere: "SVT", theme: "La respiration", sousTheme: "Les organes", typeSeance: "découverte", duree: "1 h", missing: [] });
    expect(p.needs).toContain("differenciation");
    expect(context).toMatchObject({ classe: "5e", typeSeance: "découverte", mode: "expert" });
  });
});

describe("Module 01 — contrôle automatique de qualité (section 18)", () => {
  const table = (d: number[]) =>
    `| Étape | Durée | Activités de l'enseignant | Activités des apprenants | Ressources |\n|---|---|---|---|---|\n${["Mise en situation", "Recherche", "Mise en commun", "Structuration", "Application", "Évaluation"].map((e, i) => `| ${e} | ${d[i]} min | a | b | c |`).join("\n")}\n\nTotal : ${d.reduce((a, b) => a + b, 0)} min`;
  const fiche = (d: number[], competence = "Compétence officielle non confirmée dans la base PÉDAGOGUE.IA disponible.") =>
    `## FICHE PÉDAGOGIQUE\nDurée : 55 minutes\n### 1. Références documentaires\n…\n### 2. Compétence\n${competence}\n### 3. Objectifs\n…\n### 7. Déroulement\n${table(d)}\n### 8. Trace écrite\n…\n### 9. Évaluation\n…\n### 11. Remédiation\n…\n### 13. Sources et statut\n…`;
  const base = { labels: [], knownIds: [], confidence: "NON_CONFIRMEE" as const, needs: ["fiche_pedagogique" as const], questionExpected: false, fiche: true, mode: "standard" as const, dureeAnnoncee: "55 minutes" };

  it("lit les durées", () => {
    expect(["55 minutes", "1 h 30", "1h30", "2 heures", "90 mn", "une heure"].map(parseMinutes)).toEqual([55, 90, 90, 120, 90, 60]);
    expect(scheduleDurations(table([5, 15, 10, 10, 10, 5]))).toEqual({ steps: [5, 15, 10, 10, 10, 5], total: 55 });
  });
  it("une fiche conforme ne déclenche aucun signal", () => {
    expect(finalCheck({ ...base, answer: fiche([5, 15, 10, 10, 10, 5]) })).toEqual([]);
  });
  it("somme des durées ≠ durée totale annoncée", () => {
    expect(finalCheck({ ...base, answer: fiche([5, 20, 10, 10, 10, 5]) })).toContain("Durées du déroulement : leur somme fait 60 min, pour une durée annoncée de 55 min.");
  });
  it("compétence non confirmée présentée comme officielle, numéro de page sans source, rubrique manquante", () => {
    const out = finalCheck({ ...base, answer: fiche([5, 15, 10, 10, 10, 5], "Résoudre des problèmes (programme, p. 12).").replace("### 11. Remédiation\n…\n", "") });
    expect(out).toEqual([
      "Numéro de page cité alors qu'aucun extrait de la base n'a été consulté.",
      "Rubrique(s) de la fiche non repérée(s) : Remédiation.",
      "Compétence présentée sans renvoi documentaire ni mention « non confirmée » : à vérifier.",
    ]);
  });
  it("mode rapide : rubriques attendues réduites", () => {
    const rapide = `## FICHE\n**PROPOSITION PÉDAGOGUE.IA**\n### Objectif\n…\n### Déroulement\n${table([5, 15, 10, 10, 10, 5])}\n### Évaluation\n…\n### Devoir\n…` + " ".repeat(300);
    expect(finalCheck({ ...base, mode: "rapide", answer: rapide })).toEqual([]);
  });
});

describe("Module 01 — prompt", () => {
  it("contient les règles du module", () => {
    for (const s of [
      "MODULE 01 — GÉNÉRATEUR DE FICHES PÉDAGOGIQUES",
      "DOCUMENTATION → ANALYSE → PROPOSITION PÉDAGOGIQUE → FICHE",
      "Compétence officielle non confirmée dans la base PÉDAGOGUE.IA disponible.",
      "Proposition de formulation opérationnelle PÉDAGOGUE.IA",
      "Construction pédagogique PÉDAGOGUE.IA",
      "Étape | Durée | Activités de l'enseignant | Activités des apprenants | Ressources",
      "Ne suppose jamais d'équipement numérique",
      "jamais présentés comme des catégories fixes ou définitives",
      "Fais une version 50 minutes",
    ])
      expect(SYSTEM_PROMPT).toContain(s);
  });
});
