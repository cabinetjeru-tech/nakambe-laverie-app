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

describe("fiche descriptive", () => {
  it("lit toutes les métadonnées demandées", () => {
    const m = parseMetaBlock(`# commentaire ignoré
ID: BF-MATH-6E-PROG-002
Titre: Programme de mathématiques 6e
PAYS: Burkina Faso
NIVEAU: Post-primaire
CLASSE: 6e
MATIÈRE: Mathématiques
Type: programme
Organisme/producteur: Ministère
ANNÉE: 2025
VERSION: 2
Date d'intégration: 28/09/2026
Statut: À VÉRIFIER
Source: site du ministère
Priorité: 1
Date de dernière vérification: 2026-09-28
Remplace: BF-MATH-6E-PROG-001
Date de remplacement: 2026-09-01`);
    expect(m).toMatchObject({
      documentId: "BF-MATH-6E-PROG-002",
      titre: "Programme de mathématiques 6e",
      pays: "Burkina Faso",
      niveau: "Post-primaire",
      classes: ["6e"],
      disciplines: ["Mathématiques"],
      type: "programme",
      organisme: "Ministère",
      annee: "2025",
      version: "2",
      dateIntegration: "2026-09-28",
      statut: "A_VERIFIER",
      source: "site du ministère",
      priorite: 1,
      dateVerification: "2026-09-28",
      remplace: ["BF-MATH-6E-PROG-001"],
      dateRemplacement: "2026-09-01",
    });
  });
  it("reconnaît les cinq statuts et les écritures de la V2", () => {
    const st = (v: string) => parseMetaBlock(`statut: ${v}`).statut;
    expect(["ACTIF", "Provisoire", "à vérifier", "REMPLACÉ", "archive"].map(st)).toEqual(["ACTIF", "PROVISOIRE", "A_VERIFIER", "REMPLACE", "ARCHIVE"]);
    expect(parseMetaBlock("etat: declasse").statut).toBe("ARCHIVE");
    expect(parseMetaBlock("fiabilite: 2").priorite).toBe(2);
  });
  it("un statut libre n'est pas deviné : il est gardé en observation", () => {
    const m = parseMetaBlock("statut: document ancien");
    expect(m.statut).toBeUndefined();
    expect(m.statutInvalide).toBe("document ancien");
    expect(m.observations).toBe("document ancien");
  });
  it("ignore les valeurs « à renseigner » et une priorité hors échelle", () => {
    const m = parseMetaBlock("annee: à renseigner\nversion: À préciser\npriorite: 9");
    expect(m.annee).toBeUndefined();
    expect(m.version).toBeUndefined();
    expect(m.priorite).toBeUndefined();
  });
});
