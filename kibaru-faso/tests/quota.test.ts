import { describe, expect, it } from "vitest";
import { plafondAtteint, unitesGeneration } from "@/lib/quota";

describe("quotas de générations", () => {
  it("bloque d'abord sur le plafond de la formule, puis sur celui du jour", () => {
    expect(plafondAtteint({ limite: 6, utilisees: 2, periode: { limite: 40, utilisees: 40 } })).toBe("periode");
    expect(plafondAtteint({ limite: 6, utilisees: 6, periode: { limite: 40, utilisees: 12 } })).toBe("jour");
    expect(plafondAtteint({ limite: 6, utilisees: 5, periode: { limite: 40, utilisees: 39 } })).toBeNull();
    expect(plafondAtteint({ limite: null, utilisees: 99, periode: null })).toBeNull();
  });
  it("compte double le mode expert", () => {
    expect(unitesGeneration("expert")).toBe(2);
    expect(unitesGeneration("standard")).toBe(1);
    expect(unitesGeneration(undefined)).toBe(1);
  });
});
