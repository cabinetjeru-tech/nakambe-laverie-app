import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBase } from "@/lib/base/load";
import { CATEGORIES, parsePath, parseStatut } from "@/lib/base/structure";
import { missingFields, pathConflicts } from "@/lib/base/validate";
import { parseMetaBlock } from "@/lib/metadata";
import { resolveBase } from "@/lib/search";

describe("structure officielle", () => {
  it("comporte les neuf catégories dans l'ordre", () => {
    expect(CATEGORIES.map((c) => c.code)).toEqual([
      "01_PROGRAMMES_ET_CURRICULA",
      "02_GUIDES_PEDAGOGIQUES",
      "03_MANUELS_ET_RESSOURCES",
      "04_PROGRESSIONS",
      "05_EVALUATIONS",
      "06_REMEDIATION",
      "07_REFERENTIELS_ET_TEXTES_OFFICIELS",
      "08_RESSOURCES_COMPLEMENTAIRES",
      "09_ARCHIVES",
    ]);
  });
  it("lit PAYS / NIVEAU / CLASSE / MATIÈRE / TYPE / ANNÉE / VERSION dans le chemin", () => {
    expect(parsePath("01_PROGRAMMES_ET_CURRICULA/BURKINA_FASO/POST_PRIMAIRE/6E/MATHEMATIQUES/PROGRAMME/2024/V2/prog.pdf")).toEqual({
      category: "01_PROGRAMMES_ET_CURRICULA",
      pays: "Burkina Faso",
      niveau: "Post-primaire",
      classes: ["6e"],
      matieres: ["Mathématiques"],
      type: "PROGRAMME",
      annee: "2024",
      version: "2",
      problems: [],
    });
  });
  it("accepte un chemin partiel et signale les écarts", () => {
    const p = parsePath("02_GUIDES_PEDAGOGIQUES/BURKINA_FASO/SECONDAIRE/TLE/PHILOSOPHIE/guide.md");
    expect(p).toMatchObject({ type: "GUIDE_PEDAGOGIQUE", classes: ["Terminale"], matieres: ["Philosophie"], problems: [] });
    expect(parsePath("divers/guide.md").problems[0]).toContain("hors des 9 catégories");
    expect(parsePath("04_PROGRESSIONS/BURKINA_FASO/POST_PRIMAIRE/SIXIEME/x.md").problems[0]).toContain("classe « SIXIEME » non reconnue");
    expect(parsePath("08_RESSOURCES_COMPLEMENTAIRES/BURKINA_FASO/TOUS_NIVEAUX/TOUTES_CLASSES/TOUTES_MATIERES/x.md")).toMatchObject({ classes: [], matieres: [] });
  });
  it("lit les statuts", () => {
    expect(parseStatut("Remplacé")).toBe("REMPLACE");
    expect(parseStatut("n'importe quoi")).toBeUndefined();
  });
});

describe("contrôles", () => {
  it("liste les métadonnées obligatoires manquantes, en tenant compte du chemin", () => {
    const info = parsePath("01_PROGRAMMES_ET_CURRICULA/BURKINA_FASO/POST_PRIMAIRE/6E/MATHEMATIQUES/PROGRAMME/2024/V1/p.md");
    expect(missingFields(parseMetaBlock("id: X\ntitre: T"), info)).toEqual(["organisme", "date_integration", "statut", "source", "priorite", "niveau_source", "date_verification", "perimetre"]);
  });
  it("signale une fiche en contradiction avec son dossier", () => {
    const info = parsePath("01_PROGRAMMES_ET_CURRICULA/BURKINA_FASO/POST_PRIMAIRE/6E/MATHEMATIQUES/p.md");
    expect(pathConflicts(parseMetaBlock("classe: 5e"), info)[0]).toContain("classe de la fiche (5e) différente du dossier (6e)");
  });
});

describe("chargement d'une base", () => {
  async function base(files: Record<string, string>) {
    const root = await mkdtemp(path.join(tmpdir(), "kibaru-"));
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await writeFile(path.join(root, rel), content);
    }
    return loadBase(root);
  }
  const dir = "01_PROGRAMMES_ET_CURRICULA/BURKINA_FASO/POST_PRIMAIRE/6E/MATHEMATIQUES/PROGRAMME";

  it("complète la fiche par le chemin, n'active jamais un document par défaut, et ignore les LISEZ-MOI", async () => {
    const r = await base({ [`${dir}/2024/V1/programme.md`]: "---\nid: P-1\ntitre: Programme\n---\nfractions", "LISEZ-MOI.md": "doc", [`${dir}/LISEZ-MOI.md`]: "doc" });
    expect(r.docs).toHaveLength(1);
    expect(r.docs[0]).toMatchObject({ documentId: "P-1", statut: "A_VERIFIER", classes: ["6e"], disciplines: ["Mathématiques"], year: "2024", version: "1", category: "01_PROGRAMMES_ET_CURRICULA" });
    expect(r.issues.some((i) => i.message.includes("statut non renseigné : traité comme À VÉRIFIER"))).toBe(true);
  });
  it("un document rangé dans 09_ARCHIVES sans statut est traité comme ARCHIVE", async () => {
    const r = await base({ "09_ARCHIVES/01_PROGRAMMES_ET_CURRICULA/BURKINA_FASO/vieux.md": "---\nid: V-0\n---\ntexte" });
    expect(resolveBase(r.docs).history[0]!.reason).toBe("ARCHIVE");
  });
  it("une fiche sans document est en attente, jamais consultable", async () => {
    const r = await base({ [`${dir}/prog.pdf.meta`]: "id: P-9\ntitre: Programme à venir\nstatut: ACTIF" });
    expect(r.docs).toHaveLength(0);
    expect(r.pending).toMatchObject([{ documentId: "P-9", statut: "ACTIF" }]);
  });
  it("détecte les ID en double", async () => {
    const r = await base({ [`${dir}/a.md`]: "---\nid: P-1\nstatut: ACTIF\n---\na", [`${dir}/b.md`]: "---\nid: P-1\nstatut: ACTIF\n---\nb" });
    expect(r.issues.filter((i) => i.level === "erreur")[0]!.message).toContain("ID P-1 déjà utilisé");
  });
});
