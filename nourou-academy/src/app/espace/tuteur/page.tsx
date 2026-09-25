import Link from "next/link";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getBrand } from "@/lib/settings";
import { aiStatus } from "@/lib/ai/llm";
import { formatDate } from "@/lib/format";
import { deleteConversationAction } from "@/app/actions/tutor";
import { TutorChat, type TutorCitation, type TutorMsg } from "@/components/tutor/tutor-chat";
import { Card } from "@/components/ui";

export const metadata = { title: "Tuteur IA" };

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ c?: string; formation?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [brand, status, conversations, enrollments] = await Promise.all([
    getBrand(),
    aiStatus(),
    prisma.tutorConversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 40, include: { course: { select: { title: true } } } }),
    prisma.enrollment.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { course: { select: { id: true, title: true } } } }),
  ]);
  const current = sp.c ? conversations.find((c) => c.id === sp.c) : undefined;
  const messages = current
    ? await prisma.tutorMessage.findMany({ where: { conversationId: current.id }, orderBy: { createdAt: "asc" }, take: 200 })
    : [];
  const courseId = current?.courseId ?? (enrollments.some((e) => e.course.id === sp.formation) ? sp.formation : undefined);
  const initial: TutorMsg[] = messages.map((m) => ({ id: m.id, role: m.role === "assistant" ? "assistant" : "user", content: m.content, citations: (m.citations as TutorCitation[]) ?? [] }));

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        <Link href="/espace/tuteur" className="flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-900">
          <MessageSquarePlus className="h-4 w-4" aria-hidden /> Nouvelle discussion
        </Link>
        {enrollments.length > 0 && !current && (
          <form className="rounded-xl border border-line bg-white p-3 text-sm">
            <label className="block text-xs font-medium text-muted" htmlFor="formation">Discuter d'une formation</label>
            <select id="formation" name="formation" defaultValue={courseId ?? ""} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5">
              <option value="">Toutes mes formations</option>
              {enrollments.map((e) => <option key={e.course.id} value={e.course.id}>{e.course.title}</option>)}
            </select>
            <button className="mt-2 w-full rounded-lg border border-line py-1.5 text-xs font-medium text-navy hover:bg-sky-50">Appliquer</button>
          </form>
        )}
        <Card className="max-h-[60vh] overflow-y-auto p-2">
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">Historique</div>
          {conversations.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">Aucune discussion pour le moment.</p>
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.id} className={`group flex items-center gap-1 rounded-lg ${c.id === current?.id ? "bg-sky-50" : "hover:bg-surface"}`}>
                  <Link href={`/espace/tuteur?c=${c.id}`} className="min-w-0 flex-1 px-2 py-2">
                    <div className="truncate text-sm font-medium text-navy">{c.title}</div>
                    <div className="truncate text-[11px] text-muted">{c.course?.title ?? "Général"} · {formatDate(c.updatedAt, { dateStyle: "short" })}</div>
                  </Link>
                  <form action={deleteConversationAction.bind(null, c.id)}>
                    <button className="p-2 text-muted opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100" aria-label="Supprimer la discussion"><Trash2 className="h-4 w-4" /></button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
      <section className="min-w-0">
        <div className="mb-3">
          <h1 className="text-xl font-bold text-navy">{brand.tutorName}</h1>
          <p className="text-sm text-muted">
            {current?.course ? `Discussion sur « ${current.course.title} »` : courseId ? `Discussion sur « ${enrollments.find((e) => e.course.id === courseId)?.course.title} »` : "Votre tuteur personnel : questions de cours, explications, exercices, quiz et parcours personnalisé."}
          </p>
        </div>
        <TutorChat
          key={current?.id ?? `new-${courseId ?? ""}`}
          tutorName={brand.tutorName}
          capabilities={{ chat: status.chat, voiceServer: status.voiceServer, vision: status.vision }}
          courseId={courseId}
          initialConversationId={current?.id ?? null}
          initialMessages={initial}
        />
      </section>
    </div>
  );
}
