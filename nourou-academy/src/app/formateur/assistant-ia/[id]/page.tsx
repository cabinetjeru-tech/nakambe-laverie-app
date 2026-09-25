import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { generatorKinds, type GeneratedProgram, type GeneratedQuiz } from "@/lib/ai/generator";
import { renderMarkdown } from "@/lib/markdown";
import { discardGeneratedAction, publishGeneratedAction, updateGeneratedAction } from "@/app/actions/trainer";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { MarkdownEditor } from "@/components/forms/markdown-editor";
import { Alert, Badge, Card, CardBody, Field, Input, Markdown, PageHeader, Select, Textarea, buttonClass } from "@/components/ui";

export default async function GeneratedDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("trainer.access");
  const g = await prisma.generatedContent.findFirst({ where: { id, trainerId: user.id } });
  if (!g) notFound();
  const def = generatorKinds[g.kind];
  const courses = await prisma.course.findMany({
    where: ["SUPERADMIN", "ADMIN"].includes(user.role) ? {} : { trainerId: user.id },
    select: { id: true, title: true, modules: { orderBy: { position: "asc" }, select: { id: true, title: true } } },
    orderBy: { updatedAt: "desc" },
  });
  let preview: React.ReactNode = null;
  if (def.format === "program") {
    try {
      const p = JSON.parse(g.content) as GeneratedProgram;
      preview = (
        <div className="space-y-3 text-sm">
          {p.objectives.length > 0 && <div><b>Objectifs :</b><ul className="list-disc pl-5">{p.objectives.map((o) => <li key={o}>{o}</li>)}</ul></div>}
          {p.modules.map((m, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <div className="font-semibold text-navy">Module {i + 1} — {m.title}</div>
              <p className="text-muted">{m.description}</p>
              <ul className="mt-1 list-disc pl-5">{m.lessons.map((l, j) => <li key={j}><b>{l.title}</b> ({l.type}, {l.durationMinutes} min) — {l.summary}</li>)}</ul>
            </div>
          ))}
        </div>
      );
    } catch {
      preview = <Alert tone="error">JSON invalide.</Alert>;
    }
  } else if (def.format === "quiz") {
    try {
      const q = JSON.parse(g.content) as GeneratedQuiz;
      preview = (
        <ol className="space-y-3 text-sm">
          {q.questions.map((x, i) => (
            <li key={i} className="rounded-lg border border-line p-3">
              <div className="font-medium text-navy">{i + 1}. {x.prompt} <Badge tone="gray">{x.type}</Badge></div>
              <ul className="mt-1">{x.options.map((o, oi) => <li key={oi} className={x.correct.includes(oi) ? "font-semibold text-emerald-700" : ""}>{x.correct.includes(oi) ? "✓" : "•"} {o}</li>)}</ul>
              {x.rubric && <div className="mt-1 text-xs text-muted">Barème : {x.rubric}</div>}
              {x.explanation && <div className="mt-1 text-xs text-sky">{x.explanation}</div>}
            </li>
          ))}
        </ol>
      );
    } catch {
      preview = <Alert tone="error">JSON invalide.</Alert>;
    }
  }

  return (
    <>
      <PageHeader title={g.title} subtitle={<span>{def.label} · <Badge tone={g.status === "PUBLISHED" ? "green" : g.status === "VALIDATED" ? "sky" : "gray"}>{g.status === "DRAFT" ? "Brouillon à relire" : g.status === "VALIDATED" ? "Validé" : g.status === "PUBLISHED" ? "Publié" : "Écarté"}</Badge></span>} actions={<Link href="/formateur/assistant-ia" className={buttonClass("outline")}>← Retour</Link>} />
      <Alert tone="warning" className="mb-6">Contenu généré par IA : vérifiez l'exactitude (chiffres, références, réglementation), adaptez-le à votre public, puis validez-le avant publication.</Alert>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card><CardBody>
            <div className="mb-2 text-xs text-muted">Demande : {g.brief}</div>
            <ActionForm action={updateGeneratedAction} className="space-y-4">
              <input type="hidden" name="id" value={g.id} />
              <Field label="Titre"><Input name="title" defaultValue={g.title} /></Field>
              {def.format === "markdown" ? (
                <MarkdownEditor name="content" defaultValue={g.content} rows={24} />
              ) : (
                <Field label="Contenu (JSON structuré — modifiable)"><Textarea name="content" defaultValue={g.content} rows={20} className="font-mono text-xs" /></Field>
              )}
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="intent" value="save" variant="outline">Enregistrer</SubmitButton>
                <SubmitButton name="intent" value="validate">Enregistrer et valider</SubmitButton>
              </div>
            </ActionForm>
          </CardBody></Card>
          {preview && <Card><CardBody><div className="mb-3 font-semibold text-navy">Aperçu</div>{preview}</CardBody></Card>}
          {def.format === "markdown" && <Card><CardBody><div className="mb-3 font-semibold text-navy">Aperçu</div><Markdown html={renderMarkdown(g.content)} /></CardBody></Card>}
        </div>
        <aside className="space-y-4">
          <Card><CardBody>
            <div className="mb-2 font-semibold text-navy">Publier dans une formation</div>
            {g.status !== "VALIDATED" && g.status !== "PUBLISHED" && <p className="mb-3 text-sm text-muted">Validez d'abord le contenu après relecture.</p>}
            <ActionForm action={publishGeneratedAction} className="space-y-3">
              <input type="hidden" name="id" value={g.id} />
              <Field label="Formation">
                <Select name="courseId" defaultValue={g.courseId ?? courses[0]?.id}>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
              </Field>
              {def.format !== "program" && (
                <Field label="Module de destination" hint="Choisissez un module de la formation sélectionnée.">
                  <Select name="moduleId">{courses.flatMap((c) => c.modules.map((m) => <option key={m.id} value={m.id}>{c.title} › {m.title}</option>))}</Select>
                </Field>
              )}
              <p className="text-xs text-muted">{def.format === "program" ? "Les modules et leçons seront ajoutés à la suite du programme existant." : def.format === "quiz" ? "Une leçon « Quiz » sera créée avec ses questions et corrigés." : "Une leçon texte sera créée avec ce contenu (et indexée pour le tuteur)."}</p>
              <SubmitButton variant="accent" className="w-full">Publier</SubmitButton>
            </ActionForm>
          </CardBody></Card>
          <form action={discardGeneratedAction.bind(null, g.id)}><SubmitButton variant="ghost" size="sm" confirm="Écarter ce contenu ?">Écarter ce brouillon</SubmitButton></form>
        </aside>
      </div>
    </>
  );
}
