import { describe, expect, it } from "vitest";
import { parseMetaBlock, splitFrontmatter } from "@/lib/metadata";

describe("métadonnées", () => {
  it("lit l'en-tête d'un fichier Markdown", () => {
    const { meta, body } = splitFrontmatter("---\ntitre: Programme de SVT\ntype: programme officiel\nclasses: 6e, 5e\ndisciplines: [SVT]\nsource: MENAPLN\n---\nContenu");
    expect(meta).toEqual({ titre: "Programme de SVT", type: "programme officiel", classes: ["6e", "5e"], disciplines: ["SVT"], source: "MENAPLN" });
    expect(body).toBe("Contenu");
  });
  it("sans en-tête, renvoie le texte entier", () => {
    expect(splitFrontmatter("Juste du texte").body).toBe("Juste du texte");
  });
  it("accepte les clés accentuées ou au singulier", () => {
    expect(parseMetaBlock("Classe: Terminale\ndiscipline: Philosophie").classes).toEqual(["Terminale"]);
  });
});

describe("statut et règle d'usage", () => {
  it("lit le statut et l'avertissement", () => {
    const m = parseMetaBlock("statut: ancien\navertissement: ne pas présenter comme prescription actuelle");
    expect(m.statut).toBe("ancien");
    expect(m.avertissement).toBe("ne pas présenter comme prescription actuelle");
  });
});
