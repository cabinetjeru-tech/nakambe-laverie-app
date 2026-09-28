import { describe, expect, it } from "vitest";
import { decide, formatDecisionBlock, identifyConversation, identifyRequest, targetPrefix } from "@/lib/base/decision";
import { finalCheck } from "@/lib/base/final-check";
import { identifyNeeds } from "@/lib/base/needs";
import { splitDocuments } from "@/lib/documents";
import { resolveBase, searchDocuments, type RefDocument } from "@/lib/search";

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

function run(docs: RefDocument[], message = "Prépare une leçon de maths de 6e sur les fractions", pending = 0) {
  const profile = identifyRequest(message, {});
  const { usable, history } = resolveBase(docs);
  const excerpts = searchDocuments(usable, "fractions", { classe: profile.classe, discipline: profile.matiere });
  const pend = Array.from({ length: pending }, (_, i) => ({ path: `p${i}`, documentId: `BF-6E-MATH-00${i + 2}`, title: "Programme", statut: "A_VERIFIER" as const, classes: ["6e"], disciplines: ["Mathématiques"], expectedLocation: "" }));
  return decide(profile, usable, excerpts, history, pend);
}

describe("identification du besoin (section 3)", () => {
  it("reconnaît et combine les besoins", () => {
    expect(identifyNeeds("Crée un devoir de 4e sur les équations avec corrigé et barème")).toEqual(["devoir", "correction", "bareme"]);
    expect(identifyNeeds("Mes élèves n’ont pas compris Thalès : remédiation différenciée")).toEqual(["remediation", "differenciation"]);
    expect(identifyNeeds("Comment gérer une classe pléthorique ?")).toEqual(["gestion_classe", "conseil"]);
    expect(identifyNeeds("Une série de 10 exercices sur les fractions")).toEqual(["serie_exercices"]);
    expect(identifyNeeds("Merci")).toEqual(["autre"]);
  });
});

describe("identification du contexte (sections 4 et 5)", () => {
  it("« Prépare-moi une leçon sur les fractions » : demande la classe, déduit la matière", () => {
    const p = identifyRequest("Prépare-moi une leçon sur les fractions", {});
    expect(p.missing).toEqual(["classe"]);
    expect(p.question).toBe("Pour quelle classe souhaitez-vous cette préparation de cours : 6e, 5e, 4e, 3e, 2nde, 1ère ou Terminale ?");
    expect(p).toMatchObject({ matiere: "Mathématiques", origineMatiere: "theme" });
    expect(p.assumptions.some((a) => a.includes("durée non précisée"))).toBe(true);
  });
  it("ne pose aucune question quand le contexte minimal est connu, ni pour une demande générale", () => {
    expect(identifyRequest("Prépare-moi une leçon sur les fractions", { classe: "6e" }).question).toBeUndefined();
    expect(identifyRequest("Comment motiver mes élèves ?", {}).question).toBeUndefined();
  });
  it("demande classe et matière quand rien ne permet de les déduire", () => {
    expect(identifyRequest("Prépare un devoir", {}).missing).toEqual(["classe", "matiere"]);
  });
  it("une réponse courte complète la demande précédente ; le message le plus récent l'emporte", () => {
    const p = identifyConversation(["Prépare-moi une leçon sur les fractions.", "Classe : 6e."], {});
    expect(p).toMatchObject({ classe: "6e", matiere: "Mathématiques", needs: ["preparation_cours"], missing: [] });
    expect(p.question).toBeUndefined();
    const q = identifyConversation(["Prépare un devoir de maths de 6e", "Finalement, fais-le en 5e"], {});
    expect([q.classe, q.needs]).toEqual(["5e", ["devoir"]]);
  });
  it("cible la recherche sur le préfixe d'ID (section 6)", () => {
    expect(targetPrefix({ classe: "6e", matiere: "Mathématiques" })).toBe("BF-6E-MATH");
    expect(targetPrefix({ classe: "Terminale", matiere: "Physique-Chimie" })).toBe("BF-TERM-PHYS");
  });
});

describe("sélection des sources et niveaux de confiance (sections 7 à 10)", () => {
  it("ÉLEVÉE : source officielle active et pertinente", () => {
    expect(run([doc({ sourceLevel: 2, documentId: "BF-6E-MATH-001" })]).confidence).toBe("ELEVEE");
  });
  it("MOYENNE : source officielle pertinente mais à vérifier — avec réserve", () => {
    const d = run([doc({ statut: "A_VERIFIER", sourceLevel: 2, documentId: "BF-6E-MATH-001" })]);
    expect(d.confidence).toBe("MOYENNE");
    expect(formatDecisionBlock(d)).toContain("Signale la réserve appropriée");
  });
  it("FAIBLE : seulement des ressources complémentaires", () => {
    expect(run([doc({ sourceLevel: 4 })]).confidence).toBe("FAIBLE");
  });
  it("NON CONFIRMÉE : aucune base suffisante, avec la formulation exacte", () => {
    const d = run([], undefined, 1);
    expect(d.confidence).toBe("NON_CONFIRMEE");
    const block = formatDecisionBlock(d);
    expect(block).toContain("« Cette information n'est pas confirmée dans la base documentaire PÉDAGOGUE.IA disponible. »");
    expect(block).toContain("1 NON ENCORE INTÉGRÉE(S) [BF-6E-MATH-002 — Programme]");
  });
  it("ordre de priorité : officielle active spécifique > officielle active générale > officielle à vérifier > institutionnelle > pédagogique", () => {
    const d = run([
      doc({ id: "peda", documentId: "P", sourceLevel: 4 }),
      doc({ id: "inst", documentId: "I", sourceLevel: 3 }),
      doc({ id: "verif", documentId: "V", sourceLevel: 2, statut: "A_VERIFIER" }),
      doc({ id: "gen", documentId: "G", sourceLevel: 1, classes: [], type: "TEXTE_OFFICIEL" }),
      doc({ id: "spec", documentId: "S", sourceLevel: 2, type: "PROGRAMME" }),
    ]);
    expect(d.cards.map((c) => c.doc.documentId)).toEqual(["S", "G", "V", "I", "P"]);
    const block = formatDecisionBlock(d);
    expect(block).toContain("- S [extrait retrouvé] — priorité : source officielle active et spécifique ; autorité : niveau 2 — document curriculaire officiel");
    expect(block).toContain("actualité : non confirmée (année non renseignée)");
  });
  it("une source ancienne n'est pas rejetée, une source récente n'est pas préférée pour sa date", () => {
    const d = run([doc({ id: "a", documentId: "A", year: "2008", sourceLevel: 2 }), doc({ id: "b", documentId: "B", year: "2024", sourceLevel: 2, type: "MANUEL" })]);
    expect(d.cards.map((c) => c.doc.documentId).sort()).toEqual(["A", "B"]);
  });
  it("contexte manquant : la consigne est de poser la question, pas de produire", () => {
    const profile = identifyRequest("Prépare-moi une leçon sur les fractions", {});
    const block = formatDecisionBlock(decide(profile, [], [], [], []));
    expect(block).toContain("Ne produis pas encore la préparation : pose uniquement cette question");
  });
  it("à pertinence égale, le programme passe avant le guide (section 6)", () => {
    const docs = [doc({ id: "g", type: "GUIDE_PEDAGOGIQUE", sourceLevel: 2 }), doc({ id: "p", type: "PROGRAMME", sourceLevel: 2 })];
    expect(searchDocuments(docs, "fractions").map((e) => e.doc.id)).toEqual(["p", "g"]);
  });
});

describe("contrôle final automatique (section 17)", () => {
  const base = { labels: ["R1"], knownIds: ["BF-6E-MATH-001"], confidence: "MOYENNE" as const, needs: ["preparation_cours" as const], questionExpected: false };
  it("signale renvois et identifiants inconnus", () => {
    const out = finalCheck({ ...base, answer: "Objectif [R1] et [R4]. Voir BF-6E-MATH-009 et BF-6E-MATH-001." });
    expect(out[0]).toContain("[R4]");
    expect(out[1]).toBe("Identifiant(s) absent(s) du registre maître : BF-6E-MATH-009.");
  });
  it("signale une affirmation sur le programme en vigueur non confirmée, mais pas une affirmation nuancée", () => {
    expect(finalCheck({ ...base, answer: "Conformément au programme en vigueur, la leçon dure 2 heures." }).join()).toContain("sans source ACTIVE");
    expect(finalCheck({ ...base, answer: "Le programme en vigueur n'est pas confirmé dans la base : à vérifier." })).toEqual([]);
  });
  it("signale SOURCE PÉDAGOGUE.IA sans source, et l'absence de corrigé d'un devoir", () => {
    const long = "x ".repeat(400);
    const out = finalCheck({ ...base, confidence: "NON_CONFIRMEE", needs: ["devoir"], answer: `**SOURCE PÉDAGOGUE.IA** ${long}` });
    expect(out.join("\n")).toContain("aucune ressource de la base n'a été consultée");
    expect(out.join("\n")).toContain("Aucun corrigé repéré");
  });
});

describe("format de réponse standard (section 20)", () => {
  it("le corrigé imprimé s'arrête avant « Statut des informations »", () => {
    const md = "## Contexte\nClasse : 6e\n## DOCUMENT 1 — SUJET\nEx 1\n## DOCUMENT 2 — CORRIGÉ\nRép 1\n### Détail\nd\n## Statut des informations\n- SOURCE PÉDAGOGUE.IA : …";
    const parts = splitDocuments(md);
    expect(parts.map((p) => p.markdown)).toEqual(["Ex 1", "Rép 1\n### Détail\nd"]);
  });
});
