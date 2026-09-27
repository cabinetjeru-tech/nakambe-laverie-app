"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { formBool, formInt, formString, nameSchema, splitList, zodErrors, type ActionState } from "@/lib/validation";

// ───────────────────────────── Annuaire des formateurs (administration) ─────────────────────────────

const trainerSchema = z.object({
  name: nameSchema,
  headline: z.string().trim().max(160, "Titre : 160 caractères maximum."),
  bio: z.string().trim().max(3000, "Biographie : 3 000 caractères maximum."),
  expertise: z.array(z.string().trim().min(1).max(40, "Chaque spécialité : 40 caractères maximum.")).max(12, "12 spécialités maximum."),
  showOnSite: z.boolean(),
  displayOrder: z.number().int().min(0).max(9999),
});

function revalidateTrainer(id: string) {
  revalidatePath("/admin/formateurs");
  revalidatePath(`/admin/formateurs/${id}`);
  revalidatePath("/formateurs");
  revalidatePath(`/formateurs/${id}`);
}

async function findTrainer(id: string) {
  return prisma.user.findFirst({ where: { id, role: "TRAINER", status: { not: "DELETED" } } });
}

/** L'administration modifie la fiche publique d'un formateur (nom, titre, biographie, spécialités, visibilité, ordre). */
export async function updateTrainerProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePermission("users.manage");
  const trainer = await findTrainer(formString(fd, "trainerId"));
  if (!trainer) return { error: "Formateur introuvable." };
  const parsed = trainerSchema.safeParse({
    name: formString(fd, "name"),
    headline: formString(fd, "headline"),
    bio: formString(fd, "bio"),
    expertise: splitList(formString(fd, "expertise")),
    showOnSite: formBool(fd, "showOnSite"),
    displayOrder: formInt(fd, "displayOrder", 0),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  const d = parsed.data;
  await prisma.user.update({
    where: { id: trainer.id },
    data: { name: d.name, headline: d.headline || null, bio: d.bio || null, expertise: d.expertise, showOnSite: d.showOnSite, displayOrder: d.displayOrder },
  });
  await audit(admin.id, "trainer.update", "User", trainer.id, { showOnSite: d.showOnSite, displayOrder: d.displayOrder });
  revalidateTrainer(trainer.id);
  return { ok: true, message: "Fiche du formateur enregistrée." };
}

/** Affiche ou masque rapidement un formateur sur la page publique. */
export async function toggleTrainerVisibilityAction(trainerId: string) {
  const admin = await requirePermission("users.manage");
  const trainer = await findTrainer(trainerId);
  if (!trainer) return;
  await prisma.user.update({ where: { id: trainer.id }, data: { showOnSite: !trainer.showOnSite } });
  await audit(admin.id, "trainer.visibility", "User", trainer.id, { showOnSite: !trainer.showOnSite });
  revalidateTrainer(trainer.id);
}

/** Retire la photo d'un formateur (les initiales s'affichent à la place). */
export async function removeTrainerAvatarAction(trainerId: string) {
  const admin = await requirePermission("users.manage");
  const trainer = await findTrainer(trainerId);
  if (!trainer) return;
  await prisma.user.update({ where: { id: trainer.id }, data: { avatarFileId: null } });
  await audit(admin.id, "trainer.avatar.remove", "User", trainer.id);
  revalidateTrainer(trainer.id);
}
