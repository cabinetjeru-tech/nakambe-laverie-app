import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, FileText, FolderDown, Lock, PenSquare, PlayCircle, Radio, Sparkles, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { courseAccess, lessonAccess } from "@/lib/access";
import { renderMarkdown } from "@/lib/markdown";
import { signedFileUrl } from "@/lib/storage";
import { getBrand } from "@/lib/settings";
import { formatDateTime, formatDuration } from "@/lib/format";
import { env } from "@/lib/env";
import { ContentViewer, type ContentItem } from "@/components/learn/content-viewer";
import { deleteNoteAction, saveNoteAction } from "@/app/actions/learning";
import { VideoPlayer } from "@/components/learn/video-player";
import { CompleteButton } from "@/components/learn/complete-button";
import { DocumentList, type DocItem } from "@/components/learn/documents";
import { QuizRunner, type RunnerQuestion } from "@/components/learn/quiz-runner";
import { AssignmentForm } from "@/components/learn/assignment-form";
import { TutorContext } from "@/components/tutor/tutor-context";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, Badge, Card, CardBody, Markdown, ProgressBar, Textarea, buttonClass } from "@/components/ui";

const icons = { VIDEO: PlayCircle, TEXT: FileText, DOCUMENT: FileText, QUIZ: ClipboardCheck, ASSIGNMENT: PenSquare, LIVE: Radio };

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const user = await requireUser();
  const course = await prisma.course.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, status: true,
      modules: { orderBy: { position: "asc" }, select: { id: true, title: true, lessons: { orderBy: { position: "asc" }, select: { id: true, title: true, type: true, isPreview: true, durationMinutes: true } } } },
    },
  });
  if (!course) notFound();
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, module: { courseId: course.id } },
    include: {
      assets: { include: { file: true }, orderBy: { createdAt: "asc" } },
      quiz: { include: { questions: { orderBy: { position: "asc" } } } },
      assignment: true,
    },
  });
  if (!lesson) notFound();

  const [full, acc, brand] = await Promise.all([courseAccess(user, course.id), lessonAccess(user, lesson.id), getBrand()]);
  const allLessons = course.modules.flatMap((m) => m.lessons);
  const idx = allLessons.findIndex((l) => l.id === lesson.id);
  const prev = allLessons[idx - 1];
  const next = allLessons[idx + 1];

  const [progressRows, enrollment, notes] = await Promise.all([
    prisma.lessonProgress.findMany({ where: { userId: user.id, lesson: { module: { courseId: course.id } } } }),
    prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: course.id } } }),
    prisma.note.findMany({ where: { userId: user.id, lessonId: lesson.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const progressMap = new Map(progressRows.map((p) => [p.lessonId, p]));
  const current = progressMap.get(lesson.id);

  // Enregistre la dernière leçon consultée (reprise automatique).
  if (acc.allowed && enrollment) {
    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { lastLessonId: lesson.id, lastAccessedAt: new Date() } });
  }

  const video = lesson.assets.find((a) => a.kind === "VIDEO");
  const subtitles = lesson.assets.filter((a) => a.kind === "SUBTITLE");
  // Supports de cours : consultés en ligne dans la leçon (jamais téléchargeables).
  const appOrigin = env.appUrl.replace(/\/$/, "");
  const officeEnabled = /^https:\/\//.test(appOrigin) && !/localhost|127\.0\.0\.1/.test(appOrigin);
  const supports: ContentItem[] = lesson.assets
    .filter((a) => a.kind === "DOCUMENT" && !a.downloadable)
    .map((a) => {
      const url = signedFileUrl(a.fileId, { ttlSeconds: 4 * 3600 });
      return { id: a.id, label: a.label, mime: a.file.mimeType, url, absoluteUrl: appOrigin + url };
    });
  const watermark = `${user.name} · ${user.email}`;
  // Ressources téléchargeables de la leçon (réservées aux inscrits).
  const docs: DocItem[] = lesson.assets
    .filter((a) => a.kind === "DOCUMENT" && a.downloadable)
    .map((a) => ({
      id: a.fileId,
      label: a.label,
      size: a.file.size,
      mime: a.file.mimeType,
      url: signedFileUrl(a.fileId, { ttlSeconds: 4 * 3600 }),
      downloadUrl: signedFileUrl(a.fileId, { ttlSeconds: 4 * 3600, download: true }),
      downloadable: a.downloadable,
    }));

  const attemptsUsed = lesson.quiz ? await prisma.quizAttempt.count({ where: { quizId: lesson.quiz.id, userId: user.id } }) : 0;
  const lastAttempt = lesson.quiz ? await prisma.quizAttempt.findFirst({ where: { quizId: lesson.quiz.id, userId: user.id }, orderBy: { createdAt: "desc" } }) : null;
  const submissions = lesson.assignment
    ? await prisma.submission.findMany({ where: { assignmentId: lesson.assignment.id, userId: user.id }, orderBy: { createdAt: "desc" }, take: 3 })
    : [];
  const lives = lesson.type === "LIVE" ? await prisma.liveSession.findMany({ where: { courseId: course.id, status: { not: "CANCELED" } }, orderBy: { startsAt: "desc" }, take: 5 }) : [];
  const Icon = icons[lesson.type];
  const courseResources = full !== "none" ? await prisma.lessonAsset.count({ where: { kind: "DOCUMENT", downloadable: true, lesson: { module: { courseId: course.id } } } }) : 0;
  const moduleIndex = course.modules.findIndex((m) => m.lessons.some((l) => l.id === lesson.id));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <TutorContext courseId={course.id} lessonId={lesson.id} />
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted">
              <Link href={`/formations/${course.slug}`} className="text-sky hover:underline">{course.title}</Link>
              {moduleIndex >= 0 && <> · {course.modules[moduleIndex]!.title}</>}
            </div>
            <h1 className="mt-1 flex items-start gap-2 text-2xl font-bold text-navy"><Icon className="mt-1 h-6 w-6 shrink-0 text-sky" aria-hidden />{lesson.title}</h1>
            {acc.allowed && acc.reason === "preview" && <Badge tone="green" className="mt-2">Aperçu gratuit</Badge>}
          </div>
          {full !== "none" && (
            <Link href={`/espace/apprendre/${course.slug}/ressources`} className={buttonClass("outline", "md", "shrink-0")}>
              <FolderDown className="h-4 w-4" aria-hidden /> Ressources{courseResources ? ` (${courseResources})` : ""}
            </Link>
          )}
        </div>

        {!acc.allowed ? (
          <Card>
            <CardBody className="py-10 text-center">
              <Lock className="mx-auto h-10 w-10 text-muted" aria-hidden />
              <h2 className="mt-3 text-lg font-semibold text-navy">Leçon réservée aux inscrits</h2>
              <p className="mt-1 text-sm text-muted">Accédez à toutes les leçons, au tuteur IA sur ce cours et au certificat en rejoignant la formation.</p>
              <Link href={`/formations/${course.slug}`} className={buttonClass("accent", "lg", "mt-5")}>Voir les options d'accès</Link>
            </CardBody>
          </Card>
        ) : (
          <>
            {(video || lesson.videoUrl) && (
              <VideoPlayer
                lessonId={lesson.id}
                src={video ? signedFileUrl(video.fileId, { ttlSeconds: 6 * 3600 }) : lesson.videoUrl!}
                tracks={subtitles.map((s) => ({ src: signedFileUrl(s.fileId, { ttlSeconds: 6 * 3600 }) + "&format=vtt", lang: s.lang || "fr", label: s.label }))}
                initialPosition={current?.videoPosition ?? 0}
                lowData={user.lowDataMode}
                downloadUrl={video?.downloadable ? signedFileUrl(video.fileId, { ttlSeconds: 6 * 3600, download: true }) : null}
              />
            )}
            {lesson.type === "VIDEO" && !video && !lesson.videoUrl && (
              <Alert tone="info">La vidéo de cette leçon n'est pas encore en ligne. Le contenu écrit ci-dessous est disponible.</Alert>
            )}

            {lesson.content && (
              <Card><CardBody><Markdown html={renderMarkdown(lesson.content)} /></CardBody></Card>
            )}

            {supports.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-semibold text-navy">Supports de cours</h2>
                {supports.map((s) => <ContentViewer key={s.id} item={s} watermark={watermark} officeEnabled={officeEnabled} />)}
              </section>
            )}

            {docs.length > 0 && full !== "none" && (
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-navy">Ressources de cette leçon</h2>
                  <Link href={`/espace/apprendre/${course.slug}/ressources`} className="text-xs font-medium text-sky hover:underline">Toutes les ressources de la formation →</Link>
                </div>
                <DocumentList docs={docs} />
              </section>
            )}

            {lesson.quiz && (
              <section>
                <h2 className="mb-1 text-lg font-bold text-navy">{lesson.quiz.title}</h2>
                <p className="mb-3 text-sm text-muted">
                  {lesson.quiz.questions.length} question(s) · réussite à {lesson.quiz.passingScore} %{lesson.quiz.isFinalExam ? " · examen final" : ""}
                  {lastAttempt ? ` · dernier résultat : ${lastAttempt.percent} %${lastAttempt.status === "PENDING_REVIEW" ? " (en attente de validation)" : ""}` : ""}
                </p>
                {lesson.quiz.maxAttempts > 0 && attemptsUsed >= lesson.quiz.maxAttempts ? (
                  <Alert tone="warning">Vous avez utilisé toutes vos tentatives pour cette évaluation.</Alert>
                ) : lesson.quiz.questions.length === 0 ? (
                  <Alert tone="info">Ce quiz ne contient pas encore de questions.</Alert>
                ) : (
                  <QuizRunner
                    quizId={lesson.quiz.id}
                    passingScore={lesson.quiz.passingScore}
                    attemptsLeft={lesson.quiz.maxAttempts > 0 ? lesson.quiz.maxAttempts - attemptsUsed : null}
                    questions={lesson.quiz.questions.map<RunnerQuestion>((q) => ({ id: q.id, type: q.type, prompt: q.prompt, points: q.points, options: (q.options as { id: string; text: string }[]) ?? [] }))}
                  />
                )}
              </section>
            )}

            {lesson.assignment && (
              <section className="space-y-4">
                <Card>
                  <CardBody>
                    <h2 className="text-lg font-bold text-navy">{lesson.assignment.title}</h2>
                    {lesson.assignment.isProject && <Badge tone="accent" className="mt-1">Projet pratique — compte pour le certificat</Badge>}
                    <p className="mt-3 whitespace-pre-line text-sm">{lesson.assignment.instructions}</p>
                    {(lesson.assignment.rubric as { criterion: string; points: number; description?: string }[]).length > 0 && (
                      <div className="mt-4">
                        <div className="text-sm font-semibold text-navy">Barème (sur {lesson.assignment.maxScore})</div>
                        <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                          {(lesson.assignment.rubric as { criterion: string; points: number; description?: string }[]).map((r) => <li key={r.criterion}>{r.criterion} — {r.points} pts{r.description ? ` : ${r.description}` : ""}</li>)}
                        </ul>
                      </div>
                    )}
                  </CardBody>
                </Card>
                {submissions.map((s) => {
                  const ai = s.aiFeedback as { summary?: string; strengths?: string[]; improvements?: string[]; remediation?: string[]; criteria?: { criterion: string; points: number; max: number; comment: string }[] } | null;
                  return (
                    <Card key={s.id}>
                      <CardBody className="space-y-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-navy">Rendu du {formatDateTime(s.createdAt)}</span>
                          {s.status === "GRADED" ? <Badge tone={s.passed ? "green" : "red"}>Note : {s.finalScore} / {lesson.assignment!.maxScore}</Badge> : s.status === "AI_REVIEWED" ? <Badge tone="amber">Pré-correction IA : {s.aiScore} / {lesson.assignment!.maxScore} — en attente du formateur</Badge> : <Badge tone="gray">En attente de correction</Badge>}
                        </div>
                        {s.trainerFeedback && <div className="rounded-lg bg-sky-50 p-3"><b>Commentaire du formateur :</b> {s.trainerFeedback}</div>}
                        {ai?.summary && (
                          <div className="rounded-lg border border-line p-3">
                            <div className="flex items-center gap-1 font-semibold text-navy"><Sparkles className="h-4 w-4 text-accent" aria-hidden /> Retour de {brand.tutorName}</div>
                            <p className="mt-1">{ai.summary}</p>
                            {ai.criteria && <ul className="mt-2 space-y-0.5">{ai.criteria.map((c) => <li key={c.criterion}>• <b>{c.criterion}</b> : {c.points}/{c.max} — {c.comment}</li>)}</ul>}
                            {ai.improvements && ai.improvements.length > 0 && <div className="mt-2"><b>À améliorer :</b><ul className="list-disc pl-5">{ai.improvements.map((i) => <li key={i}>{i}</li>)}</ul></div>}
                            {ai.remediation && ai.remediation.length > 0 && <div className="mt-2"><b>Exercices de remédiation :</b><ul className="list-disc pl-5">{ai.remediation.map((i) => <li key={i}>{i}</li>)}</ul></div>}
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
                <Card><CardBody><h3 className="mb-3 font-semibold text-navy">{submissions.length ? "Rendre une nouvelle version" : "Rendre mon travail"}</h3><AssignmentForm assignmentId={lesson.assignment.id} allowFiles={lesson.assignment.allowFiles} /></CardBody></Card>
              </section>
            )}

            {lesson.type === "LIVE" && (
              <Card>
                <CardBody>
                  <h2 className="font-semibold text-navy">Classes virtuelles de la formation</h2>
                  {lives.length === 0 ? <p className="mt-1 text-sm text-muted">Aucune séance programmée pour le moment.</p> : (
                    <ul className="mt-2 space-y-2 text-sm">{lives.map((l) => <li key={l.id}><Link href={`/espace/classe/${l.id}`} className="font-medium text-sky hover:underline">{l.title}</Link> — {formatDateTime(l.startsAt)}</li>)}</ul>
                  )}
                </CardBody>
              </Card>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              {prev ? <Link href={`/espace/apprendre/${course.slug}/${prev.id}`} className={buttonClass("ghost")}><ArrowLeft className="h-4 w-4" /> Précédente</Link> : <span />}
              {(full !== "none") && <CompleteButton lessonId={lesson.id} completed={!!current?.completed} />}
              {next ? <Link href={`/espace/apprendre/${course.slug}/${next.id}`} className={buttonClass("primary")}>Suivante <ArrowRight className="h-4 w-4" /></Link> : <span />}
            </div>

            <Card>
              <CardBody>
                <h2 className="font-semibold text-navy">Mes notes personnelles</h2>
                <ActionForm action={saveNoteAction} className="mt-3 space-y-2" resetOnSuccess>
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <Textarea name="content" rows={3} maxLength={5000} placeholder="Notez une idée, une question pour le formateur…" required />
                  <SubmitButton size="sm" variant="outline">Enregistrer la note</SubmitButton>
                </ActionForm>
                {notes.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {notes.map((n) => (
                      <li key={n.id} className="flex items-start gap-2 rounded-lg bg-surface p-3 text-sm">
                        <p className="flex-1 whitespace-pre-line">{n.content}</p>
                        <form action={deleteNoteAction.bind(null, n.id)}><button className="text-muted hover:text-red-600" aria-label="Supprimer la note"><Trash2 className="h-4 w-4" /></button></form>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>

      <aside className="xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardBody className="p-4">
            <div className="text-sm font-semibold text-navy">Programme</div>
            {enrollment && <div className="mt-2 flex items-center gap-2"><ProgressBar value={enrollment.progressPercent} /><span className="whitespace-nowrap text-xs font-semibold">{enrollment.progressPercent} %</span></div>}
            <nav className="mt-3 max-h-[65vh] space-y-3 overflow-y-auto pr-1" aria-label="Leçons">
              {course.modules.map((m, mi) => (
                <div key={m.id}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Section {mi + 1} · {m.title}</div>
                  <div className="text-[11px] text-muted">{m.lessons.filter((l) => progressMap.get(l.id)?.completed).length}/{m.lessons.length} · {formatDuration(m.lessons.reduce((s, l) => s + l.durationMinutes, 0))}</div>
                  <ul className="mt-1 space-y-0.5">
                    {m.lessons.map((l) => {
                      const LIcon = icons[l.type];
                      const done = progressMap.get(l.id)?.completed;
                      const locked = full === "none" && !l.isPreview;
                      return (
                        <li key={l.id}>
                          <Link
                            href={`/espace/apprendre/${course.slug}/${l.id}`}
                            aria-current={l.id === lesson.id ? "page" : undefined}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${l.id === lesson.id ? "bg-navy text-white" : "hover:bg-sky-50"}`}
                          >
                            {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Terminée" /> : locked ? <Lock className="h-4 w-4 shrink-0 opacity-60" /> : <LIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />}
                            <span className="line-clamp-2">{l.title}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
