import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decide, formatDecisionBlock, identifyRequest } from "@/lib/base/decision";
import { loadBase } from "@/lib/base/load";
import { parseCsv, readRegistry, REGISTRY_COLUMNS, toCsv } from "@/lib/base/registry";
import { ID_FORMAT, parseDocType, subjectCodes } from "@/lib/base/structure";
import { resolveBase, searchDocuments, type RefDocument } from "@/lib/search";

describe("registre maître (fichier du projet)", () => {
  it("contient les 21 ressources initiales, au bon format, toutes À VÉRIFIER", async () => {
    const content = await readFile(path.join(process.cwd(), "base-documentaire/REGISTRE_MAITRE.csv"), "utf8");
    const { entries, problems } = readRegistry(content);
    expect(problems).toEqual([]);
    expect(entries).toHaveLength(21);
    for (const e of entries) {
      expect(e.meta.documentId).toMatch(ID_FORMAT);
      expect(e.meta.statut).toBe("A_VERIFIER");
      expect(e.meta.type).toBe("GUIDE_PEDAGOGIQUE");
      expect(e.meta.annee).toBeUndefined(); // « À vérifier » : jamais inventé
      expect(e.meta.version).toBeUndefined();
    }
    const fr = entries.find((e) => e.meta.documentId === "BF-6E-FR-001")!.meta;
    expect(fr.classes).toEqual(["6e", "5e"]);
    expect(entries.filter((e) => e.meta.priorite === "MOYENNE").map((e) => e.meta.documentId)).toEqual(["BF-6E-EPS-001", "BF-5E-EPS-001", "BF-4E-EPS-001"]);
  });
  it("n'a aucune erreur bloquante", async () => {
    const base = await loadBase();
    expect(base.issues.filter((i) => i.level === "erreur")).toEqual([]);
    expect(base.pending).toHaveLength(21);
  });
});

describe("CSV", () => {
  it("relit ce qu'il écrit, y compris « ; », guillemets et retours à la ligne", () => {
    const rows = [["ID", "Observations"], ["BF-6E-MATH-001", 'Guide "officiel" ; ancien\nà vérifier']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("signale les colonnes manquantes", () => {
    expect(readRegistry("ID;Titre officiel\nX;Y").problems[0]).toContain("colonnes absentes");
  });
  it("les 23 colonnes couvrent toutes les métadonnées obligatoires", () => {
    expect(REGISTRY_COLUMNS).toHaveLength(23);
  });
});

describe("types et matières", () => {
  it("normalise les types de documents", () => {
    expect(["Guide", "guide pédagogique", "PROGRAMME", "Note de service", "Circulaire", "Examen"].map(parseDocType)).toEqual([
      "GUIDE_PEDAGOGIQUE", "GUIDE_PEDAGOGIQUE", "PROGRAMME", "NOTE_DE_SERVICE", "CIRCULAIRE", "EXAMEN",
    ]);
    expect(parseDocType("brochure")).toBeUndefined();
  });
  it("donne les codes matière", () => {
    expect([...subjectCodes("Histoire-Géographie")]).toEqual(["HIST", "GEO"]);
    expect([...subjectCodes("Sciences physiques")]).toEqual(["PHYS"]);
    expect([...subjectCodes("EPS")]).toEqual(["EPS"]);
  });
});

describe("registre et documents déposés", () => {
  async function base(files: Record<string, string>) {
    const root = await mkdtemp(path.join(tmpdir(), "kibaru-reg-"));
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await writeFile(path.join(root, rel), content);
    }
    return loadBase(root);
  }
  const header = REGISTRY_COLUMNS.join(";");
  const row = (v: Record<string, string>) => REGISTRY_COLUMNS.map((c) => v[c] ?? "").join(";");
  const dir = "02_GUIDES_PEDAGOGIQUES/BURKINA_FASO/POST_PRIMAIRE/6E/MATHEMATIQUES";

  it("le registre l'emporte sur la fiche du document, et le désaccord est signalé", async () => {
    const r = await base({
      "REGISTRE_MAITRE.csv": `${header}\n${row({ ID: "BF-6E-MATH-001", "Titre officiel": "Guide 6e", Statut: "ACTIF", "Niveau de source": "2", Fichier: `${dir}/guide.md` })}`,
      [`${dir}/guide.md`]: "---\nid: BF-6E-MATH-001\nstatut: À vérifier\n---\nfractions",
    });
    expect(r.docs[0]).toMatchObject({ documentId: "BF-6E-MATH-001", statut: "ACTIF", sourceLevel: 2, title: "Guide 6e" });
    expect(r.issues.some((i) => i.message.includes("statut différent entre le registre (ACTIF)"))).toBe(true);
    expect(r.pending).toEqual([]);
  });
  it("une ligne du registre sans document est NON ENCORE INTÉGRÉE, avec son dossier de dépôt", async () => {
    const r = await base({ "REGISTRE_MAITRE.csv": `${header}\n${row({ ID: "BF-2NDE-PHILO-001", "Titre officiel": "Programme de philosophie", Classe: "2nde", Matière: "Philosophie", "Type de document": "PROGRAMME" })}` });
    expect(r.pending[0]).toMatchObject({ documentId: "BF-2NDE-PHILO-001", statut: "A_VERIFIER", expectedLocation: "01_PROGRAMMES_ET_CURRICULA/BURKINA_FASO/SECONDAIRE/2NDE/PHILOSOPHIE/" });
  });
  it("signale un document déposé mais absent du registre, un ID hors format et un ID en double", async () => {
    const r = await base({
      "REGISTRE_MAITRE.csv": `${header}\n${row({ ID: "BF-6E-MATH-001" })}\n${row({ ID: "bf-6e-math-001" })}\n${row({ ID: "MATHS6" })}`,
      [`${dir}/autre.md`]: "---\nid: X-1\nstatut: ACTIF\n---\ntexte",
    });
    const msgs = r.issues.map((i) => `${i.level}: ${i.message}`);
    expect(msgs.some((m) => m.startsWith("erreur: ID bf-6e-math-001 déjà présent"))).toBe(true);
    expect(msgs.some((m) => m.includes("ID MATHS6 hors du format recommandé"))).toBe(true);
    expect(msgs.some((m) => m.includes("absente du registre maître"))).toBe(true);
  });
});

describe("moteur de décision documentaire", () => {
  const doc = (p: Partial<RefDocument>): RefDocument => ({
    id: "d",
    title: "Guide",
    type: "GUIDE_PEDAGOGIQUE",
    origin: "bibliotheque",
    classes: ["6e"],
    disciplines: ["Mathématiques"],
    statut: "ACTIF",
    text: "les fractions en 6e",
    ...p,
  });

  it("étape 1 : la classe et la matière écrites dans la demande l'emportent sur le contexte", () => {
    const p = identifyRequest("Prépare un devoir de maths de 4ème sur Thalès", { classe: "6e", discipline: "Français", theme: "Thalès" });
    expect(p).toMatchObject({ pays: "Burkina Faso", classe: "4e", niveau: "Post-primaire", matiere: "Mathématiques", typeDemande: "devoir", origineClasse: "message", origineMatiere: "message" });
    expect(identifyRequest("Prépare le cours du 3e trimestre", { classe: "5e" }).classe).toBe("5e");
    expect(identifyRequest("Séance en Terminale", {}).niveau).toBe("Secondaire");
  });

  const run = (docs: RefDocument[], pending = 0) => {
    const profile = identifyRequest("fractions", { classe: "6e", discipline: "Mathématiques" });
    const { usable, history } = resolveBase(docs);
    const excerpts = searchDocuments(usable, "fractions");
    const pend = Array.from({ length: pending }, (_, i) => ({ path: `p${i}`, documentId: `BF-6E-MATH-00${i + 2}`, title: "Programme", statut: "A_VERIFIER" as const, classes: ["6e"], disciplines: ["Mathématiques"], expectedLocation: "" }));
    return decide(profile, usable, excerpts, history, pend);
  };

  it("étape 6 : confiance ÉLEVÉE seulement avec une ressource ACTIVE officielle (niveau 1 ou 2)", () => {
    expect(run([doc({ sourceLevel: 2, documentId: "BF-6E-MATH-001" })]).confidence).toBe("ELEVEE");
    expect(run([doc({ sourceLevel: 4 })]).confidence).toBe("MOYENNE");
    expect(run([doc({ statut: "PROVISOIRE", sourceLevel: 1 })]).confidence).toBe("MOYENNE");
  });
  it("officiel ≠ actuel : une ressource officielle À VÉRIFIER ne donne qu'une confiance FAIBLE", () => {
    const d = run([doc({ statut: "A_VERIFIER", sourceLevel: 2, documentId: "BF-6E-MATH-001" })]);
    expect(d.confidence).toBe("FAIBLE");
    expect(formatDecisionBlock(d)).toContain("source officielle historique, jamais comme le programme actuellement en vigueur");
  });
  it("aucune ressource : confiance AUCUNE, ressources non intégrées signalées", () => {
    const d = run([], 1);
    expect(d.confidence).toBe("AUCUNE");
    const block = formatDecisionBlock(d);
    expect(block).toContain("1 NON ENCORE INTÉGRÉE(S) [BF-6E-MATH-002 — Programme]");
    expect(block).toContain("formulation de non-confirmation");
  });
  it("étape 4 : plusieurs ressources du même type sont à comparer, jamais tranchées arbitrairement", () => {
    const d = run([doc({ id: "a", documentId: "BF-6E-MATH-001", version: "1", year: "2010" }), doc({ id: "b", documentId: "BF-6E-MATH-002", version: "2", year: "2020", statut: "PROVISOIRE" })]);
    expect(formatDecisionBlock(d)).toContain("Guide pédagogique : BF-6E-MATH-001 v1 (2010) ACTIF / BF-6E-MATH-002 v2 (2020) PROVISOIRE — plusieurs ressources du même type");
  });
});
