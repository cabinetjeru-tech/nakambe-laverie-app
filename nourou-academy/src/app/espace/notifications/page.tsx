import Link from "next/link";
import { Bell } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { markNotificationsReadAction } from "@/app/actions/account";
import { SubmitButton } from "@/components/forms/submit-button";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Notifications" actions={items.some((i) => !i.readAt) ? <form action={markNotificationsReadAction}><SubmitButton variant="outline" size="sm">Tout marquer comme lu</SubmitButton></form> : null} />
      {items.length === 0 ? <EmptyState icon={<Bell className="h-6 w-6" />} title="Aucune notification" /> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 p-4 ${n.readAt ? "" : "bg-sky-50/60"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-sky"}`} aria-hidden />
              <div className="flex-1">
                <div className="text-sm font-semibold text-navy">{n.link ? <Link href={n.link} className="hover:text-sky">{n.title}</Link> : n.title}</div>
                <p className="text-sm text-ink">{n.body}</p>
                <div className="mt-0.5 text-[11px] text-muted">{formatDateTime(n.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
