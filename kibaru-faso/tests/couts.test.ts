import { describe, expect, it } from "vitest";
import { coutUsd, debutJour, tarif, usdEnFcfa } from "../src/lib/couts";

describe("coût de l'IA", () => {
  it("applique le tarif du modèle", () => {
    expect(tarif("claude-sonnet-5-5").entree).toBe(2);
    expect(tarif("claude-opus-5-5").sortie).toBe(20);
    expect(tarif("claude-opus-5").sortie).toBe(25);
    expect(tarif("modele-inconnu").entree).toBe(5);
  });

  it("compte entrée, sortie et cache", () => {
    // 1 M d'entrée (2 $) + 100 k de sortie (1 $) + 1 M lu en cache (0,2 $) + 100 k écrits en cache (0,25 $)
    expect(coutUsd("claude-sonnet-5-5", { entree: 1_000_000, sortie: 100_000, cacheLecture: 1_000_000, cacheEcriture: 100_000 })).toBeCloseTo(3.45, 6);
    expect(coutUsd("claude-opus-5-5", { entree: 0, sortie: 0, cacheLecture: 0, cacheEcriture: 0 })).toBe(0);
  });

  it("convertit en FCFA", () => {
    expect(usdEnFcfa(0.05, 600)).toBe(30);
  });

  it("début de la journée (UTC = heure de Ouagadougou)", () => {
    expect(debutJour(new Date("2026-09-28T23:59:00Z")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
});
