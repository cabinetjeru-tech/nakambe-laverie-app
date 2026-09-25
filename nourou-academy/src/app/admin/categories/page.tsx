import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { deleteCategoryAction, saveCategoryAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardBody, Field, Input, PageHeader } from "@/components/ui";

export const metadata = { title: "Catégories" };

export default async function CategoriesPage() {
  await requirePermission("categories.manage");
  const cats = await prisma.category.findMany({ orderBy: { position: "asc" }, include: { _count: { select: { courses: true } } } });
  return (
    <>
      <PageHeader title="Catégories" subtitle="Icônes disponibles : Laptop, Briefcase, Megaphone, Camera, Wrench, Target." />
      <div className="space-y-3">
        {[...cats, null].map((c) => (
          <Card key={c?.id ?? "new"}><CardBody>
            <ActionForm action={saveCategoryAction} className="grid items-end gap-3 md:grid-cols-[1fr_2fr_130px_90px_auto]" resetOnSuccess={!c}>
              <input type="hidden" name="id" value={c?.id ?? ""} />
              <Field label={c ? `Nom (${c._count.courses} formation(s))` : "Nouvelle catégorie"}><Input name="name" defaultValue={c?.name} required /></Field>
              <Field label="Description"><Input name="description" defaultValue={c?.description ?? ""} /></Field>
              <Field label="Icône"><Input name="icon" defaultValue={c?.icon ?? ""} /></Field>
              <Field label="Ordre"><Input name="position" type="number" defaultValue={c?.position ?? cats.length} /></Field>
              <div className="flex gap-1">
                <SubmitButton size="md" variant={c ? "outline" : "primary"}>{c ? "Enregistrer" : "Ajouter"}</SubmitButton>
              </div>
            </ActionForm>
            {c && c._count.courses === 0 && <form action={deleteCategoryAction.bind(null, c.id)} className="mt-2"><SubmitButton size="sm" variant="ghost" confirm="Supprimer la catégorie ?"><Trash2 className="h-4 w-4 text-red-600" /> Supprimer</SubmitButton></form>}
          </CardBody></Card>
        ))}
      </div>
    </>
  );
}
