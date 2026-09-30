import { describe, expect, it } from "vitest";
import { arrondiVitrine, resumeDe, slugifier } from "../src/lib/vitrine";

describe("vitrine", () => {
  it("adresse de fiche lisible, sans accents ni caractères spéciaux", () => {
    expect(slugifier("Fiche SVT — La digestion (4e) !", "k3f9")).toBe("fiche-svt-la-digestion-4e-k3f9");
    expect(slugifier("Théorème de Pythagore", "")).toBe("theoreme-de-pythagore");
    expect(slugifier("   ", "ab12")).toBe("fiche-ab12");
    expect(slugifier("x".repeat(200), "ab12")).toMatch(/^x{90}-ab12$/);
    expect(slugifier("Leçon", "zz99")).toMatch(/^[a-z0-9-]{3,120}$/);
  });

  it("résumé : première vraie phrase, sans Markdown, tronqué proprement", () => {
    const md = "# Fiche\n\n**PROPOSITION PÉDAGOGUE.IA**\n\n| Classe | 4e |\n\nCette séance amène les élèves à **découvrir** le théorème de Pythagore par une activité de mesure.";
    expect(resumeDe(md)).toBe("Cette séance amène les élèves à découvrir le théorème de Pythagore par une activité de mesure.");
    const long = resumeDe(`Texte ${"très long ".repeat(40)}`, 60);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
    expect(resumeDe("")).toBe("");
  });

  it("compteur arrondi vers le bas", () => {
    expect(arrondiVitrine(87)).toBe(87);
    expect(arrondiVitrine(348)).toBe(340);
    expect(arrondiVitrine(1234)).toBe(1200);
    expect(arrondiVitrine(15678)).toBe(15000);
  });
});
