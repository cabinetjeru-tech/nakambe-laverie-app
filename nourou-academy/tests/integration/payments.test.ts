/**
 * Intégration base de données : commande → attribution des droits → facture, idempotence,
 * coupon à 100 %, et délivrance du certificat selon les critères.
 *   RUN_DB_TESTS=1 npx vitest run tests/integration
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const run = !!process.env.RUN_DB_TESTS;
process.env.PAYMENT_DEMO_ENABLED = "true";

describe.skipIf(!run)("paiements et droits d'accès", () => {
  let userId = "";
  let courseId = "";
  const email = `test-${Date.now()}@test.local`;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email, name: "Test Intégration", passwordHash: "x" } });
    userId = u.id;
    courseId = (await prisma.course.findUniqueOrThrow({ where: { slug: "excel-gestion-quotidienne" } })).id;
  });
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.coupon.deleteMany({ where: { code: "TEST100" } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("paiement démo : aucun accès avant confirmation, accès + facture après, idempotent", async () => {
    const { startCheckout, fulfillOrder } = await import("@/lib/payments/checkout");
    const { courseAccess } = await import("@/lib/access");
    const res = await startCheckout({ user: { id: userId, name: "T", email, phone: null }, item: { type: "COURSE", id: courseId }, providerId: "demo" });
    expect(res.redirectUrl).toMatch(/^\/paiement\/demo\//);
    const order = await prisma.order.findFirstOrThrow({ where: { userId, status: "PENDING" } });
    expect(order.mode).toBe("DEMO");
    expect(order.totalXof).toBe(15000);
    expect(await courseAccess({ id: userId, role: "LEARNER" }, courseId)).toBe("none");

    await fulfillOrder(order.id, { mode: "DEMO" });
    await fulfillOrder(order.id, { mode: "DEMO" }); // second appel (webhook rejoué) sans effet
    expect(await courseAccess({ id: userId, role: "LEARNER" }, courseId)).toBe("enrollment");
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
    expect((await prisma.invoice.findFirstOrThrow({ where: { orderId: order.id } })).number).toMatch(/^DEMO-/);
  });

  it("coupon de 100 % : accès sans paiement, compteur d'utilisation incrémenté", async () => {
    const { startCheckout } = await import("@/lib/payments/checkout");
    const micro = await prisma.course.findUniqueOrThrow({ where: { slug: "creer-gerer-micro-entreprise" } });
    const coupon = await prisma.coupon.create({ data: { code: "TEST100", type: "PERCENT", value: 100 } });
    const res = await startCheckout({ user: { id: userId, name: "T", email, phone: null }, item: { type: "COURSE", id: micro.id }, couponCode: "test100", providerId: "none" });
    expect(res.redirectUrl).toMatch(/^\/paiement\/NGA/);
    expect((await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: micro.id } } }))?.status).toBe("ACTIVE");
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);
  });

  it("refuse un prestataire désactivé", async () => {
    const { startCheckout } = await import("@/lib/payments/checkout");
    const plan = await prisma.plan.findFirstOrThrow();
    await expect(startCheckout({ user: { id: userId, name: "T", email, phone: null }, item: { type: "PLAN", id: plan.id }, providerId: "cinetpay" })).rejects.toThrow();
  });

  it("certificat délivré uniquement quand les critères sont atteints", async () => {
    const { evaluateCertificate } = await import("@/lib/certificates/issue");
    const { saveLessonProgress } = await import("@/lib/learning/progress");
    const quiz = await prisma.quiz.findFirstOrThrow({ where: { courseId } });
    expect(await evaluateCertificate(userId, courseId)).toBeNull();
    const lessons = await prisma.lesson.findMany({ where: { module: { courseId } } });
    for (const l of lessons) await saveLessonProgress(userId, l.id, { completed: true });
    // Pas d'examen final dans cette formation : progression 100 % suffit.
    expect(quiz.isFinalExam).toBe(false);
    const cert = await evaluateCertificate(userId, courseId);
    expect(cert?.status).toBe("VALID");
    expect(cert?.code).toMatch(/^NGA-\d{4}-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  });
});
