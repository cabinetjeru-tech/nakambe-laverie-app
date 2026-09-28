import { describe, expect, it } from "vitest";
import { parseMetaBlock, splitFrontmatter } from "@/lib/metadata";

describe("métadonnées", () => {
  it("lit l'en-tête d'un fichier Markdown", () => {
    const { meta, body } = splitFrontmatter("---\ntitre: Programme de SVT\ntype: programme officiel\nclasses: 6e, 5e\ndisciplines: [SVT]\nsource: MENAPLN\n---\nContenu");
    expect(meta).toMatchObject({ titre: "Programme de SVT", type: "programme officiel", classes: ["6e", "5e"], disciplines: ["SVT"], source: "MENAPLN" });
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

describe("métadonnées V2", () => {
  it("lit toutes les rubriques de la section 5, quelle que soit la casse", () => {
    const m = parseMetaBlock(`# commentaire ignoré
DOCUMENT_ID : BF-MATH-6E-PROG-002
Organisme: Ministère
PAYS: Burkina Faso
NIVEAU: 6e
MATIÈRE: Mathématiques
ANNÉE: 2025
VERSION: 2
ETAT: remplacé
REMPLACE: BF-MATH-6E-PROG-001
FIABILITE: 1
DATE_INTEGRATION: 28/09/2026
DATE_EXPIRATION: 2027-08`);
    expect(m.documentId).toBe("BF-MATH-6E-PROG-002");
    expect(m.organisme).toBe("Ministère");
    expect(m.classes).toEqual(["6e"]);
    expect(m.disciplines).toEqual(["Mathématiques"]);
    expect(m.annee).toBe("2025");
    expect(m.version).toBe("2");
    expect(m.etat).toBe("remplace");
    expect(m.remplace).toEqual(["BF-MATH-6E-PROG-001"]);
    expect(m.fiabilite).toBe(1);
    expect(m.dateIntegration).toBe("2026-09-28");
    expect(m.dateExpiration).toBe("2027-08-01");
  });
  it("ignore les valeurs « à renseigner » et une fiabilité hors échelle", () => {
    const m = parseMetaBlock("annee: à renseigner\nversion: À préciser\nfiabilite: 9");
    expect(m.annee).toBeUndefined();
    expect(m.version).toBeUndefined();
    expect(m.fiabilite).toBeUndefined();
  });
});
