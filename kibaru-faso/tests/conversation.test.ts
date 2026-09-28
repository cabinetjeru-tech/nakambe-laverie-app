import { describe, expect, it } from "vitest";
import { chatRequestSchema, formatContextBlock, normalizeHistory } from "@/lib/conversation";
import { splitDocuments } from "@/lib/documents";
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
    for (const s of ["KIBARU FASO", "INTERDICTION D'INVENTER", "PROPOSITION KIBARU", "À VÉRIFIER", "DOCUMENT 2 — CORRIGÉ", "Cette information n'a pas été retrouvée"]) {
      expect(SYSTEM_PROMPT).toContain(s);
    }
  });
  it("les modèles d'action utilisent le contexte ou des crochets à compléter", () => {
    const lecon = TEMPLATES.find((t) => t.id === "lecon")!;
    expect(lecon.build({})).toContain("[classe]");
    expect(lecon.build({ classe: "6e", discipline: "Mathématiques", theme: "Les fractions" })).toContain("Mathématiques en 6e sur « Les fractions »");
  });
});
