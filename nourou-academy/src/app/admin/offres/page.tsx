import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatXof } from "@/lib/format";
import { savePackAction, savePlanAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardBody, Checkbox, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

export const metadata = { title: "Abonnements et packs" };

export default async function OffersPage() {
  await requirePermission("finance.manage");
  const [plans, packs, courses] = await Promise.all([
    prisma.plan.findMany({ orderBy: { position: "asc" }, include: { _count: { select: { subscriptions: true } } } }),
    prisma.pack.findMany({ include: { courses: true } }),
    prisma.course.findMany({ where: { status: "PUBLISHED" }, select: { id: true, title: true, priceXof: true }, orderBy: { title: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Abonnements et packs" subtitle="Tous les prix sont en FCFA et modifiables. Les changements s'appliquent aux nouvelles commandes." />
      <h2 className="mb-3 text-lg font-bold text-navy">Formules d'abonnement</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {[...plans, null].map((p) => (
          <Card key={p?.id ?? "new"}><CardBody>
            <ActionForm action={savePlanAction} className="space-y-3" resetOnSuccess={!p}>
              <input type="hidden" name="id" value={p?.id ?? ""} />
              <div className="text-sm font-semibold text-navy">{p ? `${p.name} — ${p._count.subscriptions} abonnement(s)` : "Nouvelle formule"}</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom"><Input name="name" defaultValue={p?.name} required /></Field>
                <Field label="Code"><Input name="code" defaultValue={p?.code} required pattern="[a-z0-9-]+" /></Field>
                <Field label="Périodicité"><Select name="interval" defaultValue={p?.interval ?? "MONTH"}><option value="MONTH">Mensuel</option><option value="QUARTER">Trimestriel</option><option value="YEAR">Annuel</option></Select></Field>
                <Field label="Prix (FCFA)"><Input name="priceXof" type="number" min={100} step={100} defaultValue={p?.priceXof} required /></Field>
              </div>
              <Field label="Description"><Input name="description" defaultValue={p?.description ?? ""} /></Field>
              <Field label="Avantages (un par ligne)"><Textarea name="features" rows={3} defaultValue={p?.features.join("\n")} /></Field>
              <div className="flex items-center gap-4"><Checkbox name="active" defaultChecked={p?.active ?? true} label="Active" /><Field label="Ordre"><Input name="position" type="number" defaultValue={p?.position ?? plans.length} className="w-20" /></Field></div>
              <SubmitButton size="sm">{p ? "Enregistrer" : "Créer"}</SubmitButton>
            </ActionForm>
          </CardBody></Card>
        ))}
      </div>
      <h2 className="mb-3 mt-10 text-lg font-bold text-navy">Packs de formations</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {[...packs, null].map((p) => (
          <Card key={p?.id ?? "new"}><CardBody>
            <ActionForm action={savePackAction} className="space-y-3" resetOnSuccess={!p}>
              <input type="hidden" name="id" value={p?.id ?? ""} />
              <div className="grid grid-cols-[1fr_150px] gap-3">
                <Field label="Titre"><Input name="title" defaultValue={p?.title} required /></Field>
                <Field label="Prix (FCFA)"><Input name="priceXof" type="number" min={0} step={500} defaultValue={p?.priceXof} required /></Field>
              </div>
              <Field label="Description"><Textarea name="description" rows={2} defaultValue={p?.description} /></Field>
              <fieldset className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-2 text-sm">
                <legend className="px-1 text-xs text-muted">Formations incluses</legend>
                {courses.map((c) => <label key={c.id} className="flex gap-2"><input type="checkbox" name="courseIds" value={c.id} defaultChecked={p?.courses.some((pc) => pc.courseId === c.id)} />{c.title} <span className="text-muted">({formatXof(c.priceXof)})</span></label>)}
              </fieldset>
              <Checkbox name="active" defaultChecked={p?.active ?? true} label="Actif" />
              <SubmitButton size="sm">{p ? "Enregistrer" : "Créer le pack"}</SubmitButton>
            </ActionForm>
          </CardBody></Card>
        ))}
      </div>
    </>
  );
}
