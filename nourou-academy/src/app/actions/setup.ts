"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { passwordIssue } from "@/lib/auth/password";
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
