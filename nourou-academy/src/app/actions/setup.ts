"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { hashPassword, passwordIssue } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { safeEqual } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { ensureSuperAdmin, seedDemo } from "@/lib/setup/seed";
import { emailSchema, formBool, formString, nameSchema, zodErrors, type ActionState } from "@/lib/validation";

/**
 * Installation initiale en ligne (sans accès terminal) : création du premier super-administrateur.
 * Protégée par SETUP_TOKEN (variable d'environnement) et désactivée dès qu'un super-administrateur existe.
 */
export async function installAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`install:${ip}`, 5, 15 * 60_000).ok) return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  if (await prisma.user.count({ where: { role: "SUPERADMIN" } })) return { error: "La plateforme est déjà installée." };
  const expected = process.env.SETUP_TOKEN ?? "";
  if (expected.length < 16) return { error: "SETUP_TOKEN n'est pas défini (16 caractères minimum) dans les variables d'environnement." };
  if (!safeEqual(formString(fd, "token"), expected)) return { error: "Jeton d'installation incorrect." };
  const parsed = z.object({ name: nameSchema, email: emailSchema, password: z.string() }).safeParse({
    name: formString(fd, "name"),
    email: formString(fd, "email"),
    password: formString(fd, "password"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const issue = passwordIssue(parsed.data.password);
  if (issue) return { error: issue };
  if (parsed.data.password.length < 12) return { error: "Pour le super-administrateur, utilisez au moins 12 caractères." };
  const res = await ensureSuperAdmin(parsed.data);
  if (!res.created) return { error: "Un compte existe déjà avec cet email." };
  if (formBool(fd, "demo")) await seedDemo();
  const user = await prisma.user.findUniqueOrThrow({ where: { email: res.email } });
  await createSession(user.id);
  redirect("/admin");
}

/** Masque un email pour l'affichage (c******@gmail.com). */
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

/**
 * Récupération d'accès du super-administrateur (mot de passe oublié, sans email configuré).
 * Active uniquement tant que la variable ADMIN_RECOVERY_TOKEN (16 caractères minimum) existe chez l'hébergeur :
 * la supprimer après usage désactive la page.
 */
export async function recoverAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`recover:${ip}`, 5, 15 * 60_000).ok) return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  const expected = process.env.ADMIN_RECOVERY_TOKEN ?? "";
  if (expected.length < 16) return { error: "La récupération n'est pas activée." };
  if (!safeEqual(formString(fd, "token"), expected)) return { error: "Clé de récupération incorrecte." };
  const email = formString(fd, "email").trim().toLowerCase();
  const password = formString(fd, "password");
  if (password !== formString(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas." };
  const issue = passwordIssue(password);
  if (issue) return { error: issue };
  if (password.length < 12) return { error: "Pour le super-administrateur, utilisez au moins 12 caractères." };
  const admins = await prisma.user.findMany({ where: { role: "SUPERADMIN" }, select: { id: true, email: true } });
  const target = admins.find((a) => a.email === email);
  if (!target) {
    const known = admins.map((a) => maskEmail(a.email)).join(", ");
    return { error: `Aucun super-administrateur avec cet email.${known ? ` Compte(s) existant(s) : ${known}` : ""}` };
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password), status: "ACTIVE" } }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
  ]);
  await audit(target.id, "admin.recovery", "User", target.id);
  await createSession(target.id);
  redirect("/admin");
}
