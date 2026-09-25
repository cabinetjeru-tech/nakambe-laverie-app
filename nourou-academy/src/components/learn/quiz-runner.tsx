"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { submitQuizAction, type QuizResult } from "@/app/actions/assessments";
import { Alert, buttonClass } from "../ui";

export type RunnerQuestion = { id: string; type: "SINGLE" | "MULTIPLE" | "TRUE_FALSE" | "SHORT" | "OPEN"; prompt: string; options: { id: string; text: string }[]; points: number };

export function QuizRunner({ quizId, questions, passingScore, attemptsLeft }: { quizId: string; questions: RunnerQuestion[]; passingScore: number; attemptsLeft: number | null }) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (id: string, v: string | string[]) => setAnswers((a) => ({ ...a, [id]: v }));
  const unanswered = questions.filter((q) => {
    const a = answers[q.id];
    return a === undefined || (Array.isArray(a) ? a.length === 0 : !a.trim());
  }).length;

  if (result?.ok) {
    return (
      <div className="space-y-4">
        <div className={clsx("rounded-2xl p-6 text-center", result.status === "PENDING_REVIEW" ? "bg-amber-50" : result.passed ? "bg-emerald-50" : "bg-red-50")}>
          <div className="text-4xl font-extrabold text-navy">{result.percent} %</div>
          <div className="mt-1 text-sm text-muted">{result.score} / {result.maxScore} points · seuil de réussite {passingScore} %</div>
          <div className="mt-2 font-semibold">
            {result.status === "PENDING_REVIEW" ? (
              <span className="inline-flex items-center gap-1 text-amber-800"><Clock className="h-4 w-4" /> En attente de validation par le formateur</span>
            ) : result.passed ? (
              <span className="text-emerald-700">Bravo, évaluation réussie !</span>
            ) : (
              <span className="text-red-700">Pas encore : relisez les explications et réessayez.</span>
            )}
          </div>
        </div>
        <ol className="space-y-3">
          {questions.map((q, i) => {
            const f = result.feedback.find((x) => x.questionId === q.id);
            return (
              <li key={q.id} className="rounded-xl border border-line bg-white p-4 text-sm">
                <div className="flex items-start gap-2">
                  {f?.correct === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : f?.correct === false ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                  <div className="flex-1">
                    <div className="font-medium text-navy">{i + 1}. {q.prompt}</div>
                    <div className="mt-1 text-xs text-muted">{f ? `${Math.round(f.score * 10) / 10} / ${f.max} pt` : ""}</div>
                    {f?.feedback && <p className="mt-2">{f.feedback}</p>}
                    {f?.errors && f.errors.length > 0 && <ul className="mt-1 list-disc pl-5 text-red-700">{f.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                    {f?.improvements && f.improvements.length > 0 && <ul className="mt-1 list-disc pl-5 text-emerald-800">{f.improvements.map((e) => <li key={e}>{e}</li>)}</ul>}
                    {f?.explanation && <p className="mt-2 rounded-lg bg-sky-50 p-2 text-xs text-navy">💡 {f.explanation}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <button
          className={buttonClass("outline")}
          onClick={() => {
            setResult(null);
            setAnswers({});
            router.refresh();
          }}
        >
          Refaire le quiz
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (unanswered > 0 && !confirm(`${unanswered} question(s) sans réponse. Envoyer quand même ?`)) return;
        start(async () => setResult(await submitQuizAction(quizId, answers)));
      }}
    >
      {result && !result.ok && <Alert tone="error">{result.error}</Alert>}
      {attemptsLeft !== null && <Alert tone="info">Tentatives restantes : {attemptsLeft}</Alert>}
      {questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl border border-line bg-white p-4">
          <legend className="sr-only">Question {i + 1}</legend>
          <div className="text-sm font-medium text-navy">{i + 1}. {q.prompt} <span className="text-xs font-normal text-muted">({q.points} pt{q.points > 1 ? "s" : ""})</span></div>
          <div className="mt-3 space-y-2">
            {(q.type === "SINGLE" || q.type === "TRUE_FALSE") &&
              q.options.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-sky has-[:checked]:bg-sky-50">
                  <input type="radio" name={q.id} value={o.id} checked={answers[q.id] === o.id} onChange={() => set(q.id, o.id)} />
                  {o.text}
                </label>
              ))}
            {q.type === "MULTIPLE" &&
              q.options.map((o) => {
                const cur = (answers[q.id] as string[] | undefined) ?? [];
                return (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-sky has-[:checked]:bg-sky-50">
                    <input type="checkbox" checked={cur.includes(o.id)} onChange={(e) => set(q.id, e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id))} />
                    {o.text}
                  </label>
                );
              })}
            {q.type === "MULTIPLE" && <div className="text-xs text-muted">Plusieurs réponses possibles.</div>}
            {q.type === "SHORT" && <input className="h-10 w-full rounded-lg border border-line px-3 text-sm" value={(answers[q.id] as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} maxLength={200} />}
            {q.type === "OPEN" && <textarea rows={5} className="w-full rounded-lg border border-line px-3 py-2 text-sm" value={(answers[q.id] as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} maxLength={6000} placeholder="Rédigez votre réponse…" />}
          </div>
        </fieldset>
      ))}
      <button disabled={pending} className={buttonClass("primary", "lg")}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} {pending ? "Correction en cours…" : "Valider mes réponses"}
      </button>
    </form>
  );
}
