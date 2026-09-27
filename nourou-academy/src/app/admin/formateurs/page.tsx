import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { publicFileUrl } from "@/lib/storage";
import { initials } from "@/lib/format";
import { toggleTrainerVisibilityAction } from "@/app/actions/trainers";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, Badge, EmptyState, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui";

export const metadata = { title: "Formateurs" };

export default async function AdminTrainersPage() {
  const admin = await requirePermission("users.view");
  const manage = can(admin.role, "users.manage");
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER", status: { not: "DELETED" } },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, email: true, headline: true, bio: true, avatarFileId: true, status: true, showOnSite: true, displayOrder: true, isDemo: true,
      coursesTaught: { select: { status: true, _count: { select: { enrollments: true } } } },
    },
  });
  return (
    <>
      <PageHeader
        title="Formateurs"
        subtitle="Fiches publiques des formateurs : photo, titre, biographie, spécialités, visibilité et ordre sur la page « Nos formateurs »."
        actions={manage && <Link href="/admin/utilisateurs" className={buttonClass("outline")}>Ajouter un formateur</Link>}
      />
      <Alert className="mb-4">
        Un formateur apparaît sur la page publique s'il est <b>visible</b>, <b>actif</b> et a <b>au moins une formation publiée</b>. Pour ajouter un
        formateur, créez son compte dans Utilisateurs & rôles avec le rôle « Formateur ».
      </Alert>
      {trainers.length === 0 ? <EmptyState title="Aucun formateur pour l'instant." text="Créez un compte avec le rôle « Formateur » dans Utilisateurs & rôles." /> : (
        <Table>
          <thead><tr><Th>Ordre</Th><Th>Formateur</Th><Th>Formations publiées</Th><Th>Apprenants</Th><Th>Page publique</Th><Th></Th></tr></thead>
          <tbody>
            {trainers.map((t) => {
              const published = t.coursesTaught.filter((c) => c.status === "PUBLISHED").length;
              const learners = t.coursesTaught.reduce((n, c) => n + c._count.enrollments, 0);
              const onSite = t.showOnSite && t.status === "ACTIVE" && published > 0;
              const missing = [!t.avatarFileId && "photo", !t.headline && "titre", !t.bio && "biographie"].filter(Boolean);
              return (
                <tr key={t.id}>
                  <Td className="text-muted">{t.displayOrder}</Td>
                  <Td>
                    <Link href={`/admin/formateurs/${t.id}`} className="flex items-center gap-3">
                      {t.avatarFileId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={publicFileUrl(t.avatarFileId)!} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-white">{initials(t.name)}</span>
                      )}
                      <span>
                        <span className="font-medium text-navy hover:text-sky">{t.name}</span>
                        {t.isDemo && <Badge tone="gray" className="ml-2">démo</Badge>}
                        <span className="block text-xs text-muted">{t.headline || t.email}</span>
                        {missing.length > 0 && <span className="block text-xs text-amber-700">À compléter : {missing.join(", ")}</span>}
                      </span>
                    </Link>
                  </Td>
                  <Td>{published} / {t.coursesTaught.length}</Td>
                  <Td>{learners}</Td>
                  <Td>
                    {t.status !== "ACTIVE" ? <Badge tone="red">Compte suspendu</Badge>
                      : onSite ? <Badge tone="green">Affiché</Badge>
                      : !t.showOnSite ? <Badge tone="gray">Masqué</Badge>
                      : <Badge tone="gray">Aucune formation publiée</Badge>}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      {manage && (
                        <form action={toggleTrainerVisibilityAction.bind(null, t.id)}>
                          <SubmitButton size="sm" variant="ghost">
                            {t.showOnSite ? <><EyeOff className="h-4 w-4" aria-hidden /> Masquer</> : <><Eye className="h-4 w-4" aria-hidden /> Afficher</>}
                          </SubmitButton>
                        </form>
                      )}
                      <Link href={`/admin/formateurs/${t.id}`} className={buttonClass("outline", "sm")}>{manage ? "Modifier" : "Voir"}</Link>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
