import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatXof } from "@/lib/format";
import { requestRefundAction } from "@/app/actions/account";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, EmptyState, PageHeader, Table, Td, Textarea, Th, buttonClass } from "@/components/ui";

export const metadata = { title: "Paiements et factures" };

const orderStatus = { PENDING: ["En attente", "amber"], PAID: ["Payée", "green"], FAILED: ["Échouée", "red"], CANCELED: ["Annulée", "gray"], REFUNDED: ["Remboursée", "gray"] } as const;

export default async function PaymentsPage() {
  const user = await requireUser();
  const [orders, subs] = await Promise.all([
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { invoice: true, refunds: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.subscription.findMany({ where: { userId: user.id }, orderBy: { endsAt: "desc" }, include: { plan: true } }),
  ]);
  const activeSub = subs.find((s) => s.status === "ACTIVE" && s.endsAt > new Date());
  return (
    <>
      <PageHeader title="Paiements et factures" subtitle="Historique de vos commandes, factures et abonnement." actions={<Link href="/tarifs" className={buttonClass("outline")}>Voir les offres</Link>} />
      <Card className="mb-8">
        <CardBody>
          <div className="text-sm font-semibold text-navy">Abonnement</div>
          {activeSub ? (
            <p className="mt-1 text-sm">Formule <b>{activeSub.plan.name}</b> active jusqu'au <b>{formatDate(activeSub.endsAt)}</b>. Vous pouvez la prolonger à tout moment : la durée s'ajoute à la période en cours.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">Aucun abonnement actif. <Link href="/tarifs" className="font-medium text-sky">Découvrir les abonnements</Link></p>
          )}
        </CardBody>
      </Card>
      {orders.length === 0 ? <EmptyState icon={<Receipt className="h-6 w-6" />} title="Aucune transaction" /> : (
        <Table>
          <thead><tr><Th>Référence</Th><Th>Article</Th><Th>Date</Th><Th>Montant</Th><Th>Statut</Th><Th>Facture</Th></tr></thead>
          <tbody>
            {orders.map((o) => {
              const [label, tone] = orderStatus[o.status];
              const refund = o.refunds[0];
              return (
                <tr key={o.id}>
                  <Td className="font-mono text-xs"><Link href={`/paiement/${o.reference}`} className="text-sky hover:underline">{o.reference}</Link>{o.mode === "DEMO" && <Badge tone="amber" className="ml-1">Démo</Badge>}</Td>
                  <Td>{o.itemLabel}{o.discountXof > 0 && <div className="text-xs text-muted">Remise : −{formatXof(o.discountXof)}</div>}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(o.createdAt)}</Td>
                  <Td className="whitespace-nowrap font-semibold">{formatXof(o.totalXof)}</Td>
                  <Td>
                    <Badge tone={tone}>{label}</Badge>
                    {refund && <div className="mt-1 text-xs text-muted">Remboursement : {refund.status === "REQUESTED" ? "demandé" : refund.status === "APPROVED" ? "accepté" : "refusé"}</div>}
                  </Td>
                  <Td>
                    {o.invoice ? <a href={`/api/factures/${o.invoice.number}`} className="inline-flex items-center gap-1 text-sm font-medium text-sky hover:underline"><Download className="h-4 w-4" /> {o.invoice.number}</a> : "—"}
                    {o.status === "PAID" && o.totalXof > 0 && !refund && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted">Demander un remboursement</summary>
                        <ActionForm action={requestRefundAction} className="mt-2 w-64 space-y-2">
                          <input type="hidden" name="orderId" value={o.id} />
                          <Textarea name="reason" rows={3} required minLength={10} placeholder="Raison de la demande" />
                          <SubmitButton size="sm" variant="outline">Envoyer la demande</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
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
