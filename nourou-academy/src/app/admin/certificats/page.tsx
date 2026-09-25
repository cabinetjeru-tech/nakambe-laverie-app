import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { certificateDecisionAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, PageHeader, Table, Td, Th, buttonClass, inputClass } from "@/components/ui";

export const metadata = { title: "Certificats" };

export default async function AdminCertificates({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  await requirePermission("certificates.manage");
  const certs = await prisma.certificate.findMany({
    where: q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { learnerName: { contains: q, mode: "insensitive" } }, { courseTitle: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: [{ status: "asc" }, { issuedAt: "desc" }],
    take: 200,
  });
  return (
    <>
      <PageHeader title="Certificats" subtitle="Approbation des certificats soumis à validation humaine, révocation et recherche." />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Code, apprenant, formation…" className={`${inputClass} h-10 max-w-sm`} /><button className={buttonClass("outline")}>Rechercher</button></form>
      <Table>
        <thead><tr><Th>Code</Th><Th>Apprenant</Th><Th>Formation</Th><Th>Date</Th><Th>Statut</Th><Th></Th></tr></thead>
        <tbody>
          {certs.map((c) => (
            <tr key={c.id}>
              <Td className="font-mono text-xs"><a href={`/api/certificats/${c.code}/pdf`} className="text-sky">{c.code}</a></Td>
              <Td>{c.learnerName}</Td>
              <Td className="text-sm">{c.courseTitle}</Td>
              <Td className="text-muted">{formatDate(c.issuedAt)}</Td>
              <Td><Badge tone={c.status === "VALID" ? "green" : c.status === "REVOKED" ? "red" : "amber"}>{c.status === "VALID" ? "Valide" : c.status === "REVOKED" ? "Révoqué" : "À approuver"}</Badge></Td>
              <Td className="whitespace-nowrap">
                {c.status === "PENDING_APPROVAL" && <form action={certificateDecisionAction.bind(null, c.id, "approve")} className="inline"><SubmitButton size="sm">Approuver</SubmitButton></form>}
                {c.status !== "REVOKED" && <form action={certificateDecisionAction.bind(null, c.id, "revoke")} className="inline"><SubmitButton size="sm" variant="ghost" confirm="Révoquer ce certificat ?">Révoquer</SubmitButton></form>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
