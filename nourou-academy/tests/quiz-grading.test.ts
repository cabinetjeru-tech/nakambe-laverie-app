import { describe, expect, it } from "vitest";
import { gradeObjective, summarize, type QuizQuestion } from "@/lib/learning/quiz-grading";

const q = (type: QuizQuestion["type"], correct: string[], points = 2): QuizQuestion => ({ id: "q", type, options: [], correctAnswers: correct, points });

describe("correction automatique", () => {
  it("choix unique", () => {
    expect(gradeObjective(q("SINGLE", ["o1"]), "o1").score).toBe(2);
    expect(gradeObjective(q("SINGLE", ["o1"]), "o0").score).toBe(0);
  });
  it("choix multiples : toutes les bonnes réponses, sans erreur", () => {
    expect(gradeObjective(q("MULTIPLE", ["o0", "o2"]), ["o2", "o0"]).correct).toBe(true);
    expect(gradeObjective(q("MULTIPLE", ["o0", "o2"]), ["o0"]).correct).toBe(false);
    expect(gradeObjective(q("MULTIPLE", ["o0", "o2"]), ["o0", "o1", "o2"]).correct).toBe(false);
  });
  it("réponse courte tolérante aux accents et à la casse", () => {
    expect(gradeObjective(q("SHORT", ["NB.SI"]), " nb si ").correct).toBe(true);
    expect(gradeObjective(q("SHORT", ["catalogue"]), "Le Catalogue").correct).toBe(false);
    expect(gradeObjective(q("SHORT", ["le catalogue", "catalogue"]), "Catalogue").correct).toBe(true);
  });
  it("les questions ouvertes ne sont pas notées automatiquement", () => {
    expect(gradeObjective(q("OPEN", []), "texte").correct).toBeNull();
  });
  it("résumé et seuil de réussite", () => {
    expect(summarize([{ score: 7, max: 10 }], 70)).toEqual({ score: 7, max: 10, percent: 70, passed: true });
    expect(summarize([{ score: 6, max: 10 }], 70).passed).toBe(false);
  });
});
