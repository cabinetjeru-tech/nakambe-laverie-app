import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { PageHeader, Table, Td, Th, buttonClass, inputClass } from "@/components/ui";

export const metadata = { title: "Journal d'audit" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const { action } = await searchParams;
  await requirePermission("audit.view");
  const logs = await prisma.auditLog.findMany({ where: action ? { action: { contains: action } } : {}, orderBy: { createdAt: "desc" }, take: 300, include: { actor: { select: { name: true, email: true } } } });
  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="Traçabilité des opérations administratives et sensibles (aucune donnée secrète n'y est enregistrée)." />
      <form className="mb-4 flex gap-2"><input name="action" defaultValue={action} placeholder="Filtrer par action (ex. settings, refund)" className={`${inputClass} h-10 max-w-sm`} /><button className={buttonClass("outline")}>Filtrer</button></form>
      <Table>
        <thead><tr><Th>Date</Th><Th>Auteur</Th><Th>Action</Th><Th>Objet</Th><Th>Détails</Th><Th>IP</Th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(l.createdAt)}</Td>
              <Td className="text-sm">{l.actor?.name ?? "Système"}</Td>
              <Td className="font-mono text-xs">{l.action}</Td>
              <Td className="text-xs">{l.entity}{l.entityId ? ` · ${l.entityId.slice(0, 12)}` : ""}</Td>
              <Td className="max-w-xs truncate font-mono text-[11px] text-muted">{l.meta ? JSON.stringify(l.meta) : ""}</Td>
              <Td className="text-xs text-muted">{l.ip}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
