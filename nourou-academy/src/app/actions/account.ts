"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { destroySession, requireUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { canMessage } from "@/lib/messaging";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { randomToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { formBool, formString, nameSchema, phoneSchema, zodErrors, type ActionState } from "@/lib/validation";

const profileSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().max(2).optional(),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  lowDataMode: z.boolean(),
  marketingConsent: z.boolean(),
  headline: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(3000).optional(),
});

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    name: formString(fd, "name"),
    phone: formString(fd, "phone"),
    city: formString(fd, "city"),
    country: formString(fd, "country") || undefined,
    level: formString(fd, "level") || "BEGINNER",
    lowDataMode: formBool(fd, "lowDataMode"),
    marketingConsent: formBool(fd, "marketingConsent"),
    headline: formString(fd, "headline") || undefined,
    bio: formString(fd, "bio") || undefined,
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const isTrainer = user.role !== "LEARNER";
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      city: parsed.data.city || null,
      country: parsed.data.country || null,
      level: parsed.data.level,
      lowDataMode: parsed.data.lowDataMode,
      marketingConsent: parsed.data.marketingConsent,
      ...(isTrainer ? { headline: parsed.data.headline ?? null, bio: parsed.data.bio ?? null } : {}),
    },
  });
  const jar = await cookies();
  jar.set("nga_lowdata", parsed.data.lowDataMode ? "1" : "0", { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true, message: "Profil mis à jour." };
}

/** Droit à l'effacement : anonymisation du compte (les factures sont conservées pour obligations légales). */
export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role === "SUPERADMIN") return { error: "Un super-administrateur ne peut pas supprimer son compte depuis cet écran." };
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(formString(fd, "password"), full.passwordHash))) return { error: "Mot de passe incorrect." };
  if (formString(fd, "confirm") !== "SUPPRIMER") return { error: "Tapez SUPPRIMER pour confirmer." };
  await prisma.$transaction([
    prisma.tutorConversation.deleteMany({ where: { userId: user.id } }),
    prisma.note.deleteMany({ where: { userId: user.id } }),
    prisma.favorite.deleteMany({ where: { userId: user.id } }),
    prisma.notification.deleteMany({ where: { userId: user.id } }),
    prisma.directMessage.deleteMany({ where: { OR: [{ fromId: user.id }, { toId: user.id }] } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        name: "Compte supprimé",
        email: `supprime-${user.id}@invalid.local`,
        phone: null,
        city: null,
        bio: null,
        headline: null,
        avatarFileId: null,
        marketingConsent: false,
        passwordHash: randomToken(32),
      },
    }),
  ]);
  await audit(user.id, "account.delete", "User", user.id);
  await destroySession();
  redirect("/?compte=supprime");
}

const msgSchema = z.object({ toId: z.string().min(1), body: z.string().trim().min(1, "Message vide.").max(4000) });

export async function sendMessageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!rateLimit(`dm:${user.id}`, 30, 60_000).ok) return { error: "Trop de messages. Patientez un instant." };
  const parsed = msgSchema.safeParse({ toId: formString(fd, "toId"), body: formString(fd, "body") });
  if (!parsed.success) return zodErrors(parsed.error);
  if (!(await canMessage(user, parsed.data.toId))) return { error: "Vous ne pouvez pas écrire à cette personne." };
  await prisma.directMessage.create({ data: { fromId: user.id, toId: parsed.data.toId, body: parsed.data.body } });
  await notify(parsed.data.toId, { type: "MESSAGE", title: `Nouveau message de ${user.name}`, body: parsed.data.body.slice(0, 140), link: `/espace/messages?avec=${user.id}` });
  revalidatePath("/espace/messages");
  return { ok: true };
}

export async function markNotificationsReadAction() {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/espace", "layout");
}

const refundSchema = z.object({ orderId: z.string().min(1), reason: z.string().trim().min(10, "Expliquez la raison (10 caractères minimum).").max(1000) });

export async function requestRefundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = refundSchema.safeParse({ orderId: formString(fd, "orderId"), reason: formString(fd, "reason") });
  if (!parsed.success) return zodErrors(parsed.error);
  const order = await prisma.order.findFirst({ where: { id: parsed.data.orderId, userId: user.id, status: "PAID" } });
  if (!order) return { error: "Commande introuvable ou non éligible." };
  const existing = await prisma.refund.findFirst({ where: { orderId: order.id, status: "REQUESTED" } });
  if (existing) return { error: "Une demande est déjà en cours pour cette commande." };
  await prisma.refund.create({ data: { orderId: order.id, requestedById: user.id, reason: parsed.data.reason, amountXof: order.totalXof } });
  return { ok: true, message: "Demande de remboursement envoyée. L'équipe vous répondra par notification." };
}

export async function setLowDataCookieAction(on: boolean) {
  const jar = await cookies();
  jar.set("nga_lowdata", on ? "1" : "0", { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  revalidatePath("/", "layout");
}
