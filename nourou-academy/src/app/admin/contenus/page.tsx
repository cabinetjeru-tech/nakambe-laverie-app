import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { deleteFaqAction, deletePostAction, saveFaqAction, savePostAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { MarkdownEditor } from "@/components/forms/markdown-editor";
import { Badge, Card, CardBody, Checkbox, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

export const metadata = { title: "Blog et FAQ" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ article?: string }> }) {
  const { article } = await searchParams;
  await requirePermission("content.manage");
  const [posts, faqs] = await Promise.all([prisma.blogPost.findMany({ orderBy: { createdAt: "desc" } }), prisma.faq.findMany({ orderBy: [{ category: "asc" }, { position: "asc" }] })]);
  const p = posts.find((x) => x.id === article);
  return (
    <>
      <PageHeader title="Blog, ressources et FAQ" />
      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <Card className="p-2">
          <a href="?" className="block rounded-lg px-3 py-2 text-sm font-semibold text-sky hover:bg-sky-50">+ Nouvelle publication</a>
          {posts.map((x) => <a key={x.id} href={`?article=${x.id}`} className={`block rounded-lg px-3 py-2 text-sm ${x.id === article ? "bg-sky-50" : "hover:bg-surface"}`}><span className="text-navy">{x.title}</span> <Badge tone={x.published ? "green" : "gray"}>{x.published ? "En ligne" : "Brouillon"}</Badge>{x.isDemo && <Badge tone="amber">Démo</Badge>}</a>)}
        </Card>
        <Card><CardBody>
          <ActionForm action={savePostAction} className="space-y-3" key={p?.id ?? "new"}>
            <input type="hidden" name="id" value={p?.id ?? ""} />
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <Field label="Titre"><Input name="title" defaultValue={p?.title} required /></Field>
              <Field label="Type"><Select name="kind" defaultValue={p?.kind ?? "ARTICLE"}><option value="ARTICLE">Article</option><option value="RESOURCE">Ressource gratuite</option></Select></Field>
            </div>
            <Field label="Résumé"><Textarea name="excerpt" rows={2} defaultValue={p?.excerpt} maxLength={400} /></Field>
            <Field label="Contenu"><MarkdownEditor name="content" defaultValue={p?.content} rows={14} /></Field>
            <Field label="Lien de la ressource téléchargeable (facultatif)"><Input name="resourceUrl" defaultValue={p?.resourceUrl ?? ""} placeholder="https://… ou /api/files/…" /></Field>
            <Checkbox name="published" defaultChecked={p?.published} label="Publié" />
            <div className="flex gap-2"><SubmitButton>Enregistrer</SubmitButton></div>
          </ActionForm>
          {p && <form action={deletePostAction.bind(null, p.id)} className="mt-3"><SubmitButton variant="ghost" size="sm" confirm="Supprimer cette publication ?"><Trash2 className="h-4 w-4 text-red-600" /> Supprimer</SubmitButton></form>}
        </CardBody></Card>
      </div>
      <h2 className="mb-3 mt-10 text-lg font-bold text-navy">Questions fréquentes</h2>
      <div className="space-y-3">
        {[...faqs, null].map((f) => (
          <Card key={f?.id ?? "new"}><CardBody>
            <ActionForm action={saveFaqAction} className="grid gap-3 md:grid-cols-[160px_1fr_80px]" resetOnSuccess={!f}>
              <input type="hidden" name="id" value={f?.id ?? ""} />
              <Field label="Catégorie"><Input name="category" defaultValue={f?.category ?? "Général"} /></Field>
              <Field label={f ? "Question" : "Nouvelle question"}><Input name="question" defaultValue={f?.question} required /></Field>
              <Field label="Ordre"><Input name="position" type="number" defaultValue={f?.position ?? faqs.length} /></Field>
              <Field label="Réponse" className="md:col-span-3"><Textarea name="answer" rows={2} defaultValue={f?.answer} required /></Field>
              <div className="flex gap-2 md:col-span-3"><SubmitButton size="sm" variant={f ? "outline" : "primary"}>{f ? "Enregistrer" : "Ajouter"}</SubmitButton></div>
            </ActionForm>
            {f && <form action={deleteFaqAction.bind(null, f.id)} className="mt-2"><SubmitButton size="sm" variant="ghost" confirm="Supprimer ?"><Trash2 className="h-4 w-4 text-red-600" /></SubmitButton></form>}
          </CardBody></Card>
        ))}
      </div>
    </>
  );
}
