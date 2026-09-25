"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export async function deleteConversationAction(id: string) {
  const user = await requireUser();
  await prisma.tutorConversation.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/espace/tuteur");
}
