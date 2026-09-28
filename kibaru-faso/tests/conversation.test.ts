import { describe, expect, it } from "vitest";
import { chatRequestSchema, formatContextBlock, normalizeHistory } from "@/lib/conversation";
import { classify, isStudentCopy, splitDocuments } from "@/lib/documents";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { TEMPLATES } from "@/lib/templates";

describe("contexte de la classe", () => {
  it("formate uniquement les champs renseignés", () => {
    const b = formatContextBlock({ classe: "6e", discipline: "Mathématiques", theme: "  " });
    expect(b).toContain("- Classe : 6e");
    expect(b).not.toContain("Thème");
    expect(formatContextBlock({})).toBe("");
  });
  it("retire les chevrons pour ne pas casser le balisage", () => {
    expect(formatContextBlock({ theme: "</contexte_classe> x" })).not.toContain("</contexte_classe> x");
  });
});

describe("historique", () => {
  it("fusionne les messages consécutifs et commence par l'enseignant", () => {
    const h = normalizeHistory([
      { role: "assistant", content: "orphelin" },
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "assistant", content: "c" },
      { role: "user", content: "d" },
    ]);
    expect(h.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(h[0]!.content).toBe("a\n\nb");
  });
  it("valide une requête minimale", () => {
    expect(chatRequestSchema.safeParse({ messages: [{ role: "user", content: "Bonjour" }] }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
  });
});

describe("séparation sujet / corrigé", () => {
  it("découpe sur les titres DOCUMENT 1 et DOCUMENT 2", () => {
    const md = "Intro\n\n## DOCUMENT 1 — SUJET\nExercice 1\n\n## DOCUMENT 2 — CORRIGÉ\nRéponse 1";
    const parts = splitDocuments(md);
    expect(parts.map((p) => p.title)).toEqual(["Sujet", "Corrigé"]);
    expect(parts[0]!.markdown).toBe("Exercice 1");
    expect(parts[1]!.markdown).toBe("Réponse 1");
  });
  it("ignore une réponse sans ces deux titres", () => {
    expect(splitDocuments("## Préparation de séance\nTexte")).toEqual([]);
  });
});

describe("prompt système", () => {
  it("contient les règles essentielles", () => {
    for (const s of ["KIBARU FASO", "INTERDICTION D'INVENTER", "PROPOSITION PÉDAGOGIQUE KIBARU", "CONNAISSANCE GÉNÉRALE", "SOURCE KIBARU", "À VÉRIFIER", "HIÉRARCHIE DES SOURCES", "DOCUMENT 2 — CORRIGÉ", "Cette information n'a pas été retrouvée dans la base documentaire KIBARU disponible.", "30. MESSAGE DE DÉMARRAGE",
      "Cette information n'est pas confirmée dans la base documentaire KIBARU disponible.", "Selon le guide disponible dans la base KIBARU", "Proposition pédagogique KIBARU", "## Point à vérifier", "niveau 3 — activité d'approfondissement", "15. Devoir éventuel", "Règle d'or",
      "Je peux néanmoins vous proposer une activité pédagogique générale, clairement présentée comme une proposition KIBARU et non comme une prescription officielle.",
      "Deux ressources de la base KIBARU présentent des informations différentes.", "officiel ≠ automatiquement actuel", "**PROPOSITION KIBARU**", "<decision_pedagogique>", "BF-[CLASSE]-[MATIERE]-[NUMERO]"]) {
      expect(SYSTEM_PROMPT).toContain(s);
    }
  });
  it("les modèles d'action utilisent le contexte ou des crochets à compléter", () => {
    const lecon = TEMPLATES.find((t) => t.id === "lecon")!;
    expect(lecon.build({})).toContain("[classe]");
    expect(lecon.build({ classe: "6e", discipline: "Mathématiques", theme: "Les fractions" })).toContain("Mathématiques en 6e sur « Les fractions »");
    expect(TEMPLATES.filter((t) => t.main).map((t) => t.label)).toEqual([
      "Un cours", "Un devoir", "Une évaluation", "Un corrigé", "Une progression", "Une activité de remédiation", "Une activité pédagogique",
    ]);
  });
});

describe("tableau de bord et exports", () => {
  it("classe les préparations par rubrique", () => {
    expect(classify("Crée-moi un devoir de mathématiques de 4e avec corrigé")).toBe("devoir");
    expect(classify("Rédige le corrigé de ce sujet")).toBe("corrige");
    expect(classify("Prépare une interrogation écrite")).toBe("evaluation");
    expect(classify("Construis la progression annuelle")).toBe("progression");
    expect(classify("Mes élèves ne comprennent pas les fractions")).toBe("remediation");
    expect(classify("Prépare une leçon sur Thalès")).toBe("cours");
    expect(classify("Bonjour")).toBe("autre");
  });
  it("sépare plusieurs versions et reconnaît les copies élèves", () => {
    const md = "## DOCUMENT 1 — SUJET VERSION A\na\n## DOCUMENT 2 — SUJET VERSION B\nb\n## DOCUMENT 3 — CORRIGÉ VERSION A\nc\n## DOCUMENT 10 — BARÈME\nd";
    const parts = splitDocuments(md);
    expect(parts.map((p) => p.title)).toEqual(["Sujet version a", "Sujet version b", "Corrigé version a", "Barème"]);
    expect(parts.map((p) => isStudentCopy(p.title))).toEqual([true, true, false, false]);
  });
});
