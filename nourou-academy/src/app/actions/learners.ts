"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { queueEmail, renderEmail } from "@/lib/mail";
import { env } from "@/lib/env";
import { getBrand } from "@/lib/settings";
import { evaluateCertificate } from "@/lib/certificates/issue";
import { certificateDecisionAction } from "./admin";
import { emailSchema, formString, nameSchema, phoneSchema, type ActionState } from "@/lib/validation";

// ───────────────────────────── Suivi des apprenants (administration) ─────────────────────────────

function refresh(userId?: string) {
  revalidatePath("/admin/apprenants");
  if (userId) revalidatePath(`/admin/apprenants/${userId}`);
}

async function findLearner(id: string) {
  return prisma.user.findFirst({ where: { id, role: "LEARNER", status: { not: "DELETED" } } });
}

/** Lien pour choisir (ou rechoisir) son mot de passe, valable 72 h. */
async function passwordLink(userId: string) {
  const token = randomToken(32);
  await prisma.passwordResetToken.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 72 * 3600_000) } });
  return `${env.appUrl.replace(/\/$/, "")}/reinitialiser/${token}`;
}

async function enroll(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, slug: true } });
  if (!course) return null;
  await prisma.enrollment.upsert({ where: { userId_courseId: { userId, courseId } }, create: { userId, courseId, source: "ADMIN" }, update: { status: "ACTIVE" } });
  await notify(userId, { type: "ACCESS", title: "Nouvel accès", body: `Vous avez maintenant accès à « ${course.title} ».`, link: `/espace/apprendre/${course.slug}` });
  return course;
}

/**
 * Ajoute un ou plusieurs apprenants (une ligne par personne : « Nom, email, téléphone »),
 * éventuellement inscrits d'office à une formation. Les liens d'activation sont affichés
 * pour pouvoir être transmis (WhatsApp…) même sans serveur d'emails.
 */
export async function addLearnersAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("users.manage");
  const courseId = formString(fd, "courseId");
  const lines = formString(fd, "people").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "Saisissez au moins une personne : Nom, email (téléphone facultatif)." };
  if (lines.length > 200) return { error: "200 personnes maximum par envoi." };
  const brand = await getBrand();
  const links: { label: string; url: string }[] = [];
  const problems: string[] = [];
  let enrolledExisting = 0;
  for (const [i, line] of lines.entries()) {
    const [rawName = "", rawEmail = "", rawPhone = ""] = line.split(/[;,\t]/).map((s) => s.trim());
    const parsed = z.object({ name: nameSchema, email: emailSchema, phone: phoneSchema }).safeParse({ name: rawName, email: rawEmail, phone: rawPhone });
    if (!parsed.success) {
      problems.push(`Ligne ${i + 1} (« ${line.slice(0, 40)} ») : ${parsed.error.issues[0]?.message ?? "invalide"}`);
      continue;
    }
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) {
      if (courseId && existing.status !== "DELETED") {
        await enroll(existing.id, courseId);
        enrolledExisting++;
      } else problems.push(`Ligne ${i + 1} : un compte existe déjà avec ${parsed.data.email}.`);
      continue;
    }
    const user = await prisma.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone || null, role: "LEARNER", passwordHash: await hashPassword(randomToken(24)) },
    });
    const link = await passwordLink(user.id);
    await queueEmail(user.email, `Votre compte ${brand.name}`, await renderEmail(`Bienvenue, ${user.name}`, [`Un compte a été créé pour vous sur ${brand.name}.`, "Cliquez sur le bouton pour choisir votre mot de passe (lien valable 72 heures)."], { label: "Activer mon compte", href: link }));
    if (courseId) await enroll(user.id, courseId);
    links.push({ label: `${user.name} — ${user.email}`, url: link });
  }
  await audit(admin.id, "learners.add", "User", null, { created: links.length, enrolledExisting, courseId: courseId || null });
  refresh();
  if (links.length === 0 && enrolledExisting === 0) return { error: problems.join(" · ") || "Aucun apprenant ajouté." };
  const parts = [
    links.length ? `${links.length} compte(s) créé(s). Transmettez à chacun son lien d'activation (valable 72 h) si les emails ne sont pas configurés :` : "",
    enrolledExisting ? `${enrolledExisting} compte(s) existant(s) inscrit(s) à la formation.` : "",
    problems.length ? `Non traité : ${problems.join(" · ")}` : "",
  ];
  return { ok: true, message: parts.filter(Boolean).join(" "), links };
}

/** Suspend (avec motif, déconnexion immédiate) ou réactive un apprenant. */
export async function setLearnerStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("users.manage");
  const learner = await findLearner(formString(fd, "userId"));
  if (!learner) return { error: "Apprenant introuvable." };
  const suspend = formString(fd, "status") === "SUSPENDED";
  const reason = formString(fd, "reason").trim().slice(0, 500);
  await prisma.user.update({ where: { id: learner.id }, data: { status: suspend ? "SUSPENDED" : "ACTIVE" } });
  if (suspend) await prisma.session.deleteMany({ where: { userId: learner.id } });
  else await notify(learner.id, { type: "ACCOUNT", title: "Compte réactivé", body: "Votre compte est de nouveau actif. Bonne reprise !", link: "/espace", email: true });
  await audit(admin.id, suspend ? "learner.suspend" : "learner.reactivate", "User", learner.id, reason ? { reason } : undefined);
  refresh(learner.id);
  return { ok: true, message: suspend ? "Apprenant suspendu : il est déconnecté et ne peut plus se connecter." : "Apprenant réactivé." };
}

/** Inscrit l'apprenant à une formation (accès offert par l'administration). */
export async function enrollLearnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("users.manage");
  const learner = await findLearner(formString(fd, "userId"));
  if (!learner) return { error: "Apprenant introuvable." };
  const course = await enroll(learner.id, formString(fd, "courseId"));
  if (!course) return { error: "Choisissez une formation." };
  await audit(admin.id, "enrollment.grant", "Enrollment", null, { userId: learner.id, courseId: course.id });
  refresh(learner.id);
  return { ok: true, message: `Inscrit à « ${course.title} ».` };
}

/** Retire ou rétablit l'accès à une formation. */
export async function setEnrollmentStatusAction(enrollmentId: string, status: "ACTIVE" | "REVOKED") {
  const admin = await requirePermission("users.manage");
  const e = await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status } });
  await audit(admin.id, status === "REVOKED" ? "enrollment.revoke" : "enrollment.restore", "Enrollment", enrollmentId);
  refresh(e.userId);
}

/** Message à l'apprenant : notification dans son espace + email (dès que les emails sont configurés). */
export async function messageLearnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("users.manage");
  const learner = await findLearner(formString(fd, "userId"));
  if (!learner) return { error: "Apprenant introuvable." };
  const title = formString(fd, "title").trim().slice(0, 120);
  const body = formString(fd, "body").trim().slice(0, 2000);
  if (!title || !body) return { error: "Indiquez un objet et un message." };
  await notify(learner.id, { type: "ADMIN", title, body, link: "/espace", email: true });
  await audit(admin.id, "learner.message", "User", learner.id);
  return { ok: true, message: "Message envoyé : visible dans ses notifications (et par email si configuré)." };
}

/** Génère un lien pour choisir un nouveau mot de passe, à transmettre à l'apprenant. */
export async function learnerPasswordLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("users.manage");
  const learner = await findLearner(formString(fd, "userId"));
  if (!learner) return { error: "Apprenant introuvable." };
  const url = await passwordLink(learner.id);
  await audit(admin.id, "learner.password_link", "User", learner.id);
  return { ok: true, message: "Lien créé (valable 72 h). Transmettez-le uniquement à l'apprenant :", links: [{ label: learner.name, url }] };
}

/** Vérifie les critères et délivre le certificat si l'apprenant les remplit (jamais sans les critères). */
export async function checkCertificateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("certificates.manage");
  const userId = formString(fd, "userId");
  const courseId = formString(fd, "courseId");
  const cert = await evaluateCertificate(userId, courseId);
  await audit(admin.id, "certificate.check", "Certificate", cert?.id ?? null, { userId, courseId, issued: Boolean(cert) });
  refresh(userId);
  if (!cert) return { error: "Les critères du certificat ne sont pas encore tous remplis (voir le détail ci-dessus)." };
  return { ok: true, message: cert.status === "VALID" ? `Certificat délivré (${cert.code}).` : "Certificat créé, en attente de validation." };
}

/** Valide un certificat en attente ou révoque un certificat (même règle que la page Certificats). */
export async function learnerCertificateDecisionAction(certId: string, decision: "approve" | "revoke") {
  await certificateDecisionAction(certId, decision);
  const c = await prisma.certificate.findUnique({ where: { id: certId }, select: { userId: true } });
  if (c) refresh(c.userId);
}
