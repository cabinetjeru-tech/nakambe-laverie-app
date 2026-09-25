import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { formatXof } from "@/lib/format";
import { confirmDemoAction } from "@/app/actions/payments";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardBody } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Simulateur de prestataire — uniquement hors production (PAYMENT_DEMO_ENABLED=true et APP_ENV≠production). */
export default async function DemoPaymentPage({ params }: { params: Promise<{ reference: string }> }) {
  if (!env.paymentDemoEnabled) notFound();
  const { reference } = await params;
  const user = await requireUser();
  const order = await prisma.order.findFirst({ where: { reference, userId: user.id, provider: "demo", status: "PENDING" } });
  if (!order) notFound();
  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <Card className="border-amber-300">
        <CardBody className="text-center">
          <FlaskConical className="mx-auto h-12 w-12 text-amber-500" aria-hidden />
          <h1 className="mt-3 text-xl font-bold text-navy">Prestataire de paiement de démonstration</h1>
          <p className="mt-2 text-sm text-muted">Cet écran remplace la page d'un vrai prestataire (CinetPay, PayDunya, Wave…) en environnement de test. Aucun argent réel n'est débité.</p>
          <div className="my-6 rounded-xl bg-surface p-4">
            <div className="text-sm text-muted">{order.itemLabel}</div>
            <div className="text-2xl font-extrabold text-navy">{formatXof(order.totalXof)}</div>
            <div className="font-mono text-xs text-muted">{order.reference}</div>
          </div>
          <div className="flex justify-center gap-2">
            <form action={confirmDemoAction.bind(null, reference, "success")}><SubmitButton variant="accent">Simuler un paiement réussi</SubmitButton></form>
            <form action={confirmDemoAction.bind(null, reference, "failure")}><SubmitButton variant="outline">Simuler un échec</SubmitButton></form>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
