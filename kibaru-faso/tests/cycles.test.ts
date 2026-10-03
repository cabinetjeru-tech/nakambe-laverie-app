import { describe, expect, it } from "vitest";
import { classeInMessage, matiereInMessage } from "@/lib/base/decision";
import { canonicalClasse, CLASSES, cycleDe } from "@/lib/search";
import { disciplinesPour } from "@/lib/templates";

describe("cycles du préscolaire à la Terminale", () => {
  it("liste les 21 classes dans l'ordre", () => {
    expect(CLASSES).toHaveLength(21);
    expect(CLASSES[0]).toBe("Petite section");
    expect(CLASSES.at(-1)).toBe("Terminale");
  });

  it("normalise les classes du primaire, du bilingue et du préscolaire sans les confondre avec le post-primaire", () => {
    expect(canonicalClasse("cm2")).toBe("CM2");
    expect(canonicalClasse("CE 1")).toBe("CE1");
    expect(canonicalClasse("3e année bilingue")).toBe("Bilingue 3e année");
    expect(canonicalClasse("1re année bilingue")).toBe("Bilingue 1re année");
    expect(canonicalClasse("grande section")).toBe("Grande section");
    expect(canonicalClasse("3eme")).toBe("3e");
    expect(canonicalClasse("1ere")).toBe("1ère");
    expect(cycleDe("CP2")?.code).toBe("PRIMAIRE");
    expect(cycleDe("Bilingue 4e année")?.code).toBe("PRIMAIRE_BILINGUE");
    expect(cycleDe("Tle")?.code).toBe("SECONDAIRE");
  });

  it("repère la classe dans un message", () => {
    expect(classeInMessage("Prépare une leçon de lecture au CM2")).toBe("CM2");
    expect(classeInMessage("fiche pour le CE 1 sur l'addition")).toBe("CE1");
    expect(classeInMessage("activité pour la moyenne section")).toBe("Moyenne section");
    expect(classeInMessage("leçon de géographie en 3e année bilingue")).toBe("Bilingue 3e année");
    expect(classeInMessage("devoir de maths en 3e")).toBe("3e");
    expect(classeInMessage("devoir du 3e trimestre")).toBeUndefined();
  });

  it("repère les matières du primaire", () => {
    expect(matiereInMessage("une séance de lecture")).toBe("Français");
    expect(matiereInMessage("leçon de calcul mental")).toBe("Mathématiques");
    expect(matiereInMessage("sciences d'observation : le corps humain")).toBe("Sciences d'observation");
    expect(matiereInMessage("leçon d'éducation civique")).toBe("Éducation civique et morale");
  });

  it("propose des disciplines adaptées au cycle", () => {
    expect(disciplinesPour("CP1")).toContain("Sciences d'observation");
    expect(disciplinesPour("Bilingue 1re année")[0]).toBe("Langue nationale");
    expect(disciplinesPour("Petite section")).toContain("Exercices sensoriels");
    expect(disciplinesPour("6e")).toContain("Physique-Chimie");
    expect(disciplinesPour("6e")).not.toContain("Sciences d'observation");
  });
});

describe("séries du lycée", async () => {
  const { serieDe } = await import("@/lib/search");
  it("repère la série sans changer la classe utilisée pour la recherche", () => {
    expect(serieDe("Terminale D")).toBe("D");
    expect(serieDe("1ère A")).toBe("A");
    expect(serieDe("2nde C")).toBe("C");
    expect(serieDe("Terminale")).toBeUndefined();
    expect(serieDe("CE1")).toBeUndefined();
    expect(canonicalClasse("Terminale D")).toBe("Terminale");
    expect(canonicalClasse("1ère C")).toBe("1ère");
    expect(canonicalClasse("2nde A")).toBe("2nde");
    expect(cycleDe("Terminale C")?.code).toBe("SECONDAIRE");
  });
});
