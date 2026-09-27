import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { notify } from "./notify";
import { getEngagementSettings, type EngagementSettings } from "./settings";
import { fillNudgeTemplate } from "./engagement-template";

const DAY = 24 * 3600_000;

/**
 * Inscriptions à relancer : formation publiée non terminée, apprenant actif, sans activité depuis N jours,
 * dernière relance plus ancienne que N jours, et moins de `nudgeMax` relances depuis sa dernière reprise.
 */
function candidatesWhere(s: EngagementSettings): Prisma.EnrollmentWhereInput {
  const cutoff = new Date(Date.now() - s.nudgeAfterDays * DAY);
  return {
    status: "ACTIVE",
    completedAt: null,
    progressPercent: { lt: 100 },
    user: { role: "LEARNER", status: "ACTIVE" },
    course: { status: "PUBLISHED" },
    OR: [{ lastAccessedAt: { lt: cutoff } }, { lastAccessedAt: null, createdAt: { lt: cutoff } }],
    AND: [{ OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: cutoff } }] }],
  };
}

async function pickCandidates(s: EngagementSettings, take: number) {
  const rows = await prisma.enrollment.findMany({
    where: candidatesWhere(s),
    orderBy: { progressPercent: "desc" },
    take: take * 3,
    select: { id: true, userId: true, progressPercent: true, nudgeCount: true, lastNudgeAt: true, lastAccessedAt: true, user: { select: { name: true } }, course: { select: { title: true, slug: true } } },
  });
  // Compteur remis à zéro si l'apprenant est revenu depuis la dernière relance ; une seule relance par apprenant et par passage.
  const seen = new Set<string>();
  const out: (typeof rows[number] & { count: number })[] = [];
  for (const r of rows) {
    const count = r.lastNudgeAt && r.lastAccessedAt && r.lastAccessedAt > r.lastNudgeAt ? 0 : r.nudgeCount;
    if (count >= s.nudgeMax || seen.has(r.userId)) continue;
    seen.add(r.userId);
    out.push({ ...r, count });
    if (out.length >= take) break;
  }
  return out;
}

/** Nombre d'apprenants qui seraient relancés au prochain passage (aperçu pour l'administration). */
export async function countNudgeCandidates() {
  const s = await getEngagementSettings();
  return (await pickCandidates(s, 5000)).length;
}

/** Envoie les relances (notification dans l'espace apprenant + email si configuré). */
export async function runNudges({ force = false, limit = 200 } = {}) {
  const s = await getEngagementSettings();
  if (!s.nudgeEnabled && !force) return 0;
  const list = await pickCandidates(s, limit);
  for (const r of list) {
    const vars = { name: r.user.name, course: r.course.title, progress: r.progressPercent };
    await notify(r.userId, { type: "NUDGE", title: fillNudgeTemplate(s.nudgeTitle, vars), body: fillNudgeTemplate(s.nudgeBody, vars), link: `/espace/apprendre/${r.course.slug}`, email: true });
    await prisma.enrollment.update({ where: { id: r.id }, data: { nudgeCount: r.count + 1, lastNudgeAt: new Date() } });
  }
  return list.length;
}
