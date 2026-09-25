import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Video } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { setLiveStatusAction, toggleAttendanceAction, updateLiveRecordingAction } from "@/app/actions/trainer";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, Badge, Card, CardBody, Field, Input, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui";

export default async function TrainerLiveDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("trainer.access");
  const s = await prisma.liveSession.findUnique({ where: { id }, include: { course: { select: { title: true } }, registrations: { include: { user: { select: { name: true, email: true } } }, orderBy: { registeredAt: "asc" } } } });
  if (!s || (s.trainerId !== user.id && !can(user.role, "live.manage_all"))) notFound();
  const attended = s.registrations.filter((r) => r.attended).length;
  return (
    <>
      <PageHeader title={s.title} subtitle={`${formatDateTime(s.startsAt)} · ${s.durationMinutes} min · ${s.course?.title ?? "Ouverte à tous"}`} actions={<Link href="/formateur/classes" className={buttonClass("outline")}>← Toutes les séances</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Table>
            <thead><tr><Th>Participant</Th><Th>Inscription</Th><Th>Présence</Th></tr></thead>
            <tbody>
              {s.registrations.length === 0 && <tr><Td colSpan={3} className="text-center text-muted">Aucun inscrit.</Td></tr>}
              {s.registrations.map((r) => (
                <tr key={r.userId}>
                  <Td><div className="font-medium text-navy">{r.user.name}</div><div className="text-xs text-muted">{r.user.email}</div></Td>
                  <Td className="text-muted">{formatDateTime(r.registeredAt)}</Td>
                  <Td>
                    <form action={toggleAttendanceAction.bind(null, s.id, r.userId)}>
                      <button className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${r.attended ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {r.attended && <Check className="h-3 w-3" />}{r.attended ? "Présent" : "Absent"}
                      </button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-xs text-muted">{attended} présent(s) sur {s.registrations.length}. La présence est enregistrée automatiquement quand l'apprenant entre dans la salle ; vous pouvez la corriger ici.</p>
        </div>
        <div className="space-y-4">
          <Card><CardBody className="space-y-3">
            <div className="flex items-center justify-between"><span className="font-semibold text-navy">Séance</span><Badge tone={s.status === "LIVE" ? "red" : "sky"}>{s.status}</Badge></div>
            {s.status !== "CANCELED" && s.status !== "ENDED" && <Link href={`/espace/classe/${s.id}`} className={buttonClass("secondary", "md", "w-full")}><Video className="h-4 w-4" /> Ouvrir la salle (animateur)</Link>}
            <div className="flex flex-wrap gap-2">
              {s.status === "SCHEDULED" && <form action={setLiveStatusAction.bind(null, s.id, "LIVE")}><SubmitButton size="sm" variant="outline">Démarrer</SubmitButton></form>}
              {(s.status === "SCHEDULED" || s.status === "LIVE") && <form action={setLiveStatusAction.bind(null, s.id, "ENDED")}><SubmitButton size="sm" variant="outline">Terminer</SubmitButton></form>}
              {s.status === "SCHEDULED" && <form action={setLiveStatusAction.bind(null, s.id, "CANCELED")}><SubmitButton size="sm" variant="danger" confirm="Annuler la séance et prévenir les inscrits ?">Annuler</SubmitButton></form>}
            </div>
          </CardBody></Card>
          <Card><CardBody>
            <div className="mb-2 font-semibold text-navy">Replay</div>
            <Alert tone="info" className="mb-3 text-xs">L'enregistrement dépend du service de visioconférence (Jitsi auto-hébergé avec Jibri, JaaS, Google Meet…) et nécessite l'accord des participants. Déposez ensuite la vidéo sur votre hébergeur et collez le lien ici : il sera visible des apprenants autorisés.</Alert>
            <ActionForm action={updateLiveRecordingAction} className="space-y-2">
              <input type="hidden" name="sessionId" value={s.id} />
              <Field label="Lien du replay (https://…)"><Input name="recordingUrl" type="url" defaultValue={s.recordingUrl ?? ""} /></Field>
              <SubmitButton size="sm">Enregistrer</SubmitButton>
            </ActionForm>
          </CardBody></Card>
        </div>
      </div>
    </>
  );
}
