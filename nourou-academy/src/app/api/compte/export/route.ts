import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

/** Portabilité : export des données personnelles de l'utilisateur (JSON). */
export const GET = handle(async () => {
  const user = await assertUser();
  if (!rateLimit(`export:${user.id}`, 3, 3600_000).ok) return jsonError(429, "Export limité à 3 fois par heure.");
  const data = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      id: true, email: true, name: true, phone: true, country: true, city: true, role: true, level: true, createdAt: true, privacyConsentAt: true, marketingConsent: true,
      enrollments: { select: { course: { select: { title: true } }, source: true, progressPercent: true, createdAt: true, completedAt: true } },
      lessonProgress: { select: { lesson: { select: { title: true } }, completed: true, videoPosition: true, updatedAt: true } },
      quizAttempts: { select: { quiz: { select: { title: true } }, percent: true, passed: true, status: true, createdAt: true } },
      submissions: { select: { assignment: { select: { title: true } }, text: true, finalScore: true, status: true, createdAt: true } },
      notes: { select: { content: true, createdAt: true } },
      certificates: { select: { code: true, courseTitle: true, issuedAt: true, status: true } },
      orders: { select: { reference: true, itemLabel: true, totalXof: true, status: true, createdAt: true, paidAt: true } },
      tutorConversations: { select: { title: true, createdAt: true, messages: { select: { role: true, content: true, createdAt: true } } } },
      reviews: { select: { course: { select: { title: true } }, rating: true, comment: true, createdAt: true } },
    },
  });
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
});
