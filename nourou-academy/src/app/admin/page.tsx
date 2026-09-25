import Link from "next/link";
import { AlertTriangle, BookOpen, Bot, CreditCard, LifeBuoy, Users, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatXof } from "@/lib/format";
import { monthlyRevenue } from "@/lib/stats";
import { aiStatus } from "@/lib/ai/llm";
import { availableProviders } from "@/lib/payments/registry";
import { env } from "@/lib/env";
import { RevenueBars } from "@/components/ui/bar-chart";
import { Alert, Card, CardBody, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Administration" };

export default async function AdminDashboard() {
  const user = await requirePermission("admin.access");
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [learners, trainers, newUsers, published, toReview, revenueMonth, pendingOrders, refunds, tickets, pendingCerts, aiMonth, ai, providers, revenue] = await Promise.all([
    prisma.user.count({ where: { role: "LEARNER", status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "TRAINER", status: "ACTIVE" } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.course.count({ where: { status: "SUBMITTED" } }),
    prisma.order.aggregate({ where: { status: "PAID", mode: "LIVE", paidAt: { gte: monthStart } }, _sum: { totalXof: true }, _count: true }),
    prisma.order.count({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 30 * 60_000) } } }),
    prisma.refund.count({ where: { status: "REQUESTED" } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.certificate.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { inputTokens: true, outputTokens: true }, _count: true }),
    aiStatus(),
    availableProviders(),
    can(user.role, "finance.view") ? monthlyRevenue(12) : Promise.resolve(null),
  ]);
  const realProviders = providers.filter((p) => p.id !== "demo");
  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={`Environnement : ${env.appEnv}${env.paymentDemoEnabled ? " · paiements de démonstration actifs" : ""}`} />
      <div className="mb-6 space-y-2">
        {!ai.chat && <Alert tone="warning"><AlertTriangle className="mr-1 inline h-4 w-4" /> Le tuteur IA n'est pas actif : ajoutez une clé Anthropic ou OpenAI dans <Link href="/admin/parametres?onglet=ia" className="font-semibold underline">Paramètres › IA</Link>.</Alert>}
        {realProviders.length === 0 && <Alert tone="warning">Aucun prestataire de paiement réel n'est configuré. <Link href="/admin/parametres?onglet=paiements" className="font-semibold underline">Configurer les paiements</Link>.</Alert>}
        {toReview > 0 && <Alert tone="info">{toReview} formation(s) en attente de validation. <Link href="/admin/formations?statut=SUBMITTED" className="font-semibold underline">Examiner</Link></Alert>}
        {refunds > 0 && <Alert tone="info">{refunds} demande(s) de remboursement à traiter. <Link href="/admin/transactions?vue=remboursements" className="font-semibold underline">Voir</Link></Alert>}
        {pendingCerts > 0 && <Alert tone="info">{pendingCerts} certificat(s) en attente d'approbation. <Link href="/admin/certificats" className="font-semibold underline">Voir</Link></Alert>}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Apprenants actifs" value={learners} hint={`+${newUsers} inscrit(s) ce mois`} icon={<Users className="h-5 w-5" />} />
        <Stat label="Formations publiées" value={published} hint={`${trainers} formateur(s)`} icon={<BookOpen className="h-5 w-5" />} />
        <Stat label="Encaissé ce mois" value={formatXof(revenueMonth._sum.totalXof ?? 0)} hint={`${revenueMonth._count} paiement(s) confirmé(s)`} icon={<Wallet className="h-5 w-5" />} />
        <Stat label="Tickets ouverts" value={tickets} hint={pendingOrders ? `${pendingOrders} paiement(s) en attente > 30 min` : undefined} icon={<LifeBuoy className="h-5 w-5" />} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {revenue && <Card className="lg:col-span-2"><CardBody><RevenueBars data={revenue} title="Encaissements confirmés par mois (FCFA, hors démonstration)" /></CardBody></Card>}
        <Card><CardBody className="space-y-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-navy"><Bot className="h-4 w-4 text-sky" /> IA ce mois-ci</div>
          <div>{aiMonth._count} requête(s) · {((aiMonth._sum.inputTokens ?? 0) + (aiMonth._sum.outputTokens ?? 0)).toLocaleString("fr-FR")} tokens</div>
          <div className="text-xs text-muted">Fournisseur : {ai.provider ?? "aucun"} · Recherche sémantique : {ai.embeddings ? "oui" : "non (plein texte)"} · Voix serveur : {ai.voiceServer ? "oui" : "non"}</div>
          <div className="flex items-center gap-2 pt-2 font-semibold text-navy"><CreditCard className="h-4 w-4 text-sky" /> Paiements</div>
          <div className="text-xs text-muted">{realProviders.length ? realProviders.map((p) => p.label).join(", ") : "Aucun prestataire réel actif"}</div>
        </CardBody></Card>
      </div>
    </>
  );
}
