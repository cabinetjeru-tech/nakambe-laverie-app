import Link from "next/link";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { aiStatus } from "@/lib/ai/llm";
import { generatorKinds } from "@/lib/ai/generator";
import { formatDateTime } from "@/lib/format";
import { generateContentAction } from "@/app/actions/trainer";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, Badge, Card, CardBody, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";

export const metadata = { title: "Assistant pédagogique IA" };

const statusTone = { DRAFT: "gray", VALIDATED: "sky", PUBLISHED: "green", DISCARDED: "gray" } as const;
const statusLabel = { DRAFT: "Brouillon", VALIDATED: "Validé", PUBLISHED: "Publié", DISCARDED: "Écarté" };

export default async function GeneratorPage() {
  const user = await requirePermission("trainer.access");
  const [status, courses, items] = await Promise.all([
    aiStatus(),
    prisma.course.findMany({ where: ["SUPERADMIN", "ADMIN"].includes(user.role) ? {} : { trainerId: user.id }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
    prisma.generatedContent.findMany({ where: { trainerId: user.id, status: { not: "DISCARDED" } }, orderBy: { createdAt: "desc" }, take: 50, include: { course: { select: { title: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Assistant pédagogique IA" subtitle="Générez plans de cours, leçons, quiz corrigés, exercices, études de cas, fiches de révision et grilles d'évaluation. Rien n'est publié sans votre relecture et votre validation." />
      {!status.chat && <Alert tone="warning" className="mb-6">Aucun fournisseur d'IA n'est configuré. Un administrateur doit renseigner une clé API (Administration › Paramètres › IA).</Alert>}
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card><CardBody>
          <ActionForm action={generateContentAction} className="space-y-4">
            <Field label="Type de contenu">
              <Select name="kind" defaultValue="LESSON">
                {Object.entries(generatorKinds).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.hint}</option>)}
              </Select>
            </Field>
            <Field label="Formation (pour le contexte)">
              <Select name="courseId" defaultValue="">
                <option value="">Aucune (nouveau projet)</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
            <Field label="Leçon de référence (facultatif)" hint="Titre exact d'une leçon existante dont le contenu servira de base (ex. pour un quiz)."><Input name="lessonTitle" /></Field>
            <Field label="Niveau des apprenants">
              <Select name="level" defaultValue=""><option value="">Celui de la formation</option><option>Débutant</option><option>Intermédiaire</option><option>Avancé</option></Select>
            </Field>
            <Field label="Titre du contenu (facultatif)"><Input name="title" /></Field>
            <Field label="Votre demande" hint="Précisez le sujet, le public, la durée, le nombre de questions, le contexte (pays, secteur)…">
              <Textarea name="brief" rows={6} required minLength={15} placeholder="Ex. : une leçon de 20 minutes sur la fixation des prix pour des couturières de Ouagadougou, avec 2 exemples chiffrés en FCFA et un mini-exercice." />
            </Field>
            <SubmitButton size="lg" className="w-full" pendingText="Génération en cours (jusqu'à 1 minute)…"><Sparkles className="h-4 w-4" /> Générer un brouillon</SubmitButton>
          </ActionForm>
        </CardBody></Card>
        <div>
          <h2 className="mb-3 font-semibold text-navy">Mes contenus générés</h2>
          <Table>
            <thead><tr><Th>Contenu</Th><Th>Type</Th><Th>Formation</Th><Th>Statut</Th><Th>Date</Th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><Td colSpan={5} className="text-center text-muted">Aucun contenu généré.</Td></tr>}
              {items.map((g) => (
                <tr key={g.id}>
                  <Td><Link href={`/formateur/assistant-ia/${g.id}`} className="font-medium text-navy hover:text-sky">{g.title}</Link></Td>
                  <Td className="text-muted">{generatorKinds[g.kind].label}</Td>
                  <Td className="text-muted">{g.course?.title ?? "—"}</Td>
                  <Td><Badge tone={statusTone[g.status]}>{statusLabel[g.status]}</Badge></Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(g.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </>
  );
}
