import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, BellRing, BookOpen, CheckCircle2, ClipboardCheck, CreditCard, FileText, LogIn, MessageSquare, NotebookPen, Radio, UserPlus, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, formatXof } from "@/lib/format";
import { checkEligibility } from "@/lib/certificates/eligibility";
import { learnerRecord } from "@/lib/certificates/issue";
import {
  addLearnerNoteAction, checkCertificateAction, deleteLearnerNoteAction, enrollLearnerAction, learnerCertificateDecisionAction, learnerPasswordLinkAction,
  messageLearnerAction, setEnrollmentStatusAction, setLearnerStatusAction, toggleFollowUpDoneAction,
} from "@/app/actions/learners";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, Field, Input, PageHeader, ProgressBar, Select, Textarea, buttonClass } from "@/components/ui";

export const metadata = { title: "Fiche apprenant" };

const sourceLabels: Record<string, string> = { PURCHASE: "Achat", SUBSCRIPTION: "Abonnement", FREE: "Gratuite", PACK: "Pack", ADMIN: "Offerte par l'administration" };
const submissionLabels: Record<string, string> = { SUBMITTED: "Rendu", AI_REVIEWED: "Pré-corrigé (IA)", GRADED: "Corrigé", RETURNED: "À reprendre" };
const actionLabels: Record<string, string> = {
  "user.create": "Compte créé", "user.update": "Rôle ou statut modifié", "learner.suspend": "Compte suspendu", "learner.reactivate": "Compte réactivé",
  "learner.message": "Message envoyé", "learner.password_link": "Lien de mot de passe créé", "admin.recovery": "Récupération administrateur",
};
const levelLabels: Record<string, string> = { BEGINNER: "Débutant", INTERMEDIATE: "Intermédiaire", ADVANCED: "Avancé" };

type Event = { at: Date; icon: React.ReactNode; text: React.ReactNode };

export default async function LearnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePermission("users.view");
  const manage = can(admin.role, "users.manage");
  const certManage = can(admin.role, "certificates.manage");
  const u = await prisma.user.findFirst({
    where: { id, role: "LEARNER", status: { not: "DELETED" } },
    include: {
      enrollments: {
        orderBy: { createdAt: "desc" },
        include: {
          course: {
            select: {
              id: true, title: true, slug: true, hasCertificate: true, certMinProgress: true, certMinExamScore: true, certRequireProjects: true, certMinAttendance: true, certRequireHumanApproval: true,
              modules: { select: { lessons: { select: { id: true, title: true } } } },
              quizzes: { select: { id: true, title: true, isFinalExam: true, passingScore: true } },
              assignments: { select: { id: true, title: true, isProject: true } },
            },
          },
        },
      },
      certificates: true,
      orders: { where: { status: { in: ["PAID", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 20 },
      learnerNotes: { orderBy: { createdAt: "desc" }, take: 50, include: { author: { select: { name: true } } } },
      _count: { select: { tutorConversations: true } },
    },
  });
  if (!u) notFound();
  const courseIds = u.enrollments.map((e) => e.courseId);
  const [progress, attempts, submissions, lives, lastTutor, teamActions, allCourses] = await Promise.all([
    prisma.lessonProgress.findMany({ where: { userId: u.id, completed: true, lesson: { module: { courseId: { in: courseIds } } } }, select: { lessonId: true, completedAt: true, lesson: { select: { title: true, module: { select: { courseId: true } } } } }, orderBy: { completedAt: "desc" } }),
    prisma.quizAttempt.findMany({ where: { userId: u.id }, select: { quizId: true, percent: true, passed: true, status: true, createdAt: true, quiz: { select: { title: true, courseId: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.submission.findMany({ where: { userId: u.id }, select: { assignmentId: true, status: true, finalScore: true, passed: true, createdAt: true, gradedAt: true, assignment: { select: { title: true, courseId: true, maxScore: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.liveRegistration.findMany({ where: { userId: u.id }, select: { attended: true, joinedAt: true, session: { select: { title: true, courseId: true, startsAt: true } } } }),
    prisma.tutorConversation.findFirst({ where: { userId: u.id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.auditLog.findMany({ where: { entityId: u.id, entity: "User" }, orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { name: true } } } }),
    manage ? prisma.course.findMany({ where: { status: "PUBLISHED" }, select: { id: true, title: true }, orderBy: { title: "asc" } }) : Promise.resolve([]),
  ]);
  const records = await Promise.all(u.enrollments.map((e) => learnerRecord(u.id, e.courseId)));

  // Journal d'activité (sans le contenu des conversations avec le tuteur, qui reste privé).
  const courseTitle = new Map(u.enrollments.map((e) => [e.courseId, e.course.title]));
  const events: Event[] = [{ at: u.createdAt, icon: <UserPlus className="h-4 w-4" />, text: "Création du compte" }];
  if (u.lastLoginAt) events.push({ at: u.lastLoginAt, icon: <LogIn className="h-4 w-4" />, text: "Dernière connexion" });
  for (const e of u.enrollments) events.push({ at: e.createdAt, icon: <BookOpen className="h-4 w-4" />, text: <>Inscription à <b>{e.course.title}</b> ({sourceLabels[e.source]})</> });
  for (const e of u.enrollments) if (e.completedAt) events.push({ at: e.completedAt, icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, text: <>Formation terminée : <b>{e.course.title}</b></> });
  for (const p of progress.slice(0, 40)) if (p.completedAt) events.push({ at: p.completedAt, icon: <CheckCircle2 className="h-4 w-4" />, text: <>Leçon terminée : {p.lesson.title} <span className="text-muted">· {courseTitle.get(p.lesson.module.courseId)}</span></> });
  for (const a of attempts.slice(0, 30)) events.push({ at: a.createdAt, icon: a.passed ? <ClipboardCheck className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />, text: <>Quiz « {a.quiz.title} » : <b>{a.percent} %</b> {a.status === "PENDING_REVIEW" ? "(en attente de correction)" : a.passed ? "réussi" : "non réussi"}</> });
  for (const s of submissions.slice(0, 30)) {
    events.push({ at: s.createdAt, icon: <FileText className="h-4 w-4" />, text: <>Devoir rendu : {s.assignment.title}</> });
    if (s.gradedAt) events.push({ at: s.gradedAt, icon: <FileText className="h-4 w-4 text-emerald-600" />, text: <>Devoir corrigé : {s.assignment.title}{s.finalScore !== null ? <> — <b>{s.finalScore}/{s.assignment.maxScore}</b></> : null}</> });
  }
  for (const l of lives) if (l.attended) events.push({ at: l.joinedAt ?? l.session.startsAt, icon: <Radio className="h-4 w-4" />, text: <>Présent à la classe virtuelle « {l.session.title} »</> });
  for (const c of u.certificates) events.push({ at: c.issuedAt, icon: <Award className="h-4 w-4 text-accent" />, text: <>Certificat {c.status === "VALID" ? "obtenu" : c.status === "PENDING_APPROVAL" ? "demandé (en attente de validation)" : "révoqué"} : <b>{c.courseTitle}</b></> });
  for (const o of u.orders) events.push({ at: o.paidAt ?? o.createdAt, icon: <CreditCard className="h-4 w-4" />, text: <>Paiement : {o.itemLabel} — {formatXof(o.totalXof)}{o.mode === "DEMO" ? " (démo)" : ""}{o.status === "REFUNDED" ? " · remboursé" : ""}</> });
  for (const e of u.enrollments) if (e.lastNudgeAt) events.push({ at: e.lastNudgeAt, icon: <BellRing className="h-4 w-4" />, text: <>Relance automatique envoyée pour <b>{e.course.title}</b> ({e.nudgeCount} depuis sa dernière reprise)</> });
  for (const n of u.learnerNotes) events.push({ at: n.createdAt, icon: <NotebookPen className="h-4 w-4" />, text: <>Note de l'équipe ({n.author?.name ?? "—"}) : <span className="text-muted">{n.body.length > 90 ? `${n.body.slice(0, 90)}…` : n.body}</span></> });
  if (lastTutor) events.push({ at: lastTutor.updatedAt, icon: <MessageSquare className="h-4 w-4" />, text: <>Dernier échange avec le tuteur IA ({u._count.tutorConversations} conversation(s) au total, contenu privé)</> });
  events.sort((a, b) => b.at.getTime() - a.at.getTime());

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const avg = u.enrollments.length ? Math.round(u.enrollments.reduce((n, e) => n + e.progressPercent, 0) / u.enrollments.length) : 0;

  return (
    <>
      <PageHeader
        title={u.name}
        subtitle={<>
          {u.email}{u.phone ? ` · ${u.phone}` : ""}{u.city ? ` · ${u.city}` : ""}{u.country ? ` (${u.country})` : ""} · niveau déclaré : {levelLabels[u.level]}<br />
          Inscrit le {formatDate(u.createdAt)} · dernière connexion : {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "jamais"}
        </>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={u.status === "ACTIVE" ? "green" : "red"}>{u.status === "ACTIVE" ? "Actif" : "Suspendu"}</Badge>
            {u.isDemo && <Badge tone="gray">démo</Badge>}
            <Link href="/admin/apprenants" className={buttonClass("outline")}>← Apprenants</Link>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Formations", u.enrollments.filter((e) => e.status === "ACTIVE").length],
          ["Progression moyenne", `${avg} %`],
          ["Leçons terminées", progress.length],
          ["Certificats", u.certificates.filter((c) => c.status === "VALID").length],
        ].map(([l, v]) => (
          <Card key={l}><CardBody><div className="text-xs font-medium uppercase tracking-wide text-muted">{l}</div><div className="mt-1 text-2xl font-bold text-navy">{v}</div></CardBody></Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <h2 className="text-lg font-semibold text-navy">Suivi par formation</h2>
          {u.enrollments.length === 0 && <Card><CardBody className="text-sm text-muted">Aucune formation pour l'instant.{manage ? " Utilisez « Inscrire à une formation » à droite." : ""}</CardBody></Card>}
          {u.enrollments.map((e, i) => {
            const lessons = e.course.modules.flatMap((m) => m.lessons);
            const done = new Set(progress.filter((p) => p.lesson.module.courseId === e.courseId).map((p) => p.lessonId));
            const lastLesson = lessons.find((l) => l.id === e.lastLessonId);
            const cert = u.certificates.find((c) => c.courseId === e.courseId);
            const eligibility = checkEligibility(e.course, records[i]);
            const courseLives = lives.filter((l) => l.session.courseId === e.courseId);
            return (
              <Card key={e.id}><CardBody className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-navy">{e.course.title}</div>
                    <div className="text-xs text-muted">
                      {sourceLabels[e.source]} · inscrit le {formatDate(e.createdAt)} · dernier accès : {e.lastAccessedAt ? formatDateTime(e.lastAccessedAt) : "jamais"}
                      {e.completedAt && ` · terminée le ${formatDate(e.completedAt)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={e.status === "ACTIVE" ? "green" : "gray"}>{e.status === "ACTIVE" ? "Accès actif" : "Accès retiré"}</Badge>
                    {manage && (
                      <form action={setEnrollmentStatusAction.bind(null, e.id, e.status === "ACTIVE" ? "REVOKED" : "ACTIVE")}>
                        <SubmitButton size="sm" variant="ghost" confirm={e.status === "ACTIVE" ? "Retirer l'accès à cette formation ?" : undefined}>{e.status === "ACTIVE" ? "Retirer l'accès" : "Rétablir l'accès"}</SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm"><span>Progression</span><b>{e.progressPercent} %</b></div>
                  <ProgressBar value={e.progressPercent} className="mt-1" />
                  <div className="mt-1 text-xs text-muted">{done.size} / {lessons.length} leçon(s) terminée(s){lastLesson ? ` · dernière leçon ouverte : « ${lastLesson.title} »` : ""}</div>
                  {e.lastNudgeAt && <div className="mt-1 flex items-center gap-1 text-xs text-muted"><BellRing className="h-3.5 w-3.5" aria-hidden /> Dernière relance automatique le {formatDate(e.lastNudgeAt)} ({e.nudgeCount} depuis sa dernière reprise)</div>}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-sm font-medium text-navy">Quiz et examens</div>
                    {e.course.quizzes.length === 0 ? <p className="text-xs text-muted">Aucun quiz.</p> : (
                      <ul className="mt-1 space-y-1 text-sm">
                        {e.course.quizzes.map((q) => {
                          const qa = attempts.filter((a) => a.quizId === q.id);
                          const best = qa.length ? Math.max(...qa.map((a) => a.percent)) : null;
                          return (
                            <li key={q.id} className="flex justify-between gap-2">
                              <span>{q.title}{q.isFinalExam && <Badge tone="navy" className="ml-1">examen</Badge>}</span>
                              <span className="shrink-0 text-muted">{best === null ? "pas tenté" : <><b className={best >= q.passingScore ? "text-emerald-700" : "text-red-700"}>{best} %</b> · {qa.length} essai(s)</>}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-navy">Devoirs et projets</div>
                    {e.course.assignments.length === 0 ? <p className="text-xs text-muted">Aucun devoir.</p> : (
                      <ul className="mt-1 space-y-1 text-sm">
                        {e.course.assignments.map((a) => {
                          const s = submissions.find((x) => x.assignmentId === a.id);
                          return (
                            <li key={a.id} className="flex justify-between gap-2">
                              <span>{a.title}{a.isProject && <Badge tone="navy" className="ml-1">projet</Badge>}</span>
                              <span className="shrink-0 text-muted">{s ? <>{submissionLabels[s.status]}{s.finalScore !== null ? ` · ${s.finalScore}/${s.assignment.maxScore}` : ""}</> : "non rendu"}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {courseLives.length > 0 && <p className="mt-2 text-xs text-muted">Classes virtuelles : présent à {courseLives.filter((l) => l.attended).length} sur {courseLives.length} inscription(s).</p>}
                  </div>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-navy"><Award className="h-4 w-4 text-accent" aria-hidden /> Certificat</div>
                    {cert ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={cert.status === "VALID" ? "green" : cert.status === "PENDING_APPROVAL" ? "amber" : "red"}>
                          {cert.status === "VALID" ? `Délivré le ${formatDate(cert.issuedAt)}` : cert.status === "PENDING_APPROVAL" ? "En attente de validation" : "Révoqué"}
                        </Badge>
                        <span className="font-mono text-xs text-muted">{cert.code}</span>
                        {certManage && cert.status === "PENDING_APPROVAL" && <form action={learnerCertificateDecisionAction.bind(null, cert.id, "approve")}><SubmitButton size="sm">Valider</SubmitButton></form>}
                        {certManage && cert.status !== "REVOKED" && <form action={learnerCertificateDecisionAction.bind(null, cert.id, "revoke")}><SubmitButton size="sm" variant="ghost" confirm="Révoquer ce certificat ?">Révoquer</SubmitButton></form>}
                      </div>
                    ) : !e.course.hasCertificate ? <span className="text-xs text-muted">Pas de certificat pour cette formation</span> : (
                      <Badge tone={eligibility.eligible ? "green" : "gray"}>{eligibility.eligible ? "Critères remplis" : "Critères non remplis"}</Badge>
                    )}
                  </div>
                  {!cert && e.course.hasCertificate && (
                    <>
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {eligibility.checks.map((c) => <li key={c.label} className={c.ok ? "text-emerald-700" : "text-muted"}>{c.ok ? "✓" : "○"} {c.label} : {c.detail}</li>)}
                        {e.course.certRequireHumanApproval && <li className="text-muted">• Validation par l'équipe pédagogique requise</li>}
                      </ul>
                      {certManage && eligibility.eligible && (
                        <ActionForm action={checkCertificateAction} className="mt-2">
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="courseId" value={e.courseId} />
                          <SubmitButton size="sm">Délivrer le certificat</SubmitButton>
                        </ActionForm>
                      )}
                    </>
                  )}
                </div>
              </CardBody></Card>
            );
          })}

          <Card><CardBody>
            <h2 className="font-semibold text-navy">Journal d'activité</h2>
            <p className="text-xs text-muted">Les conversations avec le tuteur IA restent privées : seul leur nombre est affiché.</p>
            <ol className="mt-3 space-y-2">
              {events.slice(0, 60).map((ev, k) => (
                <li key={k} className="flex gap-3 text-sm">
                  <span className="mt-0.5 text-sky">{ev.icon}</span>
                  <span className="min-w-0 flex-1">{ev.text}</span>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(ev.at)}</span>
                </li>
              ))}
            </ol>
          </CardBody></Card>
        </div>

        <div className="space-y-4">
          <Card><CardBody>
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-navy"><NotebookPen className="h-4 w-4 text-sky" aria-hidden /> Notes internes</h2>
            <p className="mb-3 text-xs text-muted">Visibles uniquement par l'équipe, jamais par l'apprenant.</p>
            <ActionForm action={addLearnerNoteAction} className="space-y-2" resetOnSuccess>
              <input type="hidden" name="userId" value={u.id} />
              <Textarea name="body" rows={3} required maxLength={3000} placeholder="Ex. : Appelé le 12/10, reprend la formation la semaine prochaine." />
              <Field label="Me rappeler le (facultatif)"><Input name="followUpAt" type="date" /></Field>
              <SubmitButton size="sm">Ajouter la note</SubmitButton>
            </ActionForm>
            {u.learnerNotes.length > 0 && (
              <ul className="mt-4 space-y-3">
                {u.learnerNotes.map((n) => {
                  const due = n.followUpAt && !n.doneAt && n.followUpAt.getTime() <= today.getTime();
                  return (
                    <li key={n.id} className="rounded-xl border border-line p-3 text-sm">
                      <p className="whitespace-pre-line text-ink">{n.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>{n.author?.name ?? "—"} · {formatDateTime(n.createdAt)}</span>
                        {n.followUpAt && (
                          <Badge tone={n.doneAt ? "green" : due ? "amber" : "sky"}>
                            {n.doneAt ? "Rappel fait" : `Rappel le ${formatDate(n.followUpAt, { dateStyle: "medium" })}${due ? " — à faire" : ""}`}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex gap-1">
                        {n.followUpAt && (
                          <form action={toggleFollowUpDoneAction.bind(null, n.id)}><SubmitButton size="sm" variant="ghost">{n.doneAt ? "Rouvrir le rappel" : "Marquer comme fait"}</SubmitButton></form>
                        )}
                        {(n.authorId === admin.id || admin.role === "ADMIN" || admin.role === "SUPERADMIN") && (
                          <form action={deleteLearnerNoteAction.bind(null, n.id)}><SubmitButton size="sm" variant="ghost" confirm="Supprimer cette note ?">Supprimer</SubmitButton></form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody></Card>

          {manage && (
            <>
              <Card><CardBody>
                <h2 className="mb-2 font-semibold text-navy">Inscrire à une formation</h2>
                <ActionForm action={enrollLearnerAction} className="space-y-3">
                  <input type="hidden" name="userId" value={u.id} />
                  <Select name="courseId" required defaultValue="">
                    <option value="" disabled>Choisir une formation…</option>
                    {allCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </Select>
                  <SubmitButton size="sm">Inscrire (accès offert)</SubmitButton>
                </ActionForm>
              </CardBody></Card>

              <Card><CardBody>
                <h2 className="mb-2 font-semibold text-navy">Envoyer un message</h2>
                <ActionForm action={messageLearnerAction} className="space-y-3" resetOnSuccess>
                  <input type="hidden" name="userId" value={u.id} />
                  <Field label="Objet"><Input name="title" required maxLength={120} placeholder="Ex. : Continuez votre formation !" /></Field>
                  <Field label="Message"><Textarea name="body" required rows={4} maxLength={2000} /></Field>
                  <SubmitButton size="sm">Envoyer</SubmitButton>
                </ActionForm>
              </CardBody></Card>

              <Card><CardBody>
                <h2 className="mb-2 font-semibold text-navy">{u.status === "ACTIVE" ? "Suspendre le compte" : "Réactiver le compte"}</h2>
                <ActionForm action={setLearnerStatusAction} className="space-y-3">
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                  {u.status === "ACTIVE" && <Field label="Motif (interne, facultatif)"><Input name="reason" maxLength={500} placeholder="Ex. : paiement contesté, comportement…" /></Field>}
                  <p className="text-xs text-muted">{u.status === "ACTIVE" ? "L'apprenant est déconnecté immédiatement et ne peut plus se connecter. Ses données et sa progression sont conservées." : "L'apprenant retrouve l'accès à son compte et à ses formations."}</p>
                  <SubmitButton size="sm" variant={u.status === "ACTIVE" ? "danger" : "primary"} confirm={u.status === "ACTIVE" ? `Suspendre ${u.name} ?` : undefined}>{u.status === "ACTIVE" ? "Suspendre" : "Réactiver"}</SubmitButton>
                </ActionForm>
              </CardBody></Card>

              <Card><CardBody>
                <h2 className="mb-2 font-semibold text-navy">Mot de passe oublié ?</h2>
                <p className="mb-2 text-xs text-muted">Créez un lien à lui transmettre (WhatsApp…) pour qu'il choisisse un nouveau mot de passe. Vous ne voyez jamais son mot de passe.</p>
                <ActionForm action={learnerPasswordLinkAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <SubmitButton size="sm" variant="outline">Créer un lien</SubmitButton>
                </ActionForm>
              </CardBody></Card>
            </>
          )}

          <Card><CardBody>
            <h2 className="mb-2 font-semibold text-navy">Actions de l'équipe</h2>
            {teamActions.length === 0 ? <p className="text-sm text-muted">Aucune action enregistrée.</p> : (
              <ul className="space-y-1.5 text-xs">
                {teamActions.map((a) => {
                  const meta = (a.meta ?? {}) as { reason?: string };
                  return <li key={a.id}><b>{actionLabels[a.action] ?? a.action}</b> par {a.actor?.name ?? "système"} · {formatDateTime(a.createdAt)}{meta.reason ? ` — « ${meta.reason} »` : ""}</li>;
                })}
              </ul>
            )}
            <Link href={`/admin/utilisateurs/${u.id}`} className="mt-3 inline-block text-xs text-sky hover:underline">Compte, rôle et commandes →</Link>
          </CardBody></Card>
        </div>
      </div>
    </>
  );
}
