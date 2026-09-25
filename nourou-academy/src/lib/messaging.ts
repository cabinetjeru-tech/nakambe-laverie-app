import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "./db";

/** Règles de messagerie : apprenant ↔ formateurs de ses formations et équipe d'assistance ; formateur ↔ ses apprenants ; équipe ↔ tous. */
export async function canMessage(from: { id: string; role: Role }, toId: string): Promise<boolean> {
  if (from.id === toId) return false;
  const to = await prisma.user.findUnique({ where: { id: toId }, select: { role: true, status: true } });
  if (!to || to.status !== "ACTIVE") return false;
  const staff = (r: Role) => r === "SUPERADMIN" || r === "ADMIN" || r === "ASSISTANT";
  if (staff(from.role) || staff(to.role)) return true;
  // Déjà en conversation (réponse possible)
  const existing = await prisma.directMessage.findFirst({ where: { fromId: toId, toId: from.id }, select: { id: true } });
  if (existing) return true;
  if (to.role === "TRAINER") {
    return !!(await prisma.enrollment.findFirst({ where: { userId: from.id, status: "ACTIVE", course: { trainerId: toId } }, select: { id: true } }));
  }
  if (from.role === "TRAINER") {
    return !!(await prisma.enrollment.findFirst({ where: { userId: toId, status: "ACTIVE", course: { trainerId: from.id } }, select: { id: true } }));
  }
  return false;
}

export async function messagingContacts(user: { id: string; role: Role }) {
  const trainers = await prisma.user.findMany({
    where: { coursesTaught: { some: { enrollments: { some: { userId: user.id, status: "ACTIVE" } } } }, status: "ACTIVE" },
    select: { id: true, name: true, role: true },
  });
  const support = await prisma.user.findFirst({ where: { role: { in: ["ASSISTANT", "ADMIN"] }, status: "ACTIVE", isDemo: false }, orderBy: { role: "asc" }, select: { id: true, name: true, role: true } })
    ?? (await prisma.user.findFirst({ where: { role: { in: ["ASSISTANT", "ADMIN", "SUPERADMIN"] }, status: "ACTIVE" }, select: { id: true, name: true, role: true } }));
  const partnerIds = await prisma.directMessage.findMany({
    where: { OR: [{ fromId: user.id }, { toId: user.id }] },
    select: { fromId: true, toId: true },
    distinct: ["fromId", "toId"],
    take: 200,
  });
  const ids = new Set(partnerIds.flatMap((p) => [p.fromId, p.toId]).filter((i) => i !== user.id));
  const partners = ids.size ? await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, role: true } }) : [];
  const all = new Map<string, { id: string; name: string; role: Role; label?: string }>();
  for (const p of partners) all.set(p.id, p);
  for (const t of trainers) all.set(t.id, { ...t, label: "Formateur" });
  if (support && support.id !== user.id) all.set(support.id, { ...support, label: "Assistance" });
  all.delete(user.id);
  return [...all.values()];
}
