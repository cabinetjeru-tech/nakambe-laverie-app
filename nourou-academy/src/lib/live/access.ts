import "server-only";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db";
import { courseAccess } from "../access";

/** Un apprenant peut rejoindre une classe s'il a accès à la formation liée (ou si la classe est ouverte à tous). */
export async function canAttendLive(user: SessionUser, session: { courseId: string | null; trainerId: string }) {
  if (session.trainerId === user.id) return true;
  if (["SUPERADMIN", "ADMIN", "ASSISTANT"].includes(user.role)) return true;
  if (!session.courseId) return true;
  return (await courseAccess(user, session.courseId)) !== "none";
}

export async function liveSessionsForUser(userId: string) {
  return prisma.liveSession.findMany({
    where: {
      status: { not: "CANCELED" },
      OR: [
        { registrations: { some: { userId } } },
        { course: { enrollments: { some: { userId, status: "ACTIVE" } } } },
        { courseId: null },
      ],
    },
    orderBy: { startsAt: "asc" },
    include: { course: { select: { title: true, slug: true } }, trainer: { select: { name: true } }, registrations: { where: { userId } } },
  });
}
