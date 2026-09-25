import Link from "next/link";
import { BookOpen, ClipboardCheck, Radio, Users, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime, formatXof } from "@/lib/format";
import { Badge, Card, CardBody, PageHeader, Stat, buttonClass } from "@/components/ui";

export const metadata = { title: "Espace formateur" };

export default async function TrainerDashboard() {
  const user = await requirePermission("trainer.access");
  const mine = { trainerId: user.id };
  const [courses, learners, pendingSubs, pendingAttempts, revenue, lives] = await Promise.all([
    prisma.course.findMany({ where: mine, orderBy: { updatedAt: "desc" }, include: { _count: { select: { enrollments: true } } } }),
    prisma.enrollment.count({ where: { course: mine, status: "ACTIVE" } }),
    prisma.submission.count({ where: { assignment: { course: mine }, status: { in: ["SUBMITTED", "AI_REVIEWED"] } } }),
    prisma.quizAttempt.count({ where: { quiz: { course: mine }, status: "PENDING_REVIEW" } }),
    prisma.order.aggregate({ where: { status: "PAID", mode: "LIVE", course: mine }, _sum: { totalXof: true } }),
    prisma.liveSession.findMany({ where: { trainerId: user.id, startsAt: { gte: new Date(Date.now() - 3600_000) }, status: { in: ["SCHEDULED", "LIVE"] } }, orderBy: { startsAt: "asc" }, take: 4, include: { _count: { select: { registrations: true } } } }),
  ]);
  const statusTone = { DRAFT: "gray", SUBMITTED: "amber", PUBLISHED: "green", REJECTED: "red", ARCHIVED: "gray" } as const;
  const statusLabel = { DRAFT: "Brouillon", SUBMITTED: "En validation", PUBLISHED: "Publiée", REJECTED: "À corriger", ARCHIVED: "Archivée" };
  return (
    <>
      <PageHeader title={`Bonjour ${user.name.split(" ")[0]}`} subtitle="Vue d'ensemble de vos formations et de vos apprenants." actions={<Link href="/formateur/formations/nouvelle" className={buttonClass("accent")}>Nouvelle formation</Link>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Formations" value={courses.length} hint={`${courses.filter((c) => c.status === "PUBLISHED").length} publiée(s)`} icon={<BookOpen className="h-5 w-5" />} />
        <Stat label="Apprenants actifs" value={learners} icon={<Users className="h-5 w-5" />} />
        <Stat label="À corriger" value={pendingSubs + pendingAttempts} hint={`${pendingSubs} devoir(s), ${pendingAttempts} copie(s)`} icon={<ClipboardCheck className="h-5 w-5" />} />
        <Stat label="Ventes à l'unité" value={formatXof(revenue._sum.totalXof ?? 0)} hint="Paiements confirmés (hors démo)" icon={<Wallet className="h-5 w-5" />} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold text-navy">Mes formations</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {courses.length === 0 && <li className="p-6 text-sm text-muted">Créez votre première formation, ou demandez à l'assistant IA de vous proposer un plan de cours.</li>}
            {courses.slice(0, 8).map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/formateur/formations/${c.id}`} className="font-medium text-navy hover:text-sky">{c.title}</Link>
                  <div className="text-xs text-muted">{c._count.enrollments} apprenant(s)</div>
                </div>
                <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
              </li>
            ))}
          </ul>
        </div>
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 font-semibold text-navy"><Radio className="h-4 w-4 text-red-500" /> Prochaines classes</h2>
            {lives.length === 0 ? <p className="mt-2 text-sm text-muted">Aucune séance programmée.</p> : (
              <ul className="mt-3 space-y-2 text-sm">{lives.map((l) => <li key={l.id}><Link href={`/formateur/classes/${l.id}`} className="font-medium text-navy hover:text-sky">{l.title}</Link><div className="text-xs text-muted">{formatDateTime(l.startsAt)} · {l._count.registrations} inscrit(s)</div></li>)}</ul>
            )}
            <Link href="/formateur/classes" className={buttonClass("outline", "sm", "mt-4")}>Programmer une séance</Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
