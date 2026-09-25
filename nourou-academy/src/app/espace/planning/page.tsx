import Link from "next/link";
import { CalendarPlus, PlayCircle, Radio, Video } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { liveSessionsForUser } from "@/lib/live/access";
import { liveWindow } from "@/lib/live/jitsi";
import { formatDate, formatDateTime } from "@/lib/format";
import { registerLiveAction, unregisterLiveAction } from "@/app/actions/live";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, EmptyState, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "Planning et classes virtuelles" };

export default async function PlanningPage() {
  const user = await requireUser();
  const sessions = await liveSessionsForUser(user.id);
  const upcoming = sessions.filter((s) => !liveWindow(s).isOver && s.status !== "ENDED");
  const past = sessions.filter((s) => liveWindow(s).isOver || s.status === "ENDED").reverse();
  const byDay = new Map<string, typeof upcoming>();
  for (const s of upcoming) {
    const k = formatDate(s.startsAt, { weekday: "long", day: "numeric", month: "long" });
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  return (
    <>
      <PageHeader title="Planning et classes virtuelles" subtitle="Séances en direct de vos formations : inscrivez-vous, ajoutez-les à votre agenda et rejoignez-les en un clic." />
      {upcoming.length === 0 ? (
        <EmptyState icon={<Radio className="h-6 w-6" />} title="Aucune classe à venir" text="Les séances programmées par vos formateurs apparaîtront ici." />
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold capitalize text-muted">{day}</h2>
              <div className="space-y-3">
                {list.map((s) => {
                  const registered = s.registrations.length > 0;
                  const w = liveWindow(s);
                  return (
                    <Card key={s.id}>
                      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><Radio className="h-6 w-6" aria-hidden /></div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-navy">{s.title}</div>
                          <div className="text-sm text-muted">{formatDateTime(s.startsAt)} · {s.durationMinutes} min · {s.trainer.name}{s.course ? ` · ${s.course.title}` : ""}</div>
                          {s.status === "LIVE" && <Badge tone="red" className="mt-1">En direct</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <a href={`/api/live/${s.id}/ics`} className={buttonClass("ghost", "sm")}><CalendarPlus className="h-4 w-4" /> Agenda</a>
                          {registered ? (
                            <>
                              {w.canJoin ? (
                                <Link href={`/espace/classe/${s.id}`} className={buttonClass("secondary", "sm")}><Video className="h-4 w-4" /> Rejoindre</Link>
                              ) : (
                                <form action={unregisterLiveAction.bind(null, s.id)}><SubmitButton variant="outline" size="sm">Se désinscrire</SubmitButton></form>
                              )}
                              <Badge tone="green">Inscrit</Badge>
                            </>
                          ) : (
                            <form action={registerLiveAction.bind(null, s.id)}><SubmitButton size="sm">S'inscrire</SubmitButton></form>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold text-navy">Séances passées et replays</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {past.slice(0, 20).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="flex-1">
                  <div className="font-medium text-navy">{s.title}</div>
                  <div className="text-xs text-muted">{formatDateTime(s.startsAt)}{s.registrations[0]?.attended ? " · présent" : ""}</div>
                </div>
                {s.recordingUrl ? <Link href={`/espace/classe/${s.id}`} className={buttonClass("outline", "sm")}><PlayCircle className="h-4 w-4" /> Voir le replay</Link> : <span className="text-xs text-muted">Pas de replay</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
