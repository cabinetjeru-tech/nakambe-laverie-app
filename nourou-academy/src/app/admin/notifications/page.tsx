import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { broadcastAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardBody, Checkbox, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";

export const metadata = { title: "Notifications" };

export default async function BroadcastPage() {
  await requirePermission("notifications.broadcast");
  const [courses, outbox] = await Promise.all([
    prisma.course.findMany({ where: { status: "PUBLISHED" }, select: { id: true, title: true } }),
    prisma.emailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <>
      <PageHeader title="Notifications et emails" subtitle="Annonces in-app (et email facultatif) ; suivi de la file d'envoi des emails." />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card><CardBody>
          <ActionForm action={broadcastAction} className="space-y-3" resetOnSuccess>
            <Field label="Destinataires">
              <Select name="audience" defaultValue="all">
                <option value="all">Tous les utilisateurs actifs</option>
                <option value="marketing">Ayant accepté les communications</option>
                <option value="subscribers">Abonnés actifs</option>
                <option value="trainers">Formateurs</option>
                <option value="course">Inscrits à une formation…</option>
              </Select>
            </Field>
            <Field label="Formation (si « inscrits à une formation »)"><Select name="courseId" defaultValue=""><option value="">—</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
            <Field label="Titre"><Input name="title" required maxLength={150} /></Field>
            <Field label="Message"><Textarea name="body" rows={4} required maxLength={2000} /></Field>
            <Field label="Lien (facultatif)"><Input name="link" placeholder="/formations/…" /></Field>
            <Checkbox name="email" label="Envoyer aussi par email" />
            <SubmitButton confirm="Envoyer cette notification ?">Envoyer</SubmitButton>
          </ActionForm>
        </CardBody></Card>
        <div>
          <h2 className="mb-3 font-semibold text-navy">File d'envoi des emails (20 derniers)</h2>
          <Table>
            <thead><tr><Th>Destinataire</Th><Th>Objet</Th><Th>Statut</Th><Th>Date</Th></tr></thead>
            <tbody>{outbox.map((m) => <tr key={m.id}><Td className="text-xs">{m.to}</Td><Td className="text-sm">{m.subject}</Td><Td className="text-xs">{m.status}{m.error ? ` — ${m.error}` : ""}</Td><Td className="text-xs text-muted">{formatDateTime(m.createdAt)}</Td></tr>)}</tbody>
          </Table>
        </div>
      </div>
    </>
  );
}
