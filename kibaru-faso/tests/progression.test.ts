import { describe, expect, it } from "vitest";
import { decide, formatDecisionBlock, identifyConversation, identifyRequest } from "@/lib/base/decision";
import { finalCheck } from "@/lib/base/final-check";
import { buildProgRequest, emptyProg, heuresDisponibles, parseProgParams, progMissing, progressionChecks, progressionTable } from "@/lib/progression";
import { SYSTEM_PROMPT } from "@/lib/prompt";

const PROG = `## Paramètres et hypothèses
4 h par semaine × 10 semaines = 40 h disponibles.

## Tableau de progression
| Semaine | Chapitre / leçon | Heures | Objectifs | Évaluation | Statut |
|---|---|---|---|---|---|
| 1-2 | Nombres entiers | 8 h | Lire, écrire | Interrogation | PROPOSITION |
| 3-5 | Fractions | 12 h | Comparer | Devoir | PROPOSITION |
| 6-8 | Droites et segments | 12 h | Tracer | Interrogation | PROPOSITION |
| 9 | Révisions | 4 h | Consolider | Composition | PROPOSITION |
| **Total** | | **36 h** | | | |

## Réserve et rattrapage
Semaine 10 : 4 h de marge.
**PROPOSITION PÉDAGOGUE.IA**`;

const PARAMS = { heuresSemaine: 4, semaines: 10, periode: "1er trimestre" };

describe("Module 04 — paramètres", () => {
  it("lit les lignes du formulaire et le texte libre", () => {
    expect(parseProgParams("Construis une progression.\nPériode : 1er trimestre\nVolume horaire hebdomadaire : 4 h par semaine\nDurée d'une séance : 55 minutes\nNombre de semaines : 11")).toEqual({
      periode: "1er trimestre",
      heuresSemaine: 4,
      dureeSeance: 55,
      semaines: 11,
    });
    expect(parseProgParams("progression annuelle de maths en 6e, 5 heures par semaine sur 30 semaines, séances de 1 h")).toEqual({
      periode: "année scolaire",
      heuresSemaine: 5,
      semaines: 30,
      dureeSeance: 60,
    });
    expect(parseProgParams("progression du 2e trimestre, trois heures par semaine").heuresSemaine).toBe(3);
    expect(heuresDisponibles(PARAMS)).toBe(40);
    expect(heuresDisponibles({ heuresSemaine: 4 })).toBeUndefined();
  });
});

describe("Module 04 — identification", () => {
  it("active le module et transmet les paramètres", () => {
    const p = identifyRequest("Construis une progression de mathématiques en 6e pour le 1er trimestre, 4 h par semaine sur 10 semaines", {});
    expect(p).toMatchObject({ module04: true, fiche: false, module02: false, classe: "6e", matiere: "Mathématiques", missing: [] });
    const block = formatDecisionBlock(decide(p, [], [], [], []));
    expect(block).toContain("Module 04 — progression : actif ; période = 1er trimestre ; volume horaire = 4 h/semaine ; semaines = 10 ; heures disponibles = 40 h");
  });
  it("ne confond pas « 3e trimestre » avec la classe de 3e", () => {
    expect(identifyRequest("Progression de SVT en 5e pour le 3e trimestre, 2 h par semaine", {}).classe).toBe("5e");
  });
  it("demande le volume horaire hebdomadaire au lieu de le deviner", () => {
    const p = identifyRequest("Fais-moi une progression annuelle de français en 4e", {});
    expect(p.missing).toEqual(["volume"]);
    expect(p.question).toBe("Quel est le volume horaire hebdomadaire de cette matière dans votre classe (ex. 4 h par semaine) ?");
    expect(identifyRequest("Fais-moi une progression", {}).question).toMatch(/quelle classe .* et quelle matière souhaitez-vous cette progression \? Précisez aussi le volume horaire/);
  });
  it("annonce l'hypothèse sur le nombre de semaines, jamais présentée comme officielle", () => {
    const p = identifyRequest("Progression de maths en 3e, 5 h par semaine", {});
    expect(p.assumptions.join(" ")).toMatch(/nombre de semaines non précisé.*calendrier scolaire officiel/);
    expect(p.assumptions.join(" ")).toMatch(/période non précisée/);
  });
  it("la réponse courte complète la demande précédente", () => {
    const p = identifyConversation(["Fais-moi une progression annuelle de français en 4e", "4 h par semaine"], {});
    expect(p).toMatchObject({ module04: true, missing: [], classe: "4e" });
    expect(p.progression?.heuresSemaine).toBe(4);
  });
  it("une fiche ou un devoir restent prioritaires", () => {
    expect(identifyRequest("Prépare un devoir de 6e sur les fractions, conforme à ma progression", {}).module04).toBe(false);
  });
});

describe("Module 04 — formulaire", () => {
  it("exige classe, discipline et volume horaire", () => {
    expect(progMissing(emptyProg({}))).toEqual(["classe", "discipline", "volume horaire hebdomadaire"]);
  });
  it("construit une demande reconnue par le moteur", () => {
    const f = { ...emptyProg({ classe: "6e", discipline: "Mathématiques" }), periode: "1er trimestre", heuresSemaine: "4", semaines: "10" };
    const { message, context } = buildProgRequest(f);
    expect(message.split("\n")[0]).toBe("Construis une progression pour le 1er trimestre, avec les évaluations, avec une marge de rattrapage.");
    expect(message).toContain("Volume horaire hebdomadaire : 4 h par semaine");
    expect(context).toMatchObject({ classe: "6e", discipline: "Mathématiques" });
    const p = identifyRequest(message, {});
    expect(p).toMatchObject({ module04: true, classe: "6e", missing: [] });
    expect(p.progression).toMatchObject({ periode: "1er trimestre", heuresSemaine: 4, semaines: 10, dureeSeance: 55 });
    expect(buildProgRequest({ ...f, periode: "année scolaire" }).message).toMatch(/^Construis une progression pour l'année scolaire/);
  });
});

describe("Module 04 — contrôles automatiques", () => {
  it("accepte une progression cohérente", () => {
    expect(progressionTable(PROG)?.rows).toHaveLength(5);
    expect(progressionChecks(PROG, PARAMS, false)).toEqual([]);
  });
  it("signale le dépassement du volume disponible et des semaines", () => {
    const bad = PROG.replace("| 9 | Révisions | 4 h |", "| 9-12 | Révisions | 16 h |");
    const out = progressionChecks(bad, PARAMS, false);
    expect(out).toContain("La progression va jusqu'à la semaine 12, pour 10 semaines disponibles.");
    expect(out.some((x) => x.startsWith("Volume planifié : 48 h, pour 40 h disponibles"))).toBe(true);
  });
  it("signale une semaine surchargée, le désordre et l'absence d'évaluation", () => {
    const bad = PROG.replace("| 1-2 | Nombres entiers | 8 h |", "| 1 | Nombres entiers | 8 h |").replace("| 6-8 |", "| 2-4 |").replace(/Interrogation|Devoir|Composition/g, "—");
    const out = progressionChecks(bad, PARAMS, false);
    expect(out).toContain("1 ligne(s) du tableau dépassent le volume hebdomadaire de 4 h.");
    expect(out).toContain("Les semaines du tableau de progression ne sont pas dans l'ordre.");
    expect(out).toContain("Aucune évaluation prévue dans le tableau de progression.");
  });
  it("signale un temps largement inutilisé et une colonne de séances convertie", () => {
    const seances = `| Semaine | Chapitre | Séances | Évaluation |\n|---|---|---|---|\n| 1-2 | Fractions | 4 | Devoir |`;
    expect(progressionChecks(seances, { ...PARAMS, dureeSeance: 60 }, false)[0]).toMatch(/^Volume planifié : 4 h sur 40 h disponibles/);
  });
  it("refuse une progression présentée comme officielle sans source active", () => {
    const claim = `${PROG}\nCette répartition suit la progression officielle du ministère.`;
    expect(progressionChecks(claim, PARAMS, false)).toContain("La progression semble présentée comme officielle sans source ACTIVE qui la confirme.");
    expect(progressionChecks(claim, PARAMS, true)).toEqual([]);
    expect(progressionChecks(`${PROG}\nLa progression officielle n'est pas confirmée dans la base.`, PARAMS, false)).toEqual([]);
    expect(progressionChecks(`${PROG}\n**PROPOSITION** — conforme à la progression officielle du ministère.`, PARAMS, false)).toHaveLength(1);
    expect(progressionChecks(`${PROG}\nCette proposition ne remplace pas la progression officielle : comparez-la.`, PARAMS, false)).toEqual([]);
  });
  it("est appelé par le contrôle final", () => {
    const out = finalCheck({ answer: PROG.replace("| 9 | Révisions | 4 h |", "| 9 | Révisions | 8 h |"), labels: [], knownIds: [], confidence: "NON_CONFIRMEE", needs: ["progression", "evaluation"], questionExpected: false, progression: PARAMS });
    expect(out).toContain("1 ligne(s) du tableau dépassent le volume hebdomadaire de 4 h.");
    expect(out.some((x) => x.includes("corrigé"))).toBe(false);
    expect(progressionChecks("texte sans tableau", PARAMS, false)[0]).toMatch(/non repéré/);
  });
});

describe("Module 04 — consignes", () => {
  it("figurent dans le prompt système", () => {
    expect(SYSTEM_PROMPT).toContain("MODULE 04 — GÉNÉRATEUR DE PROGRESSIONS");
    expect(SYSTEM_PROMPT).toContain("Ne l'appelle jamais « progression officielle »");
  });
});
