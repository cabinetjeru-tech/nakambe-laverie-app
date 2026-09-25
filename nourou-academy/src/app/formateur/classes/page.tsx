import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { createLiveAction } from "@/app/actions/trainer";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";

export const metadata = { title: "Classes virtuelles" };

export default async function TrainerLives() {
  const user = await requirePermission("trainer.access");
  const all = can(user.role, "live.manage_all");
  const [sessions, courses] = await Promise.all([
    prisma.liveSession.findMany({ where: all ? {} : { trainerId: user.id }, orderBy: { startsAt: "desc" }, take: 100, include: { course: { select: { title: true } }, _count: { select: { registrations: true } } } }),
    prisma.course.findMany({ where: all ? { status: { not: "ARCHIVED" } } : { trainerId: user.id, status: { not: "ARCHIVED" } }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  const tone = { SCHEDULED: "sky", LIVE: "red", ENDED: "gray", CANCELED: "gray" } as const;
  const label = { SCHEDULED: "Programmée", LIVE: "En direct", ENDED: "Terminée", CANCELED: "Annulée" };
  return (
    <>
      <PageHeader title="Classes virtuelles" subtitle="Programmez des séances en direct (Jitsi Meet intégré, ou lien Google Meet / Zoom). Les apprenants inscrits reçoivent des rappels." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Table>
          <thead><tr><Th>Séance</Th><Th>Date</Th><Th>Inscrits</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {sessions.length === 0 && <tr><Td colSpan={4} className="text-center text-muted">Aucune séance.</Td></tr>}
            {sessions.map((s) => (
              <tr key={s.id}>
                <Td><Link href={`/formateur/classes/${s.id}`} className="font-medium text-navy hover:text-sky">{s.title}</Link><div className="text-xs text-muted">{s.course?.title ?? "Ouverte à tous"} · {s.provider === "jitsi" ? "Jitsi" : "Lien externe"}</div></Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(s.startsAt)}</Td>
                <Td>{s._count.registrations}{s.capacity ? ` / ${s.capacity}` : ""}</Td>
                <Td><Badge tone={tone[s.status]}>{label[s.status]}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card><CardBody>
          <h2 className="mb-3 font-semibold text-navy">Programmer une séance</h2>
          <ActionForm action={createLiveAction} className="space-y-3" resetOnSuccess>
            <Field label="Titre"><Input name="title" required /></Field>
            <Field label="Formation">
              <Select name="courseId" defaultValue={courses[0]?.id ?? ""}>
                {all && <option value="">Ouverte à tous les apprenants</option>}
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date et heure (GMT)"><Input name="startsAt" type="datetime-local" required /></Field>
              <Field label="Durée (min)"><Input name="durationMinutes" type="number" min={15} max={480} defaultValue={60} /></Field>
            </div>
            <Field label="Salle">
              <Select name="provider" defaultValue="jitsi">
                <option value="jitsi">Jitsi Meet intégré (partage d'écran inclus)</option>
                <option value="external">Lien externe (Google Meet, Zoom…)</option>
              </Select>
            </Field>
            <Field label="Lien externe (si applicable)"><Input name="externalUrl" type="url" placeholder="https://meet.google.com/…" /></Field>
            <Field label="Places (0 = illimité)"><Input name="capacity" type="number" min={0} defaultValue={0} /></Field>
            <Field label="Description"><Textarea name="description" rows={3} /></Field>
            <SubmitButton>Programmer</SubmitButton>
          </ActionForm>
        </CardBody></Card>
      </div>
    </>
  );
}
