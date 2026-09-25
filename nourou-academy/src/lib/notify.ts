import "server-only";
import { prisma } from "./db";
import { queueEmail, renderEmail } from "./mail";

/** Notification in-app (+ email optionnel). */
export async function notify(
  userId: string,
  n: { type: string; title: string; body: string; link?: string; email?: boolean },
) {
  await prisma.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body, link: n.link } });
  if (n.email) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, status: true } });
    if (user && user.status === "ACTIVE") {
      await queueEmail(user.email, n.title, await renderEmail(n.title, [n.body], n.link ? { label: "Ouvrir", href: n.link } : undefined));
    }
  }
}
