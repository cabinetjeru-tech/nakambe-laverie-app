import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, FileText, RefreshCw, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { canManageCourse } from "@/lib/access";
import { publicFileUrl } from "@/lib/storage";
import { aiStatus } from "@/lib/ai/llm";
import { formatDateTime } from "@/lib/format";
import {
  addLessonAction, addModuleAction, archiveCourseAction, deleteDocumentAction, deleteModuleAction, moveLessonAction, moveModuleAction,
  reindexCourseAction, reindexDocumentAction, renameModuleAction, submitCourseForReviewAction, updateCertificateCriteriaAction, updateCourseAction,
  withdrawCourseAction,
} from "@/app/actions/trainer";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { FileUploader } from "@/components/forms/file-uploader";
import { CourseFields } from "@/components/course/course-form";
import { Alert, Badge, Card, CardBody, Checkbox, Field, Input, PageHeader, ProgressBar, Select, Table, Td, Th, buttonClass } from "@/components/ui";

const tabs = [
  ["infos", "Informations"],
  ["programme", "Programme"],
  ["ressources", "Base de connaissances IA"],
  ["certificat", "Certificat"],
  ["apprenants", "Apprenants"],
  ["publication", "Publication"],
] as const;

const typeLabels = { VIDEO: "Vidéo", TEXT: "Texte", DOCUMENT: "Document", QUIZ: "Quiz", ASSIGNMENT: "Devoir", LIVE: "Classe virtuelle" };
const statusLabel = { DRAFT: "Brouillon", SUBMITTED: "En validation", PUBLISHED: "Publiée", REJECTED: "À corriger", ARCHIVED: "Archivée" };

export default async function CourseEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onglet?: string }> }) {
  const { id } = await params;
  const { onglet = "infos" } = await searchParams;
  const user = await requirePermission("trainer.access");
  if (!(await canManageCourse(user, id))) notFound();
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      category: true,
      modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" }, include: { _count: { select: { assets: true } }, quiz: { select: { _count: { select: { questions: true } } } } } } } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!course) notFound();
  const categories = await prisma.category.findMany({ orderBy: { position: "asc" } });
  const lessonCount = course.modules.reduce((s, m) => s + m.lessons.length, 0);

  return (
    <>
      <PageHeader
        title={course.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={course.status === "PUBLISHED" ? "green" : course.status === "REJECTED" ? "red" : course.status === "SUBMITTED" ? "amber" : "gray"}>{statusLabel[course.status]}</Badge>{course._count.enrollments} apprenant(s) · {lessonCount} leçon(s)</span>}
        actions={<Link href={`/formations/${course.slug}`} className={buttonClass("outline")} target="_blank"><Eye className="h-4 w-4" /> Aperçu</Link>}
      />
      {course.status === "REJECTED" && course.reviewNote && <Alert tone="error" className="mb-4"><b>Retour de l'administration :</b> {course.reviewNote}</Alert>}
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`?onglet=${k}`} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${onglet === k ? "border-navy text-navy" : "border-transparent text-muted hover:text-navy"}`}>{l}</Link>
        ))}
      </nav>

      {onglet === "infos" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card><CardBody>
            <ActionForm action={updateCourseAction} className="space-y-6">
              <input type="hidden" name="courseId" value={course.id} />
              <CourseFields course={course} categories={categories} />
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          </CardBody></Card>
          <Card><CardBody className="space-y-3">
            <div className="text-sm font-semibold text-navy">Image de couverture</div>
            {(course.imageUrl || course.imageFileId) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={course.imageUrl || publicFileUrl(course.imageFileId)!} alt="" className="aspect-video w-full rounded-xl object-cover" />
            )}
            <FileUploader params={{ purpose: "cover", targetId: course.id }} accept="image/png,image/jpeg,image/webp" label="Téléverser une image" hint="Format 16:9, 1280×720 conseillé, 5 Mo max. Préférez une image compressée (WebP/JPEG) pour les connexions lentes." />
          </CardBody></Card>
        </div>
      )}

      {onglet === "programme" && (
        <div className="space-y-4">
          {course.modules.map((m, mi) => (
            <Card key={m.id}>
              <CardBody>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-sky">Module {mi + 1}</span>
                  <ActionForm action={renameModuleAction} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="moduleId" value={m.id} />
                    <Input name="title" defaultValue={m.title} className="font-semibold" aria-label="Titre du module" />
                    <SubmitButton size="sm" variant="ghost">Renommer</SubmitButton>
                  </ActionForm>
                  <form action={moveModuleAction.bind(null, m.id, -1)}><button className="p-1.5 text-muted hover:text-navy" aria-label="Monter"><ArrowUp className="h-4 w-4" /></button></form>
                  <form action={moveModuleAction.bind(null, m.id, 1)}><button className="p-1.5 text-muted hover:text-navy" aria-label="Descendre"><ArrowDown className="h-4 w-4" /></button></form>
                  <form action={deleteModuleAction.bind(null, m.id)}><SubmitButton size="sm" variant="ghost" confirm="Supprimer ce module et toutes ses leçons ?"><Trash2 className="h-4 w-4 text-red-600" /></SubmitButton></form>
                </div>
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {m.lessons.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-muted" />
                      <Link href={`/formateur/formations/${course.id}/lecons/${l.id}`} className="flex-1 font-medium text-navy hover:text-sky">{l.title}</Link>
                      <Badge tone="gray">{typeLabels[l.type]}</Badge>
                      {l.isPreview && <Badge tone="green">Aperçu</Badge>}
                      {l.type === "QUIZ" && <span className="text-xs text-muted">{l.quiz?._count.questions ?? 0} question(s)</span>}
                      {l._count.assets > 0 && <span className="text-xs text-muted">{l._count.assets} fichier(s)</span>}
                      <form action={moveLessonAction.bind(null, l.id, -1)}><button className="p-1 text-muted hover:text-navy" aria-label="Monter"><ArrowUp className="h-3.5 w-3.5" /></button></form>
                      <form action={moveLessonAction.bind(null, l.id, 1)}><button className="p-1 text-muted hover:text-navy" aria-label="Descendre"><ArrowDown className="h-3.5 w-3.5" /></button></form>
                    </li>
                  ))}
                  {m.lessons.length === 0 && <li className="px-3 py-3 text-sm text-muted">Aucune leçon dans ce module.</li>}
                </ul>
                <ActionForm action={addLessonAction} className="mt-3 flex flex-wrap items-end gap-2" resetOnSuccess>
                  <input type="hidden" name="moduleId" value={m.id} />
                  <Input name="title" placeholder="Titre de la nouvelle leçon" className="min-w-52 flex-1" required />
                  <Select name="type" defaultValue="TEXT" className="w-44" aria-label="Type de leçon">
                    {Object.entries(typeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                  <SubmitButton size="md" variant="outline">Ajouter la leçon</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ))}
          <Card><CardBody>
            <ActionForm action={addModuleAction} className="flex flex-wrap items-end gap-2" resetOnSuccess>
              <input type="hidden" name="courseId" value={course.id} />
              <Field label="Nouveau module" className="flex-1"><Input name="title" placeholder="Ex. Module 1 — Les bases" required /></Field>
              <SubmitButton>Ajouter le module</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-xs text-muted">Astuce : l'<Link href="/formateur/assistant-ia" className="text-sky underline">assistant pédagogique IA</Link> peut générer un plan de cours complet, que vous validez puis importez ici.</p>
          </CardBody></Card>
        </div>
      )}

      {onglet === "ressources" && <KnowledgeTab courseId={course.id} />}

      {onglet === "certificat" && (
        <Card><CardBody>
          <ActionForm action={updateCertificateCriteriaAction} className="space-y-4">
            <input type="hidden" name="courseId" value={course.id} />
            <Checkbox name="hasCertificate" defaultChecked={course.hasCertificate} label="Cette formation délivre un certificat" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Progression minimale (%)"><Input name="certMinProgress" type="number" min={0} max={100} defaultValue={course.certMinProgress} /></Field>
              <Field label="Note minimale à l'examen final (%)" hint="S'applique aux quiz marqués « examen final »."><Input name="certMinExamScore" type="number" min={0} max={100} defaultValue={course.certMinExamScore} /></Field>
              <Field label="Présence minimale aux classes (%)" hint="0 = non exigé"><Input name="certMinAttendance" type="number" min={0} max={100} defaultValue={course.certMinAttendance} /></Field>
            </div>
            <Checkbox name="certRequireProjects" defaultChecked={course.certRequireProjects} label="Exiger la validation des projets pratiques par le formateur" />
            <Checkbox name="certRequireHumanApproval" defaultChecked={course.certRequireHumanApproval} label="Validation finale humaine avant délivrance du certificat" />
            <p className="text-xs text-muted">L'IA ne délivre jamais de certificat : seuls ces critères et les notes validées sont pris en compte.</p>
            <SubmitButton>Enregistrer les critères</SubmitButton>
          </ActionForm>
        </CardBody></Card>
      )}

      {onglet === "apprenants" && <LearnersTab courseId={course.id} />}

      {onglet === "publication" && (
        <Card><CardBody className="space-y-4 text-sm">
          <ol className="grid gap-2 sm:grid-cols-5">
            {(["DRAFT", "SUBMITTED", "PUBLISHED", "ARCHIVED"] as const).map((s, i) => (
              <li key={s} className={`rounded-lg border px-3 py-2 ${course.status === s ? "border-navy bg-navy text-white" : "border-line"}`}>{i + 1}. {statusLabel[s]}</li>
            ))}
          </ol>
          {(course.status === "DRAFT" || course.status === "REJECTED") && (
            <>
              <p>Quand votre programme est prêt, soumettez la formation : l'équipe de l'académie la relit puis la publie.</p>
              {lessonCount === 0 ? <Alert tone="warning">Ajoutez au moins une leçon avant de soumettre.</Alert> : (
                <form action={submitCourseForReviewAction.bind(null, course.id)}><SubmitButton variant="accent">Soumettre à validation</SubmitButton></form>
              )}
            </>
          )}
          {course.status === "SUBMITTED" && (
            <>
              <p>Formation en cours de validation depuis le {formatDateTime(course.submittedAt)}.</p>
              <form action={withdrawCourseAction.bind(null, course.id)}><SubmitButton variant="outline">Retirer la soumission</SubmitButton></form>
            </>
          )}
          {course.status === "PUBLISHED" && (
            <>
              <p>Formation en ligne. Les modifications de contenu sont visibles immédiatement par les apprenants.</p>
              <form action={archiveCourseAction.bind(null, course.id)}><SubmitButton variant="outline" confirm="Archiver ? La formation ne sera plus proposée à la vente ; les inscrits gardent leur accès.">Archiver la formation</SubmitButton></form>
            </>
          )}
          {course.status === "ARCHIVED" && <p>Formation archivée. Contactez l'administration pour la republier.</p>}
        </CardBody></Card>
      )}
    </>
  );
}

async function KnowledgeTab({ courseId }: { courseId: string }) {
  const [docs, status] = await Promise.all([
    prisma.knowledgeDocument.findMany({ where: { courseId }, orderBy: { createdAt: "desc" }, include: { lesson: { select: { title: true } } } }),
    aiStatus(),
  ]);
  const tone = { PENDING: "gray", PROCESSING: "amber", READY: "green", FAILED: "red" } as const;
  const label = { PENDING: "En attente", PROCESSING: "Indexation…", READY: "Indexé", FAILED: "Échec" };
  return (
    <div className="space-y-6">
      <Alert tone="info">
        Les supports indexés ici sont consultés par le tuteur IA pour répondre aux apprenants <b>inscrits à cette formation uniquement</b>, avec citation des sources.
        Le texte des leçons est indexé automatiquement. {status.embeddings ? "Recherche sémantique (embeddings) + plein texte activée." : "Recherche plein texte active ; ajoutez une clé OpenAI dans les paramètres pour activer la recherche sémantique."}
      </Alert>
      <Card><CardBody>
        <div className="mb-3 font-semibold text-navy">Ajouter un support (PDF, DOCX, PPTX, TXT, MD)</div>
        <FileUploader params={{ purpose: "knowledge", targetId: courseId }} accept=".pdf,.docx,.pptx,.txt,.md" label="Téléverser et indexer" extraFields={[{ name: "label", label: "Titre du document", placeholder: "Titre du document (facultatif)" }]} hint="Les PDF scannés (images) ne contiennent pas de texte exploitable : utilisez un PDF texte." />
      </CardBody></Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-navy">Documents indexés ({docs.length})</h2>
        <form action={reindexCourseAction.bind(null, courseId)}><SubmitButton size="sm" variant="outline"><RefreshCw className="h-4 w-4" /> Tout ré-indexer</SubmitButton></form>
      </div>
      <Table>
        <thead><tr><Th>Document</Th><Th>Source</Th><Th>Passages</Th><Th>État</Th><Th></Th></tr></thead>
        <tbody>
          {docs.length === 0 && <tr><Td colSpan={5} className="text-center text-muted">Aucun document.</Td></tr>}
          {docs.map((d) => (
            <tr key={d.id}>
              <Td><div className="font-medium text-navy">{d.title}</div>{d.lesson && <div className="text-xs text-muted">Leçon : {d.lesson.title}</div>}{d.error && <div className="text-xs text-red-600">{d.error}</div>}</Td>
              <Td className="text-muted">{d.sourceType === "LESSON" ? "Texte de leçon" : "Fichier"}</Td>
              <Td>{d.chunkCount}{d.embedded && <Badge tone="sky" className="ml-1">sémantique</Badge>}</Td>
              <Td><Badge tone={tone[d.status]}>{label[d.status]}</Badge></Td>
              <Td className="whitespace-nowrap text-right">
                <form action={reindexDocumentAction.bind(null, d.id)} className="inline"><button className="p-1.5 text-muted hover:text-navy" aria-label="Ré-indexer"><RefreshCw className="h-4 w-4" /></button></form>
                <form action={deleteDocumentAction.bind(null, d.id)} className="inline"><button className="p-1.5 text-muted hover:text-red-600" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button></form>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

async function LearnersTab({ courseId }: { courseId: string }) {
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { id: true, name: true, email: true, quizAttempts: { where: { quiz: { courseId } }, select: { percent: true } } } } },
  });
  return (
    <Table>
      <thead><tr><Th>Apprenant</Th><Th>Accès</Th><Th>Progression</Th><Th>Moyenne quiz</Th><Th>Dernière activité</Th></tr></thead>
      <tbody>
        {enrollments.length === 0 && <tr><Td colSpan={5} className="text-center text-muted">Aucun apprenant inscrit.</Td></tr>}
        {enrollments.map((e) => {
          const avg = e.user.quizAttempts.length ? Math.round(e.user.quizAttempts.reduce((s, a) => s + a.percent, 0) / e.user.quizAttempts.length) : null;
          return (
            <tr key={e.id}>
              <Td><div className="font-medium text-navy">{e.user.name}</div><div className="text-xs text-muted">{e.user.email}</div></Td>
              <Td><Badge tone={e.status === "ACTIVE" ? "green" : "gray"}>{e.source}</Badge></Td>
              <Td className="min-w-40"><div className="flex items-center gap-2"><ProgressBar value={e.progressPercent} /><span className="text-xs">{e.progressPercent} %</span></div></Td>
              <Td>{avg !== null ? `${avg} %` : "—"}</Td>
              <Td className="text-muted">{formatDateTime(e.lastAccessedAt ?? e.createdAt)}</Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
