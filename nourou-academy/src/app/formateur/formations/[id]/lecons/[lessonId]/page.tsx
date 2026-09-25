import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { canManageCourse } from "@/lib/access";
import { deleteAssetAction, deleteLessonAction, deleteQuestionAction, addQuestionAction, updateAssignmentAction, updateLessonAction, updateQuizSettingsAction } from "@/app/actions/trainer";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { FileUploader } from "@/components/forms/file-uploader";
import { MarkdownEditor } from "@/components/forms/markdown-editor";
import { Badge, Card, CardBody, Checkbox, Field, Input, PageHeader, Select, Textarea, buttonClass } from "@/components/ui";

const kindLabel = { VIDEO: "Vidéo", SUBTITLE: "Sous-titres", DOCUMENT: "Document" };
const qLabel = { SINGLE: "Choix unique", MULTIPLE: "Choix multiples", TRUE_FALSE: "Vrai / faux", SHORT: "Réponse courte", OPEN: "Réponse ouverte (correction IA / formateur)" };

export default async function LessonEditor({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = await params;
  const user = await requirePermission("trainer.access");
  if (!(await canManageCourse(user, id))) notFound();
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, module: { courseId: id } },
    include: { module: true, assets: { include: { file: true }, orderBy: { createdAt: "asc" } }, quiz: { include: { questions: { orderBy: { position: "asc" } } } }, assignment: true },
  });
  if (!lesson) notFound();
  const rubricText = lesson.assignment ? (lesson.assignment.rubric as { criterion: string; points: number; description?: string }[]).map((r) => `${r.criterion} | ${r.points} | ${r.description ?? ""}`).join("\n") : "";

  return (
    <>
      <PageHeader title={lesson.title} subtitle={`Module : ${lesson.module.title}`} actions={<Link href={`/formateur/formations/${id}?onglet=programme`} className={buttonClass("outline")}>← Programme</Link>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card><CardBody>
            <ActionForm action={updateLessonAction} className="space-y-4">
              <input type="hidden" name="lessonId" value={lesson.id} />
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field label="Titre"><Input name="title" defaultValue={lesson.title} required /></Field>
                <Field label="Durée (min)"><Input name="durationMinutes" type="number" min={0} defaultValue={lesson.durationMinutes} /></Field>
              </div>
              {(lesson.type === "VIDEO" || lesson.videoUrl) && (
                <Field label="Vidéo hébergée ailleurs (facultatif)" hint="YouTube, Vimeo ou URL directe d'un fichier MP4 sur un hébergeur vidéo. Sinon, téléversez le fichier à droite.">
                  <Input name="videoUrl" type="url" defaultValue={lesson.videoUrl ?? ""} placeholder="https://…" />
                </Field>
              )}
              <Field label="Contenu de la leçon (Markdown)" hint="Ce texte est affiché aux apprenants et indexé pour le tuteur IA.">
                <MarkdownEditor name="content" defaultValue={lesson.content ?? ""} />
              </Field>
              <Checkbox name="isPreview" defaultChecked={lesson.isPreview} label="Leçon d'aperçu gratuite (visible sans inscription)" />
              <SubmitButton>Enregistrer la leçon</SubmitButton>
            </ActionForm>
          </CardBody></Card>

          {lesson.quiz && (
            <Card><CardBody className="space-y-5">
              <h2 className="text-lg font-bold text-navy">Quiz</h2>
              <ActionForm action={updateQuizSettingsAction} className="grid gap-4 sm:grid-cols-3">
                <input type="hidden" name="quizId" value={lesson.quiz.id} />
                <Field label="Titre" className="sm:col-span-3"><Input name="title" defaultValue={lesson.quiz.title} /></Field>
                <Field label="Seuil de réussite (%)"><Input name="passingScore" type="number" min={0} max={100} defaultValue={lesson.quiz.passingScore} /></Field>
                <Field label="Tentatives max (0 = illimité)"><Input name="maxAttempts" type="number" min={0} defaultValue={lesson.quiz.maxAttempts} /></Field>
                <div className="space-y-2 pt-6">
                  <Checkbox name="isFinalExam" defaultChecked={lesson.quiz.isFinalExam} label="Examen final" />
                  <Checkbox name="requiresHumanValidation" defaultChecked={lesson.quiz.requiresHumanValidation} label="Validation humaine obligatoire" />
                </div>
                <div className="sm:col-span-3"><SubmitButton size="sm" variant="outline">Enregistrer les paramètres</SubmitButton></div>
              </ActionForm>
              <ol className="space-y-2">
                {lesson.quiz.questions.map((q, i) => {
                  const opts = q.options as { id: string; text: string }[];
                  const correct = q.correctAnswers as string[];
                  return (
                    <li key={q.id} className="rounded-xl border border-line p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="font-medium text-navy">{i + 1}. {q.prompt}</div>
                          <div className="mt-1 flex flex-wrap gap-1"><Badge tone="gray">{qLabel[q.type]}</Badge><Badge tone="sky">{q.points} pt</Badge>{q.topic && <Badge tone="accent">{q.topic}</Badge>}</div>
                          {opts.length > 0 && <ul className="mt-2 space-y-0.5">{opts.map((o) => <li key={o.id} className={correct.includes(o.id) ? "font-semibold text-emerald-700" : ""}>{correct.includes(o.id) ? "✓" : "•"} {o.text}</li>)}</ul>}
                          {q.type === "SHORT" && <div className="mt-1 text-xs text-muted">Réponses acceptées : {correct.join(" / ")}</div>}
                          {q.rubric && <div className="mt-1 text-xs text-muted">Barème : {q.rubric}</div>}
                        </div>
                        <form action={deleteQuestionAction.bind(null, q.id)}><button className="text-muted hover:text-red-600" aria-label="Supprimer la question"><Trash2 className="h-4 w-4" /></button></form>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <details className="rounded-xl border border-dashed border-line p-4" open={lesson.quiz.questions.length === 0}>
                <summary className="cursor-pointer text-sm font-semibold text-navy">+ Ajouter une question</summary>
                <ActionForm action={addQuestionAction} className="mt-4 space-y-3" resetOnSuccess>
                  <input type="hidden" name="quizId" value={lesson.quiz.id} />
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <Field label="Type"><Select name="type" defaultValue="SINGLE">{Object.entries(qLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                    <Field label="Points"><Input name="points" type="number" min={1} defaultValue={1} /></Field>
                  </div>
                  <Field label="Énoncé"><Textarea name="prompt" rows={2} required /></Field>
                  <Field label="Options (QCM)" hint="Une option par ligne ; préfixez la ou les bonnes réponses par *"><Textarea name="options" rows={4} placeholder={"Option A\n*Bonne réponse\nOption C"} /></Field>
                  <Field label="Vrai / faux : bonne réponse"><Select name="tf" defaultValue="true"><option value="true">Vrai</option><option value="false">Faux</option></Select></Field>
                  <Field label="Réponses acceptées / éléments attendus" hint="Réponse courte : une variante par ligne. Question ouverte : éléments de réponse attendus."><Textarea name="expected" rows={2} /></Field>
                  <Field label="Barème (questions ouvertes)"><Textarea name="rubric" rows={2} placeholder="Ex. 2 pts : définition exacte ; 2 pts : exemple pertinent" /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Explication affichée après correction"><Textarea name="explanation" rows={2} /></Field>
                    <Field label="Notion évaluée" hint="Sert à identifier les lacunes"><Input name="topic" /></Field>
                  </div>
                  <SubmitButton>Ajouter la question</SubmitButton>
                </ActionForm>
              </details>
            </CardBody></Card>
          )}

          {lesson.assignment && (
            <Card><CardBody>
              <h2 className="mb-4 text-lg font-bold text-navy">Devoir</h2>
              <ActionForm action={updateAssignmentAction} className="space-y-4">
                <input type="hidden" name="assignmentId" value={lesson.assignment.id} />
                <Field label="Titre"><Input name="title" defaultValue={lesson.assignment.title} /></Field>
                <Field label="Consignes"><Textarea name="instructions" rows={6} defaultValue={lesson.assignment.instructions} /></Field>
                <Field label="Barème" hint="Une ligne par critère : Critère | points | description"><Textarea name="rubric" rows={5} defaultValue={rubricText} placeholder={"Qualité de la lumière | 6 | Lumière douce, pas de reflets\nCadrage | 6 | Règle des tiers"} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Note minimale de réussite"><Input name="passingScore" type="number" min={0} defaultValue={lesson.assignment.passingScore} /></Field>
                  <Field label="Note maximale (si pas de barème)"><Input name="maxScore" type="number" min={1} defaultValue={lesson.assignment.maxScore} /></Field>
                </div>
                <div className="flex flex-wrap gap-6">
                  <Checkbox name="allowFiles" defaultChecked={lesson.assignment.allowFiles} label="Fichiers autorisés" />
                  <Checkbox name="isProject" defaultChecked={lesson.assignment.isProject} label="Projet pratique (critère de certificat)" />
                  <Checkbox name="requiresHumanValidation" defaultChecked={lesson.assignment.requiresHumanValidation} label="Note finale attribuée par le formateur" />
                </div>
                <SubmitButton>Enregistrer le devoir</SubmitButton>
              </ActionForm>
            </CardBody></Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card><CardBody className="space-y-4">
            <div className="font-semibold text-navy">Fichiers de la leçon</div>
            <ul className="space-y-2">
              {lesson.assets.length === 0 && <li className="text-sm text-muted">Aucun fichier.</li>}
              {lesson.assets.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                  <Badge tone="gray">{kindLabel[a.kind]}</Badge>
                  <span className="min-w-0 flex-1 truncate" title={a.label}>{a.label}</span>
                  <span className="text-xs text-muted">{Math.ceil(a.file.size / 1024)} Ko</span>
                  <form action={deleteAssetAction.bind(null, a.id)}><button className="text-muted hover:text-red-600" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button></form>
                </li>
              ))}
            </ul>
            {lesson.type === "VIDEO" && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted">Vidéo (MP4 / WebM)</div>
                <FileUploader params={{ purpose: "lesson-asset", targetId: lesson.id, kind: "VIDEO" }} accept="video/mp4,video/webm" label="Téléverser la vidéo" hint="Compressez en 720p (H.264) : environ 5 à 8 Mo par minute. Pour de gros volumes, préférez un hébergeur vidéo et collez son lien." />
              </div>
            )}
            {lesson.type === "VIDEO" && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted">Sous-titres (VTT / SRT)</div>
                <FileUploader params={{ purpose: "lesson-asset", targetId: lesson.id, kind: "SUBTITLE" }} accept=".vtt,.srt" label="Ajouter des sous-titres" extraFields={[{ name: "label", label: "Libellé", placeholder: "Libellé (ex. Français)" }, { name: "lang", label: "Langue", placeholder: "Code langue (fr, en, mos…)" }]} />
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted">Supports téléchargeables</div>
              <FileUploader params={{ purpose: "lesson-asset", targetId: lesson.id, kind: "DOCUMENT" }} accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.zip,image/*" label="Ajouter un support" extraFields={[{ name: "label", label: "Titre", placeholder: "Titre affiché (facultatif)" }]} hint="Les PDF, DOCX, PPTX et TXT sont aussi indexés pour le tuteur IA." />
            </div>
          </CardBody></Card>
          <Card className="border-red-200"><CardBody>
            <form action={deleteLessonAction.bind(null, lesson.id)}><SubmitButton variant="danger" size="sm" confirm="Supprimer définitivement cette leçon ?"><Trash2 className="h-4 w-4" /> Supprimer la leçon</SubmitButton></form>
          </CardBody></Card>
        </aside>
      </div>
    </>
  );
}
