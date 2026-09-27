import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { publicFileUrl } from "@/lib/storage";
import { initials } from "@/lib/format";
import { removeTrainerAvatarAction, updateTrainerProfileAction } from "@/app/actions/trainers";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { FileUploader } from "@/components/forms/file-uploader";
import { Badge, Card, CardBody, Checkbox, Field, Input, PageHeader, Table, Td, Textarea, Th, buttonClass } from "@/components/ui";

export const metadata = { title: "Fiche formateur" };

const statusLabels: Record<string, string> = { DRAFT: "Brouillon", SUBMITTED: "Soumise", PUBLISHED: "Publiée", ARCHIVED: "Archivée", REJECTED: "Refusée" };

export default async function AdminTrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePermission("users.view");
  const manage = can(admin.role, "users.manage");
  const t = await prisma.user.findFirst({
    where: { id, role: "TRAINER", status: { not: "DELETED" } },
    include: { coursesTaught: { select: { id: true, title: true, status: true, _count: { select: { enrollments: true } } }, orderBy: { title: "asc" } } },
  });
  if (!t) notFound();
  const disabled = !manage;
  return (
    <>
      <PageHeader
        title={t.name}
        subtitle={`${t.email}${t.phone ? ` · ${t.phone}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/formateurs" className={buttonClass("outline")}>← Formateurs</Link>
            <Link href={`/formateurs/${t.id}`} target="_blank" className={buttonClass("outline")}>Voir la page publique</Link>
            <Link href={`/admin/utilisateurs/${t.id}`} className={buttonClass("ghost")}>Compte et accès</Link>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card><CardBody>
          <h2 className="mb-4 font-semibold text-navy">Fiche publique</h2>
          <ActionForm action={updateTrainerProfileAction} className="space-y-4">
            <input type="hidden" name="trainerId" value={t.id} />
            <Field label="Nom affiché"><Input name="name" defaultValue={t.name} required maxLength={100} disabled={disabled} /></Field>
            <Field label="Titre professionnel" hint="Ex. : Expert-comptable, 12 ans d'expérience en PME"><Input name="headline" defaultValue={t.headline ?? ""} maxLength={160} disabled={disabled} /></Field>
            <Field label="Biographie" hint="Parcours, expériences, réalisations. 3 000 caractères maximum."><Textarea name="bio" defaultValue={t.bio ?? ""} rows={8} maxLength={3000} disabled={disabled} /></Field>
            <Field label="Spécialités" hint="Séparées par des virgules (12 maximum). Ex. : Comptabilité, Fiscalité, Excel"><Input name="expertise" defaultValue={t.expertise.join(", ")} disabled={disabled} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ordre d'affichage" hint="0 = en premier ; les formateurs sont triés par ce nombre puis par nom."><Input name="displayOrder" type="number" min={0} max={9999} defaultValue={t.displayOrder} disabled={disabled} /></Field>
              <div className="pt-7"><Checkbox name="showOnSite" defaultChecked={t.showOnSite} disabled={disabled} label="Afficher sur la page « Nos formateurs »" /></div>
            </div>
            {manage && <SubmitButton>Enregistrer la fiche</SubmitButton>}
          </ActionForm>
        </CardBody></Card>
        <div className="space-y-6">
          <Card><CardBody className="space-y-4">
            <h2 className="font-semibold text-navy">Photo</h2>
            <div className="flex items-center gap-4">
              {t.avatarFileId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={publicFileUrl(t.avatarFileId)!} alt="" className="h-24 w-24 rounded-full object-cover" />
              ) : (
                <span className="grid h-24 w-24 place-items-center rounded-full bg-navy text-2xl font-bold text-white">{initials(t.name)}</span>
              )}
              {manage && t.avatarFileId && (
                <form action={removeTrainerAvatarAction.bind(null, t.id)}>
                  <SubmitButton size="sm" variant="ghost" confirm="Retirer la photo ?">Retirer la photo</SubmitButton>
                </form>
              )}
            </div>
            {manage && (
              <FileUploader params={{ purpose: "trainer-avatar", targetId: t.id }} accept="image/jpeg,image/png,image/webp" label={t.avatarFileId ? "Changer la photo" : "Ajouter une photo"} hint="Photo carrée de préférence, JPG/PNG/WebP, 3 Mo maximum." />
            )}
          </CardBody></Card>
          <Card><CardBody>
            <h2 className="mb-3 font-semibold text-navy">Formations</h2>
            {t.coursesTaught.length === 0 ? <p className="text-sm text-muted">Aucune formation pour l'instant.</p> : (
              <Table>
                <thead><tr><Th>Formation</Th><Th>Statut</Th><Th>Apprenants</Th></tr></thead>
                <tbody>
                  {t.coursesTaught.map((c) => (
                    <tr key={c.id}>
                      <Td>{c.title}</Td>
                      <Td><Badge tone={c.status === "PUBLISHED" ? "green" : "gray"}>{statusLabels[c.status] ?? c.status}</Badge></Td>
                      <Td>{c._count.enrollments}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody></Card>
        </div>
      </div>
    </>
  );
}
