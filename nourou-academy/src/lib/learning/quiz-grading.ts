/**
 * Correction automatique des questions objectives (QCM, vrai/faux, réponse courte).
 * Fonction pure : aucune IA nécessaire — testée dans tests/quiz-grading.test.ts.
 */

export type QuizQuestion = {
  id: string;
  type: "SINGLE" | "MULTIPLE" | "TRUE_FALSE" | "SHORT" | "OPEN";
  options: { id: string; text: string }[];
  correctAnswers: string[];
  points: number;
};

export type ObjectiveResult = { questionId: string; score: number; max: number; correct: boolean | null };

function normalizeText(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function gradeObjective(q: QuizQuestion, answer: unknown): ObjectiveResult {
  const max = q.points;
  if (q.type === "OPEN") return { questionId: q.id, score: 0, max, correct: null };
  if (q.type === "SINGLE" || q.type === "TRUE_FALSE") {
    const ok = typeof answer === "string" && q.correctAnswers.includes(answer);
    return { questionId: q.id, score: ok ? max : 0, max, correct: ok };
  }
  if (q.type === "MULTIPLE") {
    const given = new Set(Array.isArray(answer) ? answer.filter((a): a is string => typeof a === "string") : []);
    const expected = new Set(q.correctAnswers);
    const ok = given.size === expected.size && [...expected].every((a) => given.has(a));
    return { questionId: q.id, score: ok ? max : 0, max, correct: ok };
  }
  // SHORT : comparaison tolérante (casse, accents, ponctuation)
  const given = typeof answer === "string" ? normalizeText(answer) : "";
  const ok = given.length > 0 && q.correctAnswers.some((a) => normalizeText(a) === given);
  return { questionId: q.id, score: ok ? max : 0, max, correct: ok };
}

export function summarize(results: { score: number; max: number }[], passingScore: number) {
  const score = results.reduce((s, r) => s + r.score, 0);
  const max = results.reduce((s, r) => s + r.max, 0);
  const percent = max > 0 ? Math.round((score / max) * 100) : 0;
  return { score, max, percent, passed: percent >= passingScore };
}
