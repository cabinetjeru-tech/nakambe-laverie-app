"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { queueEmail, renderEmail } from "@/lib/mail";
import { getBrand } from "@/lib/settings";
import { emailSchema, formString, nameSchema, phoneSchema, zodErrors, type ActionState } from "@/lib/validation";

const schema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  subject: z.string().trim().min(3, "Objet trop court.").max(150),
  message: z.string().trim().min(10, "Message trop court.").max(5000),
  website: z.string().max(0, "Requête refusée."), // champ piège anti-robot
});

export async function contactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`contact:${ip}`, 5, 30 * 60_000).ok) return { error: "Trop de messages envoyés. Réessayez plus tard." };
  const parsed = schema.safeParse({
    name: formString(fd, "name"),
    email: formString(fd, "email"),
    phone: formString(fd, "phone"),
    subject: formString(fd, "subject"),
    message: formString(fd, "message"),
    website: formString(fd, "website"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const user = await getCurrentUser();
  const { website: _w, ...data } = parsed.data;
  void _w;
  const ticket = await prisma.supportTicket.create({ data: { ...data, phone: data.phone || null, userId: user?.id ?? null } });
  const brand = await getBrand();
  await queueEmail(data.email, `Votre demande a bien été reçue (#${ticket.id.slice(-6).toUpperCase()})`, await renderEmail("Nous avons bien reçu votre message", [`Bonjour ${data.name},`, `Votre demande « ${data.subject} » a été enregistrée. L'équipe de ${brand.name} vous répondra dans les meilleurs délais.`]));
  return { ok: true, message: `Message envoyé. Numéro de suivi : #${ticket.id.slice(-6).toUpperCase()}. Nous vous répondrons par email.` };
}
