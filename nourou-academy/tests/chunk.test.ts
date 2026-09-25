import { describe, expect, it } from "vitest";
import { chunkUnits } from "@/lib/rag/chunk";

describe("découpage RAG", () => {
  it("conserve les titres de section et la page", () => {
    const chunks = chunkUnits([{ text: "## La marge\n\nMarge = prix - coût de revient. Exemple détaillé avec des savons.", page: 3 }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.heading).toBe("La marge");
    expect(chunks[0]!.page).toBe(3);
  });

  it("découpe un long texte en passages de taille bornée avec chevauchement", () => {
    const para = "Le seuil de rentabilité est le niveau de ventes qui couvre toutes les charges. ".repeat(80);
    const chunks = chunkUnits([{ text: para }]);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(1500);
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
  });

  it("ignore les unités vides", () => {
    expect(chunkUnits([{ text: "   " }, { text: "" }])).toEqual([]);
  });
});
