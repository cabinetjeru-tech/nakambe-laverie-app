import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { env } from "@/lib/env";

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(s: string) {
  return s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

/** Fichier .ics pour ajouter la séance à l'agenda du téléphone (rappel 30 min avant). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertUser();
  const { id } = await ctx.params;
  const s = await prisma.liveSession.findUnique({ where: { id } });
  if (!s) return jsonError(404, "Séance introuvable.");
  const end = new Date(s.startsAt.getTime() + s.durationMinutes * 60_000);
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nourou Global Academy//FR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${s.id}@nourou-academy`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(s.startsAt)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(s.title)}`, `DESCRIPTION:${esc((s.description ?? "") + `\n${env.appUrl}/espace/classe/${s.id}`)}`, `URL:${env.appUrl}/espace/classe/${s.id}`,
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Classe virtuelle dans 30 minutes", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="classe-${s.id}.ics"` } });
});
