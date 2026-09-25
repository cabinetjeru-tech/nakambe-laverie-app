import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { verifyOrder } from "@/lib/payments/checkout";
import { formatDateTime, formatXof } from "@/lib/format";
import { AutoRefresh } from "@/components/forms/auto-refresh";
import { Card, CardBody, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Statut du paiement" };
export const dynamic = "force-dynamic";

/**
 * Page de retour : elle AFFICHE l'état de la commande. Le paiement n'est considéré comme réussi
 * que lorsque le prestataire l'a confirmé côté serveur (webhook vérifié ou interrogation de son API).
 */
export default async function PaymentStatusPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ annule?: string }> }) {
  const { reference } = await params;
  const { annule } = await searchParams;
  const user = await requireUser(`/paiement/${reference}`);
  let order = await prisma.order.findFirst({ where: { reference, userId: user.id }, include: { course: { select: { slug: true } } } });
  if (!order) notFound();
  if (order.status === "PENDING" && order.provider && order.provider !== "demo") {
    await verifyOrder(reference, "return-page");
    order = await prisma.order.findFirst({ where: { reference, userId: user.id }, include: { course: { select: { slug: true } } } });
  }
  if (!order) notFound();
  const go = order.itemType === "COURSE" && order.course ? `/espace/apprendre/${order.course.slug}` : order.itemType === "PLAN" ? "/formations" : "/espace/formations";

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <Card>
        <CardBody className="py-10 text-center">
          {order.status === "PAID" ? (
            <>
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold text-navy">{order.totalXof > 0 ? "Paiement confirmé" : "Accès activé"}</h1>
              <p className="mt-2 text-sm text-muted">{order.itemLabel} — {formatXof(order.totalXof)}</p>
              {order.mode === "DEMO" && <p className="mt-2 text-xs font-semibold text-amber-700">Transaction de démonstration : aucun argent réel n'a été débité.</p>}
              <div className="mt-6 flex justify-center gap-2">
                <Link href={go} className={buttonClass("primary", "lg")}>Commencer à apprendre</Link>
                <Link href="/espace/paiements" className={buttonClass("outline", "lg")}>Ma facture</Link>
              </div>
            </>
          ) : order.status === "PENDING" ? (
            <>
              <Clock className="mx-auto h-14 w-14 text-amber-500" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold text-navy">{annule ? "Paiement interrompu" : "Paiement en cours de confirmation"}</h1>
              <p className="mt-2 text-sm text-muted">
                {annule
                  ? "Vous avez quitté la page de paiement. Si vous avez tout de même validé la transaction sur votre téléphone, elle sera prise en compte automatiquement."
                  : "Nous attendons la confirmation du prestataire de paiement. Si vous avez validé la transaction sur votre téléphone (Mobile Money), cela peut prendre quelques instants."}
              </p>
              <p className="mt-3 font-mono text-xs text-muted">Référence : {order.reference}</p>
              <AutoRefresh seconds={10} />
              <div className="mt-6 flex justify-center gap-2">
                <Link href={`/paiement/${order.reference}`} className={buttonClass("outline")}>Actualiser</Link>
                <Link href="/contact" className={buttonClass("ghost")}>Besoin d'aide ?</Link>
              </div>
            </>
          ) : (
            <>
              <XCircle className="mx-auto h-14 w-14 text-red-600" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold text-navy">Paiement non abouti</h1>
              <p className="mt-2 text-sm text-muted">{order.failureReason ?? "La transaction a été refusée ou annulée."} Aucun accès n'a été activé.</p>
              <p className="mt-1 text-xs text-muted">Commande du {formatDateTime(order.createdAt)} · {order.reference}</p>
              <div className="mt-6"><Link href={`/paiement/commande?type=${order.itemType}&id=${order.courseId ?? order.packId ?? order.planId}`} className={buttonClass("accent", "lg")}>Réessayer</Link></div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
