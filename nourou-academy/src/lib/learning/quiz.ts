import "server-only";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db";
import { courseAccess } from "../access";
import { gradeOpenAnswer } from "../ai/grading";
import { aiStatus } from "../ai/llm";
import { gradeObjective, summarize, type QuizQuestion } from "./quiz-grading";
import { saveLessonProgress } from "./progress";
import { evaluateCertificate } from "../certificates/issue";
import { notify } from "../notify";

export type QuestionFeedback = {
  questionId: string;
  score: number;
  max: number;
  correct: boolean | null;
  feedback?: string;
  errors?: string[];
  improvements?: string[];
  explanation?: string | null;
  pendingHuman?: boolean;
};

export async function submitQuizAttempt(user: SessionUser, quizId: string, answers: Record<string, unknown>) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: { position: "asc" } }, course: { select: { id: true, title: true, trainerId: true } } },
  });
  if (!quiz) throw new Error("Quiz introuvable.");
  if ((await courseAccess(user, quiz.courseId)) === "none") throw new Error("Accès refusé à cette évaluation.");
  if (quiz.maxAttempts > 0) {
    const n = await prisma.quizAttempt.count({ where: { quizId, userId: user.id } });
    if (n >= quiz.maxAttempts) throw new Error("Nombre maximal de tentatives atteint.");
  }

  const ai = await aiStatus();
  const feedback: QuestionFeedback[] = [];
  let aiUsed = false;
  let needsHuman = quiz.requiresHumanValidation;

  for (const q of quiz.questions) {
    const question: QuizQuestion = {
      id: q.id,
      type: q.type,
      options: (q.options as { id: string; text: string }[]) ?? [],
      correctAnswers: (q.correctAnswers as string[]) ?? [],
      points: q.points,
    };
    const answer = answers[q.id];
    if (q.type !== "OPEN") {
      const r = gradeObjective(question, answer);
      feedback.push({ ...r, explanation: q.explanation });
      continue;
    }
    const text = typeof answer === "string" ? answer.trim() : "";
    if (!text) {
      feedback.push({ questionId: q.id, score: 0, max: q.points, correct: false, feedback: "Aucune réponse fournie." });
      continue;
    }
    if (ai.chat) {
      try {
        const g = await gradeOpenAnswer({
          question: q.prompt,
          rubric: q.rubric,
          expected: question.correctAnswers,
          answer: text,
          maxPoints: q.points,
          userId: user.id,
        });
        aiUsed = true;
        feedback.push({
          questionId: q.id,
          score: g.score,
          max: q.points,
          correct: g.score >= q.points * 0.5,
          feedback: g.feedback,
          errors: g.errors,
          improvements: g.improvements,
          explanation: q.explanation,
        });
        continue;
      } catch (e) {
        console.error("[quiz] correction IA impossible :", (e as Error).message);
      }
    }
    // Pas d'IA disponible : correction par le formateur.
    needsHuman = true;
    feedback.push({ questionId: q.id, score: 0, max: q.points, correct: null, pendingHuman: true, feedback: "En attente de correction par le formateur." });
  }

  const sum = summarize(feedback, quiz.passingScore);
  const status = needsHuman ? "PENDING_REVIEW" : "GRADED";
  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId,
      userId: user.id,
      answers: answers as object,
      score: sum.score,
      maxScore: sum.max,
      percent: sum.percent,
      passed: status === "GRADED" ? sum.passed : false,
      status,
      aiUsed,
      feedback: feedback as object,
    },
  });

  // Lacunes : notions des questions échouées (alimente le tuteur IA).
  const failed = quiz.questions.filter((q) => feedback.find((f) => f.questionId === q.id)?.correct === false);
  if (failed.length) {
    await prisma.learningGap.createMany({
      data: failed.slice(0, 10).map((q) => ({
        userId: user.id,
        courseId: quiz.courseId,
        lessonId: quiz.lessonId,
        topic: (q.topic || q.prompt).slice(0, 180),
        detail: `Erreur au quiz « ${quiz.title} »`,
        source: "QUIZ",
      })),
    });
  }

  if (status === "GRADED" && sum.passed && quiz.lessonId) {
    await saveLessonProgress(user.id, quiz.lessonId, { completed: true });
  }
  if (status === "PENDING_REVIEW") {
    await notify(quiz.course.trainerId, {
      type: "GRADING",
      title: "Copie à valider",
      body: `${user.name} a soumis « ${quiz.title} ». Une validation humaine est requise.`,
      link: "/formateur/corrections",
    });
  }
  await evaluateCertificate(user.id, quiz.courseId);
  return attempt;
}
