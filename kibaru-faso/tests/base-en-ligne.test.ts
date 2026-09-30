import { describe, expect, it } from "vitest";
import { fusionnerBase, prochainId, versRefDocument, type DocumentEnLigne } from "../src/lib/base/en-ligne";
import type { BaseLoad } from "../src/lib/base/load";
import { isApplicable, resolveBase } from "../src/lib/search";

const row = (x: Partial<DocumentEnLigne> = {}): DocumentEnLigne => ({
  id: "BF-6E-MATH-001",
  titre: "Guide Mathématiques 6e",
  type: "GUIDE_PEDAGOGIQUE",
  classes: ["6e"],
  disciplines: ["Mathématiques"],
  organisme: "Ministère",
  annee: "2024",
  version: "1",
  statut: "ACTIF",
  source: "DRENA du Centre",
  url: null,
  niveau_source: 2,
  avertissement: null,
  observations: null,
  fichier_nom: "guide.pdf",
  texte: "Les fractions : définition, comparaison, addition. ".repeat(10),
  cree_le: "2026-09-30T08:00:00Z",
  maj_le: "2026-09-30T08:00:00Z",
  ...x,
});

const base = (): BaseLoad => ({
  docs: [],
  pending: [
    { path: "REGISTRE_MAITRE.csv, ligne 2", documentId: "BF-6E-MATH-001", title: "Guide Mathématiques 6e", statut: "A_VERIFIER", classes: ["6e"], disciplines: ["Mathématiques"], expectedLocation: "x" },
    { path: "REGISTRE_MAITRE.csv, ligne 3", documentId: "BF-5E-SVT-001", title: "Guide SVT 5e", statut: "A_VERIFIER", classes: ["5e"], disciplines: ["SVT"], expectedLocation: "x" },
  ],
  issues: [],
  registry: [],
});

describe("base documentaire en ligne", () => {
  it("convertit un document déposé en ressource consultable", () => {
    const d = versRefDocument(row());
    expect(d).toMatchObject({ id: "db:BF-6E-MATH-001", documentId: "BF-6E-MATH-001", statut: "ACTIF", origin: "bibliotheque", category: "02_GUIDES_PEDAGOGIQUES", niveau: "Post-primaire", year: "2024" });
    expect(isApplicable(d, "6e", "Mathématiques")).toBe(true);
    expect(isApplicable(d, "5e", "Mathématiques")).toBe(false);
    expect(versRefDocument(row({ statut: "N'IMPORTE" })).statut).toBe("A_VERIFIER");
  });

  it("le dépôt fait sortir la ressource de la liste « non encore intégrée »", () => {
    const b = fusionnerBase(base(), [row()]);
    expect(b.docs).toHaveLength(1);
    expect(b.pending.map((p) => p.documentId)).toEqual(["BF-5E-SVT-001"]);
    expect(resolveBase(b.docs).usable).toHaveLength(1);
  });

  it("un document retiré ou archivé n'est plus consulté", () => {
    const b = fusionnerBase(base(), [row({ statut: "ARCHIVE" })]);
    expect(resolveBase(b.docs).usable).toHaveLength(0);
  });

  it("propose le prochain identifiant libre", () => {
    expect(prochainId("6e", "Mathématiques", ["BF-6E-MATH-001"])).toBe("BF-6E-MATH-002");
    expect(prochainId("Terminale", "Physique-Chimie", [])).toBe("BF-TERM-PHYS-001");
    expect(prochainId(undefined, "Informatique", [])).toBe("BF-6E-INFO-001");
  });
});
