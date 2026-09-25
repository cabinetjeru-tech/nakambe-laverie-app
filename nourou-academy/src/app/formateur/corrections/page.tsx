import { ClipboardCheck, Sparkles } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { signedFileUrl } from "@/lib/storage";
import { formatDateTime } from "@/lib/format";
import { gradeSubmissionAction, validateAttemptAction } from "@/app/actions/trainer";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui";

export const metadata = { title: "Corrections" };

type Fb = { questionId: string; score: number; max: number; correct: boolean | null; feedback?: string; pendingHuman?: boolean };

export default async function CorrectionsPage() {
  const user = await requirePermission("grading.access");
  const scope: Prisma.CourseWhereInput = ["SUPERADMIN", "ADMIN", "ASSISTANT"].includes(user.role) ? {} : { trainerId: user.id };
  const [attempts, submissions] = await Promise.all([
    prisma.quizAttempt.findMany({ where: { status: "PENDING_REVIEW", quiz: { course: scope } }, orderBy: { createdAt: "asc" }, take: 30, include: { user: { select: { name: true } }, quiz: { include: { course: { select: { title: true } }, questions: { orderBy: { position: "asc" } } } } } }),
    prisma.submission.findMany({ where: { status: { in: ["SUBMITTED", "AI_REVIEWED"] }, assignment: { course: scope } }, orderBy: { createdAt: "asc" }, take: 30, include: { user: { select: { name: true } }, files: { include: { file: true } }, assignment: { include: { course: { select: { title: true } } } } } }),
  ]);
  return (
    <>
      <PageHeader title="Corrections et validations" subtitle="Évaluations soumises à validation humaine et devoirs à noter. Les propositions de l'IA sont indicatives : vous gardez la décision finale." />
      {attempts.length === 0 && submissions.length === 0 && <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="Rien à corriger pour le moment" />}

      {submissions.length > 0 && <h2 className="mb-3 text-lg font-bold text-navy">Devoirs ({submissions.length})</h2>}
      <div className="space-y-4">
        {submissions.map((s) => {
          const ai = s.aiFeedback as { summary?: string; criteria?: { criterion: string; points: number; max: number; comment: string }[]; improvements?: string[] } | null;
          return (
            <Card key={s.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><div className="font-semibold text-navy">{s.assignment.title}</div><div className="text-xs text-muted">{s.user.name} · {s.assignment.course.title} · {formatDateTime(s.createdAt)}</div></div>
                  {s.assignment.isProject && <Badge tone="accent">Projet certifiant</Badge>}
                </div>
                {s.text && <div className="whitespace-pre-line rounded-lg bg-surface p-3 text-sm">{s.text}</div>}
                {s.files.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {s.files.map(({ file }) =>
                      file.mimeType.startsWith("image/") ? (
                        <a key={file.id} href={signedFileUrl(file.id)} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={signedFileUrl(file.id)} alt={file.originalName} className="h-32 w-32 rounded-lg border border-line object-cover" />
                        </a>
                      ) : (
                        <a key={file.id} href={signedFileUrl(file.id, { download: true })} className="rounded-lg border border-line px-3 py-2 text-sm text-sky hover:bg-sky-50">{file.originalName}</a>
                      ),
                    )}
                  </div>
                )}
                {ai?.summary && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
                    <div className="flex items-center gap-1 font-semibold text-navy"><Sparkles className="h-4 w-4 text-accent" /> Proposition de l'IA : {s.aiScore} / {s.assignment.maxScore}</div>
                    <p className="mt-1">{ai.summary}</p>
                    {ai.criteria && <ul className="mt-1">{ai.criteria.map((c) => <li key={c.criterion}>• {c.criterion} : {c.points}/{c.max} — {c.comment}</li>)}</ul>}
                  </div>
                )}
                <ActionForm action={gradeSubmissionAction} className="grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end">
                  <input type="hidden" name="submissionId" value={s.id} />
                  <Field label={`Note / ${s.assignment.maxScore}`}><Input name="score" inputMode="decimal" defaultValue={s.aiScore ?? ""} required /></Field>
                  <Field label="Commentaire pour l'apprenant"><Textarea name="feedback" rows={2} /></Field>
                  <div className="flex gap-2">
                    <SubmitButton name="decision" value="grade">Valider la note</SubmitButton>
                    <SubmitButton name="decision" value="return" variant="outline">À reprendre</SubmitButton>
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {attempts.length > 0 && <h2 className="mb-3 mt-10 text-lg font-bold text-navy">Copies à valider ({attempts.length})</h2>}
      <div className="space-y-4">
        {attempts.map((a) => {
          const fb = a.feedback as Fb[];
          const answers = a.answers as Record<string, unknown>;
          return (
            <Card key={a.id}>
              <CardBody>
                <div className="font-semibold text-navy">{a.quiz.title}{a.quiz.isFinalExam && <Badge tone="accent" className="ml-2">Examen final</Badge>}</div>
                <div className="text-xs text-muted">{a.user.name} · {a.quiz.course.title} · {formatDateTime(a.createdAt)} · score provisoire {a.percent} %</div>
                <ActionForm action={validateAttemptAction} className="mt-4 space-y-3">
                  <input type="hidden" name="attemptId" value={a.id} />
                  {a.quiz.questions.map((q, i) => {
                    const f = fb.find((x) => x.questionId === q.id);
                    const ans = answers[q.id];
                    const opts = q.options as { id: string; text: string }[];
                    const shown = Array.isArray(ans) ? ans.map((x) => opts.find((o) => o.id === x)?.text ?? x).join(", ") : typeof ans === "string" ? (opts.find((o) => o.id === ans)?.text ?? ans) : "—";
                    return (
                      <div key={q.id} className="rounded-lg border border-line p-3 text-sm">
                        <div className="font-medium text-navy">{i + 1}. {q.prompt}</div>
                        <div className="mt-1 whitespace-pre-line rounded bg-surface p-2">{shown || "—"}</div>
                        {q.rubric && <div className="mt-1 text-xs text-muted">Barème : {q.rubric}</div>}
                        {f?.feedback && !f.pendingHuman && <div className="mt-1 text-xs text-sky">IA : {f.feedback}</div>}
                        <div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr]">
                          <Input name={`score_${q.id}`} defaultValue={f?.score ?? 0} inputMode="decimal" aria-label={`Points question ${i + 1} (max ${q.points})`} />
                          <Input name={`comment_${q.id}`} placeholder={`Commentaire (max ${q.points} pt)`} />
                        </div>
                      </div>
                    );
                  })}
                  <Field label="Note globale (facultatif)"><Input name="reviewNote" /></Field>
                  <SubmitButton>Valider la copie</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
