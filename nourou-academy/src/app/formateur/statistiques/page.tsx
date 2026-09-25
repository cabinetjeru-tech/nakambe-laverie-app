import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatXof } from "@/lib/format";
import { PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Statistiques" };

export default async function TrainerStats() {
  const user = await requirePermission("trainer.access");
  const courses = await prisma.course.findMany({ where: { trainerId: user.id }, select: { id: true, title: true, status: true } });
  const rows = await Promise.all(
    courses.map(async (c) => {
      const [enr, completed, avgProgress, quiz, rating, revenue, tutor] = await Promise.all([
        prisma.enrollment.count({ where: { courseId: c.id, status: "ACTIVE" } }),
        prisma.enrollment.count({ where: { courseId: c.id, completedAt: { not: null } } }),
        prisma.enrollment.aggregate({ where: { courseId: c.id, status: "ACTIVE" }, _avg: { progressPercent: true } }),
        prisma.quizAttempt.aggregate({ where: { quiz: { courseId: c.id }, status: { in: ["GRADED", "VALIDATED"] } }, _avg: { percent: true }, _count: true }),
        prisma.review.aggregate({ where: { courseId: c.id, status: "APPROVED" }, _avg: { rating: true }, _count: true }),
        prisma.order.aggregate({ where: { courseId: c.id, status: "PAID", mode: "LIVE" }, _sum: { totalXof: true } }),
        prisma.tutorConversation.count({ where: { courseId: c.id } }),
      ]);
      return { c, enr, completed, avgProgress: Math.round(avgProgress._avg.progressPercent ?? 0), quiz, rating, revenue: revenue._sum.totalXof ?? 0, tutor };
    }),
  );
  return (
    <>
      <PageHeader title="Statistiques de mes formations" subtitle="Chiffres calculés en temps réel depuis la base (paiements de démonstration exclus)." />
      <Table>
        <thead><tr><Th>Formation</Th><Th>Inscrits</Th><Th>Terminée</Th><Th>Progression moy.</Th><Th>Moy. quiz</Th><Th>Avis</Th><Th>Discussions tuteur</Th><Th>Ventes</Th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><Td colSpan={8} className="text-center text-muted">Aucune formation.</Td></tr>}
          {rows.map((r) => (
            <tr key={r.c.id}>
              <Td className="font-medium text-navy">{r.c.title}</Td>
              <Td>{r.enr}</Td>
              <Td>{r.completed}{r.enr ? ` (${Math.round((r.completed / r.enr) * 100)} %)` : ""}</Td>
              <Td>{r.avgProgress} %</Td>
              <Td>{r.quiz._count ? `${Math.round(r.quiz._avg.percent ?? 0)} % (${r.quiz._count})` : "—"}</Td>
              <Td>{r.rating._count ? `${(r.rating._avg.rating ?? 0).toFixed(1)}/5 (${r.rating._count})` : "—"}</Td>
              <Td>{r.tutor}</Td>
              <Td className="whitespace-nowrap">{formatXof(r.revenue)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
