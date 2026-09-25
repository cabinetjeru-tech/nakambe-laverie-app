import Link from "next/link";
import { BookOpen } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDate, formatXof } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui";

export const metadata = { title: "Mes formations" };

export default async function TrainerCourses() {
  const user = await requirePermission("trainer.access");
  const courses = await prisma.course.findMany({ where: { trainerId: user.id }, orderBy: { updatedAt: "desc" }, include: { category: true, _count: { select: { enrollments: true, modules: true } } } });
  const tones = { DRAFT: "gray", SUBMITTED: "amber", PUBLISHED: "green", REJECTED: "red", ARCHIVED: "gray" } as const;
  const labels = { DRAFT: "Brouillon", SUBMITTED: "En validation", PUBLISHED: "Publiée", REJECTED: "À corriger", ARCHIVED: "Archivée" };
  return (
    <>
      <PageHeader title="Mes formations" subtitle="Brouillon → soumission → validation par l'administration → publication → archivage." actions={<Link href="/formateur/formations/nouvelle" className={buttonClass("accent")}>Nouvelle formation</Link>} />
      {courses.length === 0 ? <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Aucune formation" action={<Link href="/formateur/formations/nouvelle" className={buttonClass("primary")}>Créer ma première formation</Link>} /> : (
        <Table>
          <thead><tr><Th>Formation</Th><Th>Catégorie</Th><Th>Prix</Th><Th>Apprenants</Th><Th>Statut</Th><Th>Mise à jour</Th></tr></thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id}>
                <Td><Link href={`/formateur/formations/${c.id}`} className="font-medium text-navy hover:text-sky">{c.title}</Link><div className="text-xs text-muted">{c._count.modules} module(s)</div></Td>
                <Td className="text-muted">{c.category?.name ?? "—"}</Td>
                <Td>{c.isFree ? "Gratuite" : formatXof(c.priceXof)}</Td>
                <Td>{c._count.enrollments}</Td>
                <Td><Badge tone={tones[c.status]}>{labels[c.status]}</Badge></Td>
                <Td className="text-muted">{formatDate(c.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
