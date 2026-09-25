import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { resolveReportAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardBody, EmptyState, Input, PageHeader } from "@/components/ui";

export const metadata = { title: "Signalements" };

export default async function ModerationPage() {
  await requirePermission("reviews.moderate");
  const reports = await prisma.report.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { reporter: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="Modération et signalements" subtitle="Contenus signalés par les utilisateurs (avis, messages)." />
      {reports.length === 0 ? <EmptyState title="Aucun signalement en attente" /> : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id}><CardBody className="text-sm">
              <div><b className="text-navy">{r.targetType}</b> · signalé par {r.reporter?.name ?? "anonyme"} · {formatDateTime(r.createdAt)}</div>
              <p className="mt-1">{r.reason}</p>
              <ActionForm action={resolveReportAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="reportId" value={r.id} />
                <Input name="resolution" placeholder="Décision (note interne)" className="max-w-sm" />
                <SubmitButton name="decision" value="remove" size="sm" variant="danger">Retirer le contenu</SubmitButton>
                <SubmitButton name="decision" value="keep" size="sm" variant="outline">Conserver</SubmitButton>
              </ActionForm>
            </CardBody></Card>
          ))}
        </div>
      )}
    </>
  );
}
