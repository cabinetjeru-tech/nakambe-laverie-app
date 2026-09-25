"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { queueEmail, renderEmail } from "@/lib/mail";
import { env } from "@/lib/env";
import { slugify } from "@/lib/format";
import { verifyOrder } from "@/lib/payments/checkout";
import {
  getAiSettings, getBrand, getPaymentSettings, getTechnicalSettings, saveGroup, setSecret, getSecret, type SecretKey,
} from "@/lib/settings";
import { emailSchema, formBool, formInt, formLines, formString, nameSchema, zodErrors, type ActionState } from "@/lib/validation";

// ───────────────────────────── Utilisateurs & rôles ─────────────────────────────

const ROLES: Role[] = ["SUPERADMIN", "ADMIN", "TRAINER", "ASSISTANT", "LEARNER"];

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("users.manage");
  const parsed = z.object({ name: nameSchema, email: emailSchema, role: z.enum(ROLES as [Role, ...Role[]]) }).safeParse({
    name: formString(fd, "name"),
    email: formString(fd, "email"),
    role: formString(fd, "role") || "LEARNER",
  });
  if (!parsed.success) return zodErrors(parsed.error);
  if ((parsed.data.role === "ADMIN" || parsed.data.role === "SUPERADMIN") && admin.role !== "SUPERADMIN") return { error: "Seul un super-administrateur peut créer un administrateur." };
  if (await prisma.user.findUnique({ where: { email: parsed.data.email } })) return { error: "Un compte existe déjà avec cet email." };
  const user = await prisma.user.create({ data: { ...parsed.data, passwordHash: await hashPassword(randomToken(24)) } });
  // Lien d'activation : l'utilisateur choisit lui-même son mot de passe (valable 72 h).
  const token = randomToken(32);
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 72 * 3600_000) } });
  const brand = await getBrand();
  const link = `${env.appUrl}/reinitialiser/${token}`;
  await queueEmail(user.email, `Votre compte ${brand.name}`, await renderEmail(`Bienvenue, ${user.name}`, [`Un compte a été créé pour vous sur ${brand.name}.`, "Cliquez sur le bouton pour choisir votre mot de passe (lien valable 72 heures)."], { label: "Activer mon compte", href: link }));
  await audit(admin.id, "user.create", "User", user.id, { role: user.role });
  revalidatePath("/admin/utilisateurs");
  return { ok: true, message: `Compte créé. Lien d'activation envoyé par email${env.isProduction ? "" : ` (développement : ${link})`}.` };
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("users.manage");
  const userId = formString(fd, "userId");
  const role = formString(fd, "role") as Role;
  const status = formString(fd, "status") as "ACTIVE" | "SUSPENDED";
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!ROLES.includes(role) || !["ACTIVE", "SUSPENDED"].includes(status)) return { error: "Valeurs invalides." };
  if (target.id === admin.id && (role !== target.role || status !== "ACTIVE")) return { error: "Vous ne pouvez pas modifier votre propre rôle ou statut." };
  const privileged = (r: Role) => r === "ADMIN" || r === "SUPERADMIN";
  if ((privileged(role) || privileged(target.role)) && admin.role !== "SUPERADMIN" && role !== target.role) {
    return { error: "Seul un super-administrateur peut attribuer ou retirer un rôle d'administration." };
  }
  if (target.role === "SUPERADMIN" && admin.role !== "SUPERADMIN") return { error: "Action réservée au super-administrateur." };
  await prisma.user.update({ where: { id: userId }, data: { role, status } });
  if (status === "SUSPENDED") await prisma.session.deleteMany({ where: { userId } });
  await audit(admin.id, "user.update", "User", userId, { role, status, previousRole: target.role, previousStatus: target.status });
  revalidatePath("/admin/utilisateurs");
  return { ok: true, message: "Utilisateur mis à jour." };
}

export async function grantAccessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("users.manage");
  const userId = formString(fd, "userId");
  const courseId = formString(fd, "courseId");
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Formation introuvable." };
  await prisma.enrollment.upsert({ where: { userId_courseId: { userId, courseId } }, create: { userId, courseId, source: "ADMIN" }, update: { status: "ACTIVE" } });
  await notify(userId, { type: "ACCESS", title: "Nouvel accès", body: `Vous avez maintenant accès à « ${course.title} ».`, link: `/espace/apprendre/${course.slug}` });
  await audit(admin.id, "enrollment.grant", "Enrollment", null, { userId, courseId });
  revalidatePath(`/admin/utilisateurs/${userId}`);
  return { ok: true, message: "Accès attribué." };
}

export async function revokeAccessAction(enrollmentId: string) {
  const admin = await requirePermission("users.manage");
  const e = await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: "REVOKED" } });
  await audit(admin.id, "enrollment.revoke", "Enrollment", enrollmentId);
  revalidatePath(`/admin/utilisateurs/${e.userId}`);
}

// ───────────────────────────── Formations ─────────────────────────────

export async function reviewCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("courses.review");
  const courseId = formString(fd, "courseId");
  const decision = formString(fd, "decision");
  const note = formString(fd, "note").trim().slice(0, 2000);
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  if (decision === "approve") {
    await prisma.course.update({ where: { id: courseId }, data: { status: "PUBLISHED", publishedAt: course.publishedAt ?? new Date(), reviewNote: note || null } });
    await notify(course.trainerId, { type: "REVIEW", title: "Formation publiée", body: `« ${course.title} » est maintenant en ligne.`, link: `/formateur/formations/${courseId}`, email: true });
  } else if (decision === "reject") {
    if (!note) return { error: "Indiquez au formateur les corrections attendues." };
    await prisma.course.update({ where: { id: courseId }, data: { status: "REJECTED", reviewNote: note } });
    await notify(course.trainerId, { type: "REVIEW", title: "Formation à corriger", body: `« ${course.title} » : ${note}`, link: `/formateur/formations/${courseId}?onglet=publication`, email: true });
  } else if (decision === "unpublish") {
    await prisma.course.update({ where: { id: courseId }, data: { status: "DRAFT", reviewNote: note || null } });
  } else if (decision === "archive") {
    await prisma.course.update({ where: { id: courseId }, data: { status: "ARCHIVED" } });
  } else return { error: "Décision inconnue." };
  await audit(admin.id, `course.${decision}`, "Course", courseId, { note });
  revalidatePath("/admin/formations");
  return { ok: true, message: "Décision enregistrée." };
}

export async function toggleFeaturedAction(courseId: string) {
  const admin = await requirePermission("courses.manage_all");
  const c = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  await prisma.course.update({ where: { id: courseId }, data: { featured: !c.featured } });
  await audit(admin.id, "course.featured", "Course", courseId, { featured: !c.featured });
  revalidatePath("/admin/formations");
}

export async function saveCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("categories.manage");
  const id = formString(fd, "id");
  const name = formString(fd, "name").trim();
  if (name.length < 2) return { error: "Nom requis." };
  const data = { name, description: formString(fd, "description").slice(0, 300) || null, icon: formString(fd, "icon") || null, position: formInt(fd, "position") };
  if (id) await prisma.category.update({ where: { id }, data });
  else await prisma.category.create({ data: { ...data, slug: slugify(name) } });
  await audit(admin.id, id ? "category.update" : "category.create", "Category", id || null, { name });
  revalidatePath("/admin/categories");
  return { ok: true, message: "Catégorie enregistrée." };
}

export async function deleteCategoryAction(id: string) {
  const admin = await requirePermission("categories.manage");
  await prisma.category.delete({ where: { id } });
  await audit(admin.id, "category.delete", "Category", id);
  revalidatePath("/admin/categories");
}

// ───────────────────────────── Finances ─────────────────────────────

export async function reverifyOrderAction(reference: string) {
  const admin = await requirePermission("finance.manage");
  await verifyOrder(reference, `admin:${admin.id}`);
  await audit(admin.id, "order.reverify", "Order", reference);
  revalidatePath("/admin/transactions");
}

export async function cancelOrderAction(orderId: string) {
  const admin = await requirePermission("finance.manage");
  await prisma.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "CANCELED" } });
  await audit(admin.id, "order.cancel", "Order", orderId);
  revalidatePath("/admin/transactions");
}

/**
 * Traitement d'une demande de remboursement. Le remboursement financier lui-même doit être
 * effectué depuis le tableau de bord du prestataire ; ici on enregistre la décision et on retire l'accès.
 */
export async function processRefundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("finance.manage");
  const refund = await prisma.refund.findUniqueOrThrow({ where: { id: formString(fd, "refundId") }, include: { order: { include: { pack: { include: { courses: true } } } } } });
  if (refund.status !== "REQUESTED") return { error: "Demande déjà traitée." };
  const approve = formString(fd, "decision") === "approve";
  const note = formString(fd, "note").slice(0, 1000) || null;
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: refund.id }, data: { status: approve ? "APPROVED" : "REJECTED", adminNote: note, processedById: admin.id, processedAt: new Date() } });
    if (approve) {
      await tx.order.update({ where: { id: refund.orderId }, data: { status: "REFUNDED" } });
      const o = refund.order;
      if (o.itemType === "COURSE" && o.courseId) await tx.enrollment.updateMany({ where: { userId: o.userId, courseId: o.courseId, orderId: o.id }, data: { status: "REVOKED" } });
      if (o.itemType === "PACK" && o.pack) await tx.enrollment.updateMany({ where: { userId: o.userId, orderId: o.id }, data: { status: "REVOKED" } });
      if (o.itemType === "PLAN") await tx.subscription.updateMany({ where: { orderId: o.id }, data: { status: "CANCELED" } });
    }
  });
  await notify(refund.order.userId, {
    type: "PAYMENT",
    title: approve ? "Remboursement accepté" : "Remboursement refusé",
    body: approve ? `Votre demande pour « ${refund.order.itemLabel} » est acceptée. Le remboursement est effectué via le moyen de paiement utilisé.` : `Votre demande pour « ${refund.order.itemLabel} » n'a pas été acceptée.${note ? ` Motif : ${note}` : ""}`,
    link: "/espace/paiements",
    email: true,
  });
  await audit(admin.id, approve ? "refund.approve" : "refund.reject", "Refund", refund.id, { amount: refund.amountXof });
  revalidatePath("/admin/transactions");
  return { ok: true, message: approve ? "Remboursement accepté : pensez à rembourser le client depuis le tableau de bord du prestataire." : "Demande refusée." };
}

export async function savePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("finance.manage");
  const id = formString(fd, "id");
  const parsed = z.object({
    name: z.string().trim().min(2).max(80),
    code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, "Code : minuscules, chiffres et tirets."),
    interval: z.enum(["MONTH", "QUARTER", "YEAR"]),
    priceXof: z.number().int().min(100).max(10_000_000),
  }).safeParse({ name: formString(fd, "name"), code: formString(fd, "code"), interval: formString(fd, "interval"), priceXof: formInt(fd, "priceXof") });
  if (!parsed.success) return zodErrors(parsed.error);
  const data = { ...parsed.data, description: formString(fd, "description") || null, features: formLines(fd, "features"), active: formBool(fd, "active"), position: formInt(fd, "position") };
  if (id) await prisma.plan.update({ where: { id }, data });
  else await prisma.plan.create({ data });
  await audit(admin.id, id ? "plan.update" : "plan.create", "Plan", id || null, { price: data.priceXof });
  revalidatePath("/admin/offres");
  return { ok: true, message: "Formule enregistrée." };
}

export async function savePackAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("finance.manage");
  const id = formString(fd, "id");
  const title = formString(fd, "title").trim();
  const courseIds = fd.getAll("courseIds").map(String).filter(Boolean);
  if (title.length < 3 || courseIds.length < 2) return { error: "Titre et au moins deux formations requis." };
  const data = { title, description: formString(fd, "description"), priceXof: Math.max(0, formInt(fd, "priceXof")), active: formBool(fd, "active") };
  if (id) {
    await prisma.$transaction([
      prisma.pack.update({ where: { id }, data }),
      prisma.packCourse.deleteMany({ where: { packId: id } }),
      prisma.packCourse.createMany({ data: courseIds.map((courseId) => ({ packId: id, courseId })) }),
    ]);
  } else {
    await prisma.pack.create({ data: { ...data, slug: `${slugify(title)}-${randomToken(3).toLowerCase()}`, courses: { create: courseIds.map((courseId) => ({ courseId })) } } });
  }
  await audit(admin.id, id ? "pack.update" : "pack.create", "Pack", id || null);
  revalidatePath("/admin/offres");
  return { ok: true, message: "Pack enregistré." };
}

export async function saveCouponAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("coupons.manage");
  const id = formString(fd, "id");
  const parsed = z.object({
    code: z.string().trim().toUpperCase().min(3).max(30).regex(/^[A-Z0-9_-]+$/, "Code : lettres, chiffres, - et _"),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.number().int().min(1),
  }).safeParse({ code: formString(fd, "code"), type: formString(fd, "type"), value: formInt(fd, "value") });
  if (!parsed.success) return zodErrors(parsed.error);
  if (parsed.data.type === "PERCENT" && parsed.data.value > 100) return { error: "Pourcentage maximum : 100." };
  const date = (k: string) => (formString(fd, k) ? new Date(`${formString(fd, k)}T00:00:00Z`) : null);
  const data = {
    ...parsed.data,
    description: formString(fd, "description") || null,
    maxUses: formString(fd, "maxUses") ? formInt(fd, "maxUses") : null,
    perUserLimit: Math.max(0, formInt(fd, "perUserLimit", 1)),
    minAmountXof: Math.max(0, formInt(fd, "minAmountXof")),
    courseId: formString(fd, "courseId") || null,
    validFrom: date("validFrom"),
    validUntil: date("validUntil"),
    active: formBool(fd, "active"),
  };
  try {
    if (id) await prisma.coupon.update({ where: { id }, data });
    else await prisma.coupon.create({ data });
  } catch {
    return { error: "Ce code existe déjà." };
  }
  await audit(admin.id, id ? "coupon.update" : "coupon.create", "Coupon", id || null, { code: data.code });
  revalidatePath("/admin/coupons");
  return { ok: true, message: "Code enregistré." };
}

// ───────────────────────────── Certificats, avis, tickets, modération ─────────────────────────────

export async function certificateDecisionAction(certId: string, decision: "approve" | "revoke") {
  const admin = await requirePermission("certificates.manage");
  const c = await prisma.certificate.findUniqueOrThrow({ where: { id: certId } });
  await prisma.certificate.update({
    where: { id: certId },
    data: decision === "approve" ? { status: "VALID", issuedAt: new Date() } : { status: "REVOKED", revokedAt: new Date() },
  });
  await notify(c.userId, {
    type: "CERTIFICATE",
    title: decision === "approve" ? "Votre certificat est disponible" : "Certificat révoqué",
    body: decision === "approve" ? `Le certificat de « ${c.courseTitle} » a été validé.` : `Le certificat de « ${c.courseTitle} » a été révoqué. Contactez l'assistance pour plus d'informations.`,
    link: "/espace/certificats",
    email: true,
  });
  await audit(admin.id, `certificate.${decision}`, "Certificate", certId);
  revalidatePath("/admin/certificats");
}

export async function reviewModerationAction(reviewId: string, decision: "APPROVED" | "REJECTED" | "FEATURE") {
  const admin = await requirePermission("reviews.moderate");
  if (decision === "FEATURE") {
    const r = await prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
    await prisma.review.update({ where: { id: reviewId }, data: { featured: !r.featured, status: "APPROVED" } });
  } else await prisma.review.update({ where: { id: reviewId }, data: { status: decision } });
  await audit(admin.id, `review.${decision.toLowerCase()}`, "Review", reviewId);
  revalidatePath("/admin/avis");
}

export async function replyTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("tickets.manage");
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: formString(fd, "ticketId") } });
  const body = formString(fd, "body").trim();
  const status = formString(fd, "status") as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  if (body) {
    await prisma.ticketReply.create({ data: { ticketId: ticket.id, authorId: admin.id, body: body.slice(0, 5000), isStaff: true } });
    await queueEmail(ticket.email, `Re : ${ticket.subject} (#${ticket.id.slice(-6).toUpperCase()})`, await renderEmail(`Réponse à votre demande`, [`Bonjour ${ticket.name},`, body]));
    if (ticket.userId) await notify(ticket.userId, { type: "SUPPORT", title: "Réponse de l'assistance", body: body.slice(0, 140) });
  }
  if (["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)) await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status } });
  revalidatePath("/admin/tickets");
  return { ok: true, message: body ? "Réponse envoyée." : "Statut mis à jour." };
}

export async function resolveReportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("reviews.moderate");
  const report = await prisma.report.findUniqueOrThrow({ where: { id: formString(fd, "reportId") } });
  const decision = formString(fd, "decision") === "remove" ? "APPROVED" : "REJECTED";
  if (decision === "APPROVED" && report.targetType === "REVIEW") await prisma.review.updateMany({ where: { id: report.targetId }, data: { status: "REJECTED" } });
  if (decision === "APPROVED" && report.targetType === "MESSAGE") await prisma.directMessage.deleteMany({ where: { id: report.targetId } });
  await prisma.report.update({ where: { id: report.id }, data: { status: decision, resolution: formString(fd, "resolution").slice(0, 1000) || null } });
  await audit(admin.id, "report.resolve", "Report", report.id, { decision });
  revalidatePath("/admin/moderation");
  return { ok: true, message: "Signalement traité." };
}

// ───────────────────────────── Notifications & contenus ─────────────────────────────

export async function broadcastAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("notifications.broadcast");
  const title = formString(fd, "title").trim();
  const body = formString(fd, "body").trim();
  if (title.length < 3 || body.length < 5) return { error: "Titre et message requis." };
  const audience = formString(fd, "audience");
  const courseId = formString(fd, "courseId");
  const where =
    audience === "course" && courseId
      ? { enrollments: { some: { courseId, status: "ACTIVE" as const } } }
      : audience === "trainers"
        ? { role: "TRAINER" as const }
        : audience === "subscribers"
          ? { subscriptions: { some: { status: "ACTIVE" as const, endsAt: { gt: new Date() } } } }
          : audience === "marketing"
            ? { marketingConsent: true }
            : {};
  const users = await prisma.user.findMany({ where: { ...where, status: "ACTIVE" }, select: { id: true } });
  const email = formBool(fd, "email");
  for (const u of users) await notify(u.id, { type: "ANNOUNCEMENT", title: title.slice(0, 150), body: body.slice(0, 2000), link: formString(fd, "link") || undefined, email });
  await audit(admin.id, "notification.broadcast", "Notification", null, { audience, count: users.length, email });
  return { ok: true, message: `Notification envoyée à ${users.length} utilisateur(s).` };
}

export async function savePostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("content.manage");
  const id = formString(fd, "id");
  const title = formString(fd, "title").trim();
  if (title.length < 5) return { error: "Titre trop court." };
  const published = formBool(fd, "published");
  const resourceUrl = formString(fd, "resourceUrl").trim();
  if (resourceUrl && !/^(https:\/\/|\/)/.test(resourceUrl)) return { error: "Lien de ressource invalide." };
  const data = {
    title,
    excerpt: formString(fd, "excerpt").slice(0, 400),
    content: formString(fd, "content").slice(0, 100_000),
    kind: formString(fd, "kind") === "RESOURCE" ? "RESOURCE" : "ARTICLE",
    resourceUrl: resourceUrl || null,
    published,
  };
  if (id) {
    const before = await prisma.blogPost.findUniqueOrThrow({ where: { id } });
    await prisma.blogPost.update({ where: { id }, data: { ...data, publishedAt: published ? (before.publishedAt ?? new Date()) : null } });
  } else {
    let slug = slugify(title);
    if (await prisma.blogPost.findUnique({ where: { slug } })) slug = `${slug}-${randomToken(3).toLowerCase()}`;
    await prisma.blogPost.create({ data: { ...data, slug, authorId: admin.id, publishedAt: published ? new Date() : null } });
  }
  revalidatePath("/admin/contenus");
  return { ok: true, message: "Publication enregistrée." };
}

export async function deletePostAction(id: string) {
  await requirePermission("content.manage");
  await prisma.blogPost.delete({ where: { id } });
  revalidatePath("/admin/contenus");
}

export async function saveFaqAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("content.manage");
  const id = formString(fd, "id");
  const data = { question: formString(fd, "question").trim(), answer: formString(fd, "answer").trim(), category: formString(fd, "category").trim() || "Général", position: formInt(fd, "position") };
  if (data.question.length < 5 || data.answer.length < 5) return { error: "Question et réponse requises." };
  if (id) await prisma.faq.update({ where: { id }, data });
  else await prisma.faq.create({ data });
  revalidatePath("/admin/contenus");
  return { ok: true, message: "Question enregistrée." };
}

export async function deleteFaqAction(id: string) {
  await requirePermission("content.manage");
  await prisma.faq.delete({ where: { id } });
  revalidatePath("/admin/contenus");
}

// ───────────────────────────── Paramètres ─────────────────────────────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB");

export async function saveBrandAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("settings.manage");
  const current = await getBrand();
  const parsed = z.object({ primaryColor: hex, secondaryColor: hex, accentColor: hex, name: z.string().trim().min(2).max(80), email: emailSchema }).safeParse({
    primaryColor: formString(fd, "primaryColor"),
    secondaryColor: formString(fd, "secondaryColor"),
    accentColor: formString(fd, "accentColor"),
    name: formString(fd, "name"),
    email: formString(fd, "email"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const logoUrl = formString(fd, "logoUrl").trim();
  if (logoUrl && !/^(\/api\/files\/[\w-]+|https:\/\/)/.test(logoUrl)) return { error: "URL du logo invalide." };
  const keys = ["shortName", "slogan", "promoter", "phone", "whatsapp", "address", "facebook", "linkedin", "youtube", "certificateSignatory", "certificateSignatoryTitle", "tutorName"] as const;
  const next = { ...current, ...parsed.data, logoUrl: logoUrl || null };
  for (const k of keys) next[k] = formString(fd, k).trim().slice(0, 300) || current[k];
  await saveGroup("brand", next);
  await audit(admin.id, "settings.brand", "Setting", "brand");
  revalidatePath("/", "layout");
  return { ok: true, message: "Identité de la plateforme enregistrée." };
}

async function saveSecretsFrom(fd: FormData, keys: SecretKey[]) {
  const changed: string[] = [];
  for (const k of keys) {
    const field = `secret:${k}`;
    if (formBool(fd, `clear:${k}`)) {
      await setSecret(k, null);
      changed.push(`${k} (supprimée)`);
    } else {
      const v = formString(fd, field).trim();
      if (v) {
        await setSecret(k, v);
        changed.push(k);
      }
    }
  }
  return changed;
}

export async function saveAiSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("settings.manage");
  const current = await getAiSettings();
  const provider = formString(fd, "provider") === "openai" ? "openai" : "anthropic";
  const effort = (["low", "medium", "high"] as const).find((e) => e === formString(fd, "anthropicEffort")) ?? current.anthropicEffort;
  const s = {
    ...current,
    provider,
    anthropicModel: formString(fd, "anthropicModel").trim() || current.anthropicModel,
    anthropicEffort: effort,
    openaiModel: formString(fd, "openaiModel").trim() || current.openaiModel,
    embeddingModel: formString(fd, "embeddingModel").trim() || current.embeddingModel,
    sttModel: formString(fd, "sttModel").trim() || current.sttModel,
    ttsModel: formString(fd, "ttsModel").trim() || current.ttsModel,
    ttsVoice: formString(fd, "ttsVoice").trim() || current.ttsVoice,
    learnerDailyMessages: Math.max(0, formInt(fd, "learnerDailyMessages", current.learnerDailyMessages)),
    trainerDailyGenerations: Math.max(0, formInt(fd, "trainerDailyGenerations", current.trainerDailyGenerations)),
    monthlyTokenBudget: Math.max(0, formInt(fd, "monthlyTokenBudget", current.monthlyTokenBudget)),
    maxContextMessages: Math.min(40, Math.max(2, formInt(fd, "maxContextMessages", current.maxContextMessages))),
  };
  await saveGroup("ai", s);
  const changed = await saveSecretsFrom(fd, ["ai.anthropicKey", "ai.openaiKey"]);
  await audit(admin.id, "settings.ai", "Setting", "ai", { provider, secretsChanged: changed });
  revalidatePath("/admin/parametres");
  return { ok: true, message: "Paramètres IA enregistrés." };
}

export async function testAiAction(): Promise<ActionState> {
  await requirePermission("settings.manage");
  const s = await getAiSettings();
  const results: string[] = [];
  const ak = await getSecret("ai.anthropicKey");
  if (ak) {
    try {
      const client = new Anthropic({ apiKey: ak });
      const r = await client.messages.create({ model: s.anthropicModel, max_tokens: 64, messages: [{ role: "user", content: "Réponds uniquement : OK" }] });
      results.push(`Anthropic (${s.anthropicModel}) : ${r.stop_reason === "refusal" ? "refus" : "connexion réussie"}`);
    } catch (e) {
      results.push(`Anthropic : échec — ${(e as Error).message.slice(0, 160)}`);
    }
  } else results.push("Anthropic : aucune clé");
  const ok = await getSecret("ai.openaiKey");
  if (ok) {
    try {
      const client = new OpenAI({ apiKey: ok });
      await client.embeddings.create({ model: s.embeddingModel, input: "test", dimensions: 1536 });
      results.push(`OpenAI (embeddings ${s.embeddingModel}) : connexion réussie`);
    } catch (e) {
      results.push(`OpenAI : échec — ${(e as Error).message.slice(0, 160)}`);
    }
  } else results.push("OpenAI : aucune clé (voix serveur et recherche sémantique désactivées)");
  return { ok: true, message: results.join(" · ") };
}

export async function savePaymentSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("settings.manage");
  const current = await getPaymentSettings();
  const enabled = ["cinetpay", "paydunya", "wave"].filter((p) => formBool(fd, `enable:${p}`));
  await saveGroup("payments", {
    ...current,
    enabled,
    cinetpaySiteId: formString(fd, "cinetpaySiteId").trim(),
    paydunyaMode: formString(fd, "paydunyaMode") === "live" ? "live" : "test",
    paydunyaStoreName: formString(fd, "paydunyaStoreName").trim() || current.paydunyaStoreName,
  });
  const changed = await saveSecretsFrom(fd, ["payments.cinetpay.apiKey", "payments.cinetpay.secretKey", "payments.paydunya.masterKey", "payments.paydunya.privateKey", "payments.paydunya.token", "payments.wave.apiKey", "payments.wave.webhookSecret"]);
  await audit(admin.id, "settings.payments", "Setting", "payments", { enabled, secretsChanged: changed });
  revalidatePath("/admin/parametres");
  return { ok: true, message: "Paramètres de paiement enregistrés." };
}

export async function saveTechnicalSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("settings.manage");
  const current = await getTechnicalSettings();
  const domain = formString(fd, "jitsiDomain").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (domain && !/^[a-z0-9.-]+$/i.test(domain)) return { error: "Domaine Jitsi invalide." };
  await saveGroup("technical", {
    ...current,
    registrationsOpen: formBool(fd, "registrationsOpen"),
    maxUploadMb: Math.min(2048, Math.max(1, formInt(fd, "maxUploadMb", current.maxUploadMb))),
    jitsiDomain: domain || "meet.jit.si",
    jitsiAppId: formString(fd, "jitsiAppId").trim(),
    smtpHost: formString(fd, "smtpHost").trim(),
    smtpPort: formInt(fd, "smtpPort", 587),
    smtpUser: formString(fd, "smtpUser").trim(),
    smtpFrom: formString(fd, "smtpFrom").trim(),
    smtpSecure: formBool(fd, "smtpSecure"),
  });
  const changed = await saveSecretsFrom(fd, ["live.jitsiAppSecret", "smtp.password"]);
  await audit(admin.id, "settings.technical", "Setting", "technical", { secretsChanged: changed });
  revalidatePath("/admin/parametres");
  return { ok: true, message: "Paramètres techniques enregistrés." };
}

export async function testEmailAction(): Promise<ActionState> {
  const admin = await requirePermission("settings.manage");
  const row = await queueEmail(admin.email, "Test d'envoi", await renderEmail("Test d'envoi", ["Si vous lisez ce message, la configuration SMTP fonctionne."]));
  await new Promise((r) => setTimeout(r, 1500));
  const after = await prisma.emailOutbox.findUnique({ where: { id: row.id } });
  return after?.status === "SENT" ? { ok: true, message: `Email envoyé à ${admin.email}.` } : { error: `Envoi impossible : ${after?.error ?? "en attente"}` };
}

