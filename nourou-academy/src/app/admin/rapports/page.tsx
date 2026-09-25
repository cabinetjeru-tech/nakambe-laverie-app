import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatXof } from "@/lib/format";
import { monthlyRevenue } from "@/lib/stats";
import { RevenueBars } from "@/components/ui/bar-chart";
import { Card, CardBody, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui";

export const metadata = { title: "Rapports" };

export default async function ReportsPage() {
  const user = await requirePermission("reports.view");
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [revenue, topCourses, aiByFeature, aiByModel, completion, subs] = await Promise.all([
    can(user.role, "finance.view") ? monthlyRevenue(12) : Promise.resolve(null),
    prisma.course.findMany({ where: { status: "PUBLISHED" }, select: { id: true, title: true, _count: { select: { enrollments: true, certificates: true } } }, orderBy: { enrollments: { _count: "desc" } }, take: 10 }),
    prisma.aiUsage.groupBy({ by: ["feature"], where: { createdAt: { gte: monthStart } }, _count: true, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.aiUsage.groupBy({ by: ["provider", "model"], where: { createdAt: { gte: monthStart } }, _count: true, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.enrollment.groupBy({ by: ["source"], _count: true, _avg: { progressPercent: true } }),
    prisma.subscription.count({ where: { status: "ACTIVE", endsAt: { gt: new Date() } } }),
  ]);
  const featureLabel: Record<string, string> = { TUTOR: "Tuteur (texte)", VISION: "Analyse d'images/PDF", GRADING: "Correction", GENERATOR: "Générateur formateur", STT: "Transcription vocale", TTS: "Synthèse vocale", EMBEDDING: "Indexation / recherche" };
  return (
    <>
      <PageHeader title="Rapports et statistiques" subtitle="Toutes les valeurs sont calculées depuis la base de données." actions={<><a href="/api/admin/export/apprenants" className={buttonClass("outline")}>Export inscriptions (CSV)</a>{can(user.role, "finance.view") && <a href="/api/admin/export/transactions" className={buttonClass("outline")}>Export transactions (CSV)</a>}</>} />
      <div className="grid gap-6 lg:grid-cols-2">
        {revenue && <Card className="lg:col-span-2"><CardBody><RevenueBars data={revenue} title="Encaissements confirmés par mois (FCFA)" /><p className="mt-2 text-xs text-muted">Total sur 12 mois : {formatXof(revenue.reduce((s, r) => s + r.total, 0))} · {subs} abonnement(s) actif(s)</p></CardBody></Card>}
        <div>
          <h2 className="mb-2 font-semibold text-navy">Formations les plus suivies</h2>
          <Table><thead><tr><Th>Formation</Th><Th>Inscrits</Th><Th>Certifiés</Th></tr></thead><tbody>{topCourses.map((c) => <tr key={c.id}><Td className="text-sm">{c.title}</Td><Td>{c._count.enrollments}</Td><Td>{c._count.certificates}</Td></tr>)}</tbody></Table>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-navy">Inscriptions par origine</h2>
          <Table><thead><tr><Th>Origine</Th><Th>Inscriptions</Th><Th>Progression moyenne</Th></tr></thead><tbody>{completion.map((c) => <tr key={c.source}><Td>{c.source}</Td><Td>{c._count}</Td><Td>{Math.round(c._avg.progressPercent ?? 0)} %</Td></tr>)}</tbody></Table>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-navy">Usage de l'IA ce mois (par fonction)</h2>
          <Table><thead><tr><Th>Fonction</Th><Th>Requêtes</Th><Th>Tokens entrée</Th><Th>Tokens sortie</Th></tr></thead><tbody>{aiByFeature.map((a) => <tr key={a.feature}><Td>{featureLabel[a.feature] ?? a.feature}</Td><Td>{a._count}</Td><Td>{(a._sum.inputTokens ?? 0).toLocaleString("fr-FR")}</Td><Td>{(a._sum.outputTokens ?? 0).toLocaleString("fr-FR")}</Td></tr>)}</tbody></Table>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-navy">Usage de l'IA ce mois (par modèle)</h2>
          <Table><thead><tr><Th>Fournisseur / modèle</Th><Th>Requêtes</Th><Th>Tokens</Th></tr></thead><tbody>{aiByModel.map((a) => <tr key={`${a.provider}${a.model}`}><Td className="text-sm">{a.provider} · {a.model}</Td><Td>{a._count}</Td><Td>{((a._sum.inputTokens ?? 0) + (a._sum.outputTokens ?? 0)).toLocaleString("fr-FR")}</Td></tr>)}</tbody></Table>
          <p className="mt-2 text-xs text-muted">Multipliez par les tarifs en vigueur de votre fournisseur pour estimer le coût ; plafonnez via le budget mensuel (Paramètres › IA).</p>
        </div>
      </div>
    </>
  );
}
