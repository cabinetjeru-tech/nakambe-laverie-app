import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDateTime, formatXof } from "@/lib/format";
import { cancelOrderAction, processRefundAction, reverifyOrderAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, PageHeader, Table, Td, Textarea, Th, buttonClass, inputClass } from "@/components/ui";

export const metadata = { title: "Transactions" };
const tones = { PENDING: "amber", PAID: "green", FAILED: "red", CANCELED: "gray", REFUNDED: "gray" } as const;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string; vue?: string }> }) {
  const sp = await searchParams;
  const admin = await requirePermission("finance.view");
  const manage = can(admin.role, "finance.manage");
  const where: Prisma.OrderWhereInput = {};
  if (sp.statut && sp.statut in tones) where.status = sp.statut as OrderStatus;
  if (sp.q) where.OR = [{ reference: { contains: sp.q, mode: "insensitive" } }, { user: { email: { contains: sp.q, mode: "insensitive" } } }, { providerRef: { contains: sp.q } }];
  const [orders, refunds] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true, email: true } }, invoice: true, events: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.refund.findMany({ where: { status: "REQUESTED" }, include: { order: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Transactions" subtitle="Seules les confirmations serveur des prestataires (webhook vérifié ou interrogation d'API) activent un accès." actions={<a href="/api/admin/export/transactions" className={buttonClass("outline")}>Exporter (CSV)</a>} />
      {refunds.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold text-navy">Demandes de remboursement ({refunds.length})</h2>
          <div className="space-y-3">
            {refunds.map((r) => (
              <Card key={r.id}><CardBody className="grid gap-4 md:grid-cols-[1fr_360px]">
                <div className="text-sm">
                  <div className="font-semibold text-navy">{r.order.itemLabel} — {formatXof(r.amountXof)}</div>
                  <div className="text-xs text-muted">{r.order.user.name} ({r.order.user.email}) · {r.order.reference} · via {r.order.provider}</div>
                  <p className="mt-2 rounded-lg bg-surface p-2">{r.reason}</p>
                </div>
                {manage && (
                  <ActionForm action={processRefundAction} className="space-y-2">
                    <input type="hidden" name="refundId" value={r.id} />
                    <Textarea name="note" rows={2} placeholder="Note pour le client" />
                    <div className="flex gap-2">
                      <SubmitButton name="decision" value="approve" size="sm" confirm="Accepter : l'accès sera retiré. Effectuez le remboursement depuis le tableau de bord du prestataire.">Accepter</SubmitButton>
                      <SubmitButton name="decision" value="reject" size="sm" variant="outline">Refuser</SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </CardBody></Card>
            ))}
          </div>
        </section>
      )}
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Référence, email, n° de transaction…" className={`${inputClass} h-10 max-w-xs`} />
        <select name="statut" defaultValue={sp.statut ?? ""} className={`${inputClass} h-10 max-w-44`}>
          <option value="">Tous statuts</option>
          {Object.keys(tones).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className={buttonClass("outline")}>Filtrer</button>
      </form>
      <Table>
        <thead><tr><Th>Référence</Th><Th>Client</Th><Th>Article</Th><Th>Montant</Th><Th>Prestataire</Th><Th>Statut</Th><Th>Date</Th><Th></Th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <Td className="font-mono text-xs">{o.reference}{o.invoice && <div><a href={`/api/factures/${o.invoice.number}`} className="text-sky">{o.invoice.number}</a></div>}</Td>
              <Td><div className="text-sm">{o.user.name}</div><div className="text-xs text-muted">{o.user.email}</div></Td>
              <Td className="max-w-56 text-sm">{o.itemLabel}{o.discountXof > 0 && <div className="text-xs text-muted">remise {formatXof(o.discountXof)}</div>}</Td>
              <Td className="whitespace-nowrap font-semibold">{formatXof(o.totalXof)}</Td>
              <Td className="text-xs">{o.provider ?? "—"}{o.mode !== "LIVE" && <Badge tone="amber" className="ml-1">{o.mode}</Badge>}{o.providerRef && <div className="font-mono text-muted">{o.providerRef.slice(0, 18)}</div>}</Td>
              <Td><Badge tone={tones[o.status]}>{o.status}</Badge>{o.failureReason && <div className="max-w-40 text-xs text-muted">{o.failureReason}</div>}</Td>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(o.createdAt)}{o.events[0] && <div>dernier évènement : {o.events[0].kind}</div>}</Td>
              <Td className="whitespace-nowrap">
                {manage && o.status === "PENDING" && o.provider && o.provider !== "demo" && <form action={reverifyOrderAction.bind(null, o.reference)} className="inline"><SubmitButton size="sm" variant="ghost">Vérifier</SubmitButton></form>}
                {manage && o.status === "PENDING" && <form action={cancelOrderAction.bind(null, o.id)} className="inline"><SubmitButton size="sm" variant="ghost" confirm="Annuler cette commande en attente ?">Annuler</SubmitButton></form>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-muted"><Link href="/admin/rapports" className="text-sky">Voir les rapports financiers</Link></p>
    </>
  );
}
