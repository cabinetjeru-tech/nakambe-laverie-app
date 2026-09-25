import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Info } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { canAttendLive } from "@/lib/live/access";
import { jitsiJoinConfig, liveWindow } from "@/lib/live/jitsi";
import { formatDateTime } from "@/lib/format";
import { JitsiRoom } from "@/components/learn/jitsi-room";
import { Alert, Card, CardBody, PageHeader, buttonClass } from "@/components/ui";

export default async function LiveRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const s = await prisma.liveSession.findUnique({ where: { id }, include: { course: { select: { title: true } }, trainer: { select: { name: true } } } });
  if (!s) notFound();
  if (!(await canAttendLive(user, s))) {
    return <Alert tone="warning">Cette classe est réservée aux apprenants inscrits à la formation « {s.course?.title} ».</Alert>;
  }
  const w = liveWindow(s);
  const isHost = s.trainerId === user.id || ["SUPERADMIN", "ADMIN"].includes(user.role);

  // Présence : enregistrée automatiquement à l'entrée dans la salle pendant le créneau.
  if (w.canJoin && s.status !== "CANCELED" && !isHost) {
    await prisma.liveRegistration.upsert({
      where: { sessionId_userId: { sessionId: s.id, userId: user.id } },
      create: { sessionId: s.id, userId: user.id, attended: true, joinedAt: new Date() },
      update: { attended: true, joinedAt: new Date() },
    });
  }
  const cfg = s.provider === "jitsi" ? await jitsiJoinConfig(s.roomName, { id: user.id, name: user.name, email: user.email }, isHost) : null;

  return (
    <>
      <PageHeader title={s.title} subtitle={`${formatDateTime(s.startsAt)} · ${s.durationMinutes} min · animé par ${s.trainer.name}${s.course ? ` · ${s.course.title}` : ""}`} actions={<Link href="/espace/planning" className={buttonClass("outline")}>Retour au planning</Link>} />
      {s.status === "CANCELED" ? (
        <Alert tone="warning">Cette séance a été annulée.</Alert>
      ) : w.isOver || s.status === "ENDED" ? (
        s.recordingUrl ? (
          <Card><CardBody>
            <h2 className="font-semibold text-navy">Replay de la séance</h2>
            {/\.(mp4|webm)(\?|$)/.test(s.recordingUrl) ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video controls preload="none" className="mt-3 aspect-video w-full rounded-xl bg-black" src={s.recordingUrl} />
            ) : (
              <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md", "mt-3")}><ExternalLink className="h-4 w-4" /> Ouvrir le replay</a>
            )}
          </CardBody></Card>
        ) : (
          <Alert tone="info">Cette séance est terminée. Aucun replay n'a été publié.</Alert>
        )
      ) : !w.canJoin ? (
        <Alert tone="info">La salle ouvrira 15 minutes avant le début de la séance ({formatDateTime(s.startsAt)}).</Alert>
      ) : s.provider === "external" && s.externalUrl ? (
        <Card><CardBody>
          <p className="text-sm">Cette séance se déroule sur un service de visioconférence externe.</p>
          <a href={s.externalUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "lg", "mt-3")}><ExternalLink className="h-4 w-4" /> Rejoindre la séance</a>
        </CardBody></Card>
      ) : cfg ? (
        <div className="space-y-3">
          <JitsiRoom domain={cfg.domain} room={cfg.room} jwt={cfg.jwt} displayName={user.name} email={user.email} lowData={user.lowDataMode} />
          <p className="flex items-start gap-2 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Connexion faible ? Coupez votre caméra et utilisez le mode audio. Partage d'écran, discussion et lever la main sont disponibles dans la barre d'outils.
            <a href={cfg.url} target="_blank" rel="noopener noreferrer" className="ml-1 font-medium text-sky underline">Ouvrir dans l'application Jitsi</a>
          </p>
        </div>
      ) : null}
    </>
  );
}
