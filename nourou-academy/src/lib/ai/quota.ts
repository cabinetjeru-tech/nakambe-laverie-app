import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "../db";
import { getAiSettings } from "../settings";

/** Journalise la consommation (jamais le contenu des échanges). */
export async function recordUsage(u: {
  userId: string | null;
  feature: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  success: boolean;
}) {
  try {
    await prisma.aiUsage.create({
      data: {
        userId: u.userId,
        feature: u.feature,
        provider: u.provider,
        model: u.model,
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        units: u.units ?? 0,
        success: u.success,
      },
    });
  } catch (e) {
    console.error("[ai] journalisation de l'usage impossible", (e as Error).message);
  }
}

function startOfDay() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Vérifie les quotas avant un appel IA : quota quotidien par utilisateur
 * et budget mensuel global de tokens (maîtrise des coûts).
 */
export async function checkQuota(user: { id: string; role: Role }, feature: "TUTOR" | "GENERATOR" | "GRADING" | "STT" | "TTS") {
  const s = await getAiSettings();
  if (s.monthlyTokenBudget > 0) {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const agg = await prisma.aiUsage.aggregate({
      where: { createdAt: { gte: start } },
      _sum: { inputTokens: true, outputTokens: true },
    });
    const used = (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
    if (used >= s.monthlyTokenBudget) {
      return { ok: false as const, message: "Le budget IA mensuel de la plateforme est atteint. Réessayez le mois prochain ou contactez l'administration." };
    }
  }
  if (user.role === "SUPERADMIN" || user.role === "ADMIN") return { ok: true as const, remaining: Infinity };
  const limit = feature === "GENERATOR" ? s.trainerDailyGenerations : s.learnerDailyMessages;
  if (limit <= 0) return { ok: true as const, remaining: Infinity };
  const features = feature === "GENERATOR" ? ["GENERATOR"] : ["TUTOR", "VISION", "STT", "TTS"];
  const count = await prisma.aiUsage.count({ where: { userId: user.id, feature: { in: features }, createdAt: { gte: startOfDay() } } });
  if (count >= limit) {
    return { ok: false as const, message: `Quota quotidien atteint (${limit} requêtes IA par jour). Il sera renouvelé demain.` };
  }
  return { ok: true as const, remaining: limit - count };
}
