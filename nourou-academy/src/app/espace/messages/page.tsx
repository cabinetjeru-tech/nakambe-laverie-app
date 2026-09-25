import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { canMessage, messagingContacts } from "@/lib/messaging";
import { formatDateTime, initials, roleLabels } from "@/lib/format";
import { sendMessageAction } from "@/app/actions/account";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, EmptyState, PageHeader, Textarea } from "@/components/ui";

export const metadata = { title: "Messagerie" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ avec?: string }> }) {
  const { avec } = await searchParams;
  const user = await requireUser();
  const contacts = await messagingContacts(user);
  const other = avec ? await prisma.user.findUnique({ where: { id: avec }, select: { id: true, name: true, role: true } }) : null;
  const allowed = other ? await canMessage(user, other.id) : false;
  const thread = other
    ? await prisma.directMessage.findMany({
        where: { OR: [{ fromId: user.id, toId: other.id }, { fromId: other.id, toId: user.id }] },
        orderBy: { createdAt: "asc" },
        take: 300,
      })
    : [];
  if (other) await prisma.directMessage.updateMany({ where: { fromId: other.id, toId: user.id, readAt: null }, data: { readAt: new Date() } });
  const unreadBy = await prisma.directMessage.groupBy({ by: ["fromId"], where: { toId: user.id, readAt: null }, _count: true });
  const unread = new Map(unreadBy.map((u) => [u.fromId, u._count]));

  return (
    <>
      <PageHeader title="Messagerie" subtitle="Échangez avec vos formateurs et l'équipe d'assistance." />
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card className="p-2">
          {contacts.length === 0 ? <p className="p-3 text-sm text-muted">Aucun contact pour le moment.</p> : (
            <ul>
              {contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/espace/messages?avec=${c.id}`} className={`flex items-center gap-2 rounded-lg p-2 ${c.id === other?.id ? "bg-sky-50" : "hover:bg-surface"}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{initials(c.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-navy">{c.name}</span>
                      <span className="block text-[11px] text-muted">{c.label ?? roleLabels[c.role]}</span>
                    </span>
                    {unread.get(c.id) ? <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unread.get(c.id)}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="flex min-h-[420px] flex-col">
          {!other ? (
            <div className="m-auto p-6"><EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Sélectionnez une conversation" /></div>
          ) : (
            <>
              <div className="border-b border-line px-4 py-3 font-semibold text-navy">{other.name}</div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {thread.length === 0 && <p className="text-sm text-muted">Aucun message. Écrivez le premier !</p>}
                {thread.map((m) => (
                  <div key={m.id} className={`flex ${m.fromId === user.id ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.fromId === user.id ? "bg-navy text-white" : "bg-surface"}`}>
                      <p className="whitespace-pre-line">{m.body}</p>
                      <div className={`mt-1 text-[10px] ${m.fromId === user.id ? "text-sky-200" : "text-muted"}`}>{formatDateTime(m.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
              {allowed ? (
                <ActionForm action={sendMessageAction} className="flex items-end gap-2 border-t border-line p-3" resetOnSuccess>
                  <input type="hidden" name="toId" value={other.id} />
                  <Textarea name="body" rows={2} required maxLength={4000} placeholder="Votre message…" className="flex-1" />
                  <SubmitButton>Envoyer</SubmitButton>
                </ActionForm>
              ) : (
                <p className="border-t border-line p-3 text-sm text-muted">Vous ne pouvez pas écrire à cette personne.</p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
