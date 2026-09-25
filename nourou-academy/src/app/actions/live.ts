"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { canAttendLive } from "@/lib/live/access";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/format";

export async function registerLiveAction(sessionId: string) {
  const user = await requireUser();
  const s = await prisma.liveSession.findUnique({ where: { id: sessionId }, include: { _count: { select: { registrations: true } } } });
  if (!s || s.status === "CANCELED" || !(await canAttendLive(user, s))) return;
  if (s.capacity && s._count.registrations >= s.capacity) return;
  await prisma.liveRegistration.upsert({ where: { sessionId_userId: { sessionId, userId: user.id } }, create: { sessionId, userId: user.id }, update: {} });
  await notify(user.id, { type: "LIVE", title: "Inscription confirmée", body: `Vous êtes inscrit à « ${s.title} » le ${formatDateTime(s.startsAt)}. Un rappel vous sera envoyé avant la séance.`, link: `/espace/classe/${s.id}` });
  revalidatePath("/espace/planning");
}

export async function unregisterLiveAction(sessionId: string) {
  const user = await requireUser();
  await prisma.liveRegistration.deleteMany({ where: { sessionId, userId: user.id, attended: false } });
  revalidatePath("/espace/planning");
}
