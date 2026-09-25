import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { replyTicketAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, EmptyState, PageHeader, Select, Textarea } from "@/components/ui";

export const metadata = { title: "Assistance" };
const label = { OPEN: "Ouvert", IN_PROGRESS: "En cours", RESOLVED: "Résolu", CLOSED: "Fermé" };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ tous?: string }> }) {
  const { tous } = await searchParams;
  await requirePermission("tickets.manage");
  const tickets = await prisma.supportTicket.findMany({ where: tous ? {} : { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { createdAt: "asc" }, take: 50, include: { replies: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } } } });
  return (
    <>
      <PageHeader title="Tickets d'assistance" subtitle={<a href={tous ? "?" : "?tous=1"} className="text-sky">{tous ? "Voir les tickets ouverts" : "Voir tous les tickets"}</a>} />
      {tickets.length === 0 ? <EmptyState title="Aucun ticket" /> : (
        <div className="space-y-4">
          {tickets.map((t) => (
            <Card key={t.id}><CardBody className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><b className="text-navy">#{t.id.slice(-6).toUpperCase()} · {t.subject}</b><div className="text-xs text-muted">{t.name} · {t.email}{t.phone ? ` · ${t.phone}` : ""} · {formatDateTime(t.createdAt)}</div></div>
                <Badge tone={t.status === "OPEN" ? "amber" : t.status === "IN_PROGRESS" ? "sky" : "green"}>{label[t.status]}</Badge>
              </div>
              <p className="whitespace-pre-line rounded-lg bg-surface p-3">{t.message}</p>
              {t.replies.map((r) => <div key={r.id} className="ml-6 rounded-lg border border-line p-3"><div className="text-xs text-muted">{r.author?.name ?? "Équipe"} · {formatDateTime(r.createdAt)}</div><p className="whitespace-pre-line">{r.body}</p></div>)}
              <ActionForm action={replyTicketAction} className="grid gap-2 md:grid-cols-[1fr_160px_auto] md:items-end" resetOnSuccess>
                <input type="hidden" name="ticketId" value={t.id} />
                <Textarea name="body" rows={2} placeholder="Réponse (envoyée par email)" />
                <Select name="status" defaultValue={t.status === "OPEN" ? "IN_PROGRESS" : t.status}>{Object.entries(label).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <SubmitButton size="md">Envoyer</SubmitButton>
              </ActionForm>
            </CardBody></Card>
          ))}
        </div>
      )}
    </>
  );
}
