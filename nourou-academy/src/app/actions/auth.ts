"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth/session";
import { hashPassword, passwordIssue, verifyPassword } from "@/lib/auth/password";
import { randomToken, sha256 } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { getTechnicalSettings } from "@/lib/settings";
import { queueEmail, renderEmail } from "@/lib/mail";
import { env } from "@/lib/env";
import { homeFor } from "@/lib/permissions";
import { emailSchema, formBool, formString, nameSchema, phoneSchema, zodErrors, type ActionState } from "@/lib/validation";

function safeNext(next: string | null | undefined, fallback: string) {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return fallback;
}

const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: z.string(),
  consent: z.literal(true, { errorMap: () => ({ message: "Vous devez accepter les conditions et la politique de confidentialité." }) }),
  marketing: z.boolean(),
});

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, 5, 15 * 60_000).ok) return { error: "Trop de tentatives. Réessayez dans quelques minutes." };
  const tech = await getTechnicalSettings();
  if (!tech.registrationsOpen) return { error: "Les inscriptions sont momentanément fermées." };
  const parsed = registerSchema.safeParse({
    name: formString(fd, "name"),
    email: formString(fd, "email"),
    phone: formString(fd, "phone"),
    password: formString(fd, "password"),
    consent: formBool(fd, "consent"),
    marketing: formBool(fd, "marketing"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const issue = passwordIssue(parsed.data.password);
  if (issue) return { error: issue, fieldErrors: { password: issue } };
  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return { error: "Un compte existe déjà avec cet email. Connectez-vous ou réinitialisez votre mot de passe.", fieldErrors: { email: "Email déjà utilisé." } };
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      passwordHash: await hashPassword(parsed.data.password),
      privacyConsentAt: new Date(),
      marketingConsent: parsed.data.marketing,
    },
  });
  await createSession(user.id);
  await queueEmail(
    user.email,
    "Bienvenue sur la plateforme",
    await renderEmail(`Bienvenue, ${user.name} !`, ["Votre compte est créé. Découvrez nos formations gratuites et faites connaissance avec votre tuteur IA."], { label: "Accéder à mon espace", href: "/espace" }),
  );
  redirect(safeNext(formString(fd, "suivant"), "/espace"));
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = formString(fd, "email").trim().toLowerCase();
  const password = formString(fd, "password");
  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 20, 15 * 60_000).ok || !rateLimit(`login:${email}`, 8, 15 * 60_000).ok) {
    return { error: "Trop de tentatives de connexion. Patientez 15 minutes ou réinitialisez votre mot de passe." };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  // Message volontairement générique (ne révèle pas si le compte existe).
  if (!user || user.status === "DELETED" || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Email ou mot de passe incorrect." };
  }
  if (user.status === "SUSPENDED") return { error: "Ce compte est suspendu. Contactez l'assistance." };
  await createSession(user.id);
  redirect(safeNext(formString(fd, "suivant"), homeFor(user.role)));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = formString(fd, "email").trim().toLowerCase();
  const ip = await clientIp();
  const generic: ActionState = { ok: true, message: "Si un compte existe avec cet email, vous allez recevoir un lien de réinitialisation (valable 1 heure)." };
  if (!rateLimit(`forgot:${ip}`, 5, 15 * 60_000).ok) return generic;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return generic;
  const token = randomToken(32);
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) } });
  const link = `${env.appUrl}/reinitialiser/${token}`;
  await queueEmail(
    user.email,
    "Réinitialisation de votre mot de passe",
    await renderEmail("Réinitialiser votre mot de passe", ["Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable 1 heure.", "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email."], { label: "Choisir un nouveau mot de passe", href: link }),
  );
  if (!env.isProduction) console.info(`[dev] Lien de réinitialisation pour ${user.email} : ${link}`);
  return generic;
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = formString(fd, "token");
  const password = formString(fd, "password");
  if (password !== formString(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas." };
  const issue = passwordIssue(password);
  if (issue) return { error: issue };
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return { error: "Ce lien est invalide ou a expiré. Refaites une demande." };
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password) } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: row.userId } }),
  ]);
  return { ok: true, message: "Mot de passe modifié. Vous pouvez vous connecter." };
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(formString(fd, "current"), full.passwordHash))) return { error: "Mot de passe actuel incorrect." };
  const next = formString(fd, "password");
  const issue = passwordIssue(next);
  if (issue) return { error: issue };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  return { ok: true, message: "Mot de passe mis à jour." };
}
