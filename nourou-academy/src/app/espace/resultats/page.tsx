import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Notes et résultats" };

const attemptStatus = { GRADED: ["Corrigé", "green"], PENDING_REVIEW: ["En attente de validation", "amber"], VALIDATED: ["Validé par le formateur", "green"] } as const;
const subStatus = { SUBMITTED: ["En attente", "gray"], AI_REVIEWED: ["Pré-corrigé par l'IA", "amber"], GRADED: ["Noté", "green"], RETURNED: ["À reprendre", "red"] } as const;

export default async function ResultsPage() {
  const user = await requireUser();
  const [attempts, submissions] = await Promise.all([
    prisma.quizAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { quiz: { select: { title: true, isFinalExam: true, lessonId: true, course: { select: { title: true, slug: true } } } } } }),
    prisma.submission.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { assignment: { select: { title: true, maxScore: true, lessonId: true, course: { select: { title: true, slug: true } } } } } }),
  ]);
  return (
    <>
      <PageHeader title="Notes et résultats" subtitle="Vos quiz, examens et devoirs, avec les retours de vos formateurs et du tuteur IA." />
      <h2 className="mb-3 text-lg font-bold text-navy">Quiz et examens</h2>
      {attempts.length === 0 ? <EmptyState title="Aucune évaluation passée" /> : (
        <Table>
          <thead><tr><Th>Évaluation</Th><Th>Formation</Th><Th>Date</Th><Th>Score</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {attempts.map((a) => {
              const [label, tone] = attemptStatus[a.status];
              return (
                <tr key={a.id}>
                  <Td>{a.quiz.lessonId ? <Link href={`/espace/apprendre/${a.quiz.course.slug}/${a.quiz.lessonId}`} className="font-medium text-navy hover:text-sky">{a.quiz.title}</Link> : a.quiz.title}{a.quiz.isFinalExam && <Badge tone="accent" className="ml-2">Examen final</Badge>}</Td>
                  <Td className="text-muted">{a.quiz.course.title}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(a.createdAt)}</Td>
                  <Td><span className={`font-semibold ${a.passed ? "text-emerald-700" : "text-navy"}`}>{a.percent} %</span></Td>
                  <Td><Badge tone={tone}>{label}</Badge>{a.reviewNote && <div className="mt-1 text-xs text-muted">{a.reviewNote}</div>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <h2 className="mb-3 mt-10 text-lg font-bold text-navy">Devoirs et projets</h2>
      {submissions.length === 0 ? <EmptyState title="Aucun devoir rendu" /> : (
        <Table>
          <thead><tr><Th>Devoir</Th><Th>Formation</Th><Th>Date</Th><Th>Note</Th><Th>Statut</Th></tr></thead>
          <tbody>
            {submissions.map((s) => {
              const [label, tone] = subStatus[s.status];
              return (
                <tr key={s.id}>
                  <Td>{s.assignment.lessonId ? <Link href={`/espace/apprendre/${s.assignment.course.slug}/${s.assignment.lessonId}`} className="font-medium text-navy hover:text-sky">{s.assignment.title}</Link> : s.assignment.title}</Td>
                  <Td className="text-muted">{s.assignment.course.title}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(s.createdAt)}</Td>
                  <Td>{s.finalScore !== null ? <b>{s.finalScore} / {s.assignment.maxScore}</b> : s.aiScore !== null ? <span className="text-muted">IA : {s.aiScore} / {s.assignment.maxScore}</span> : "—"}</Td>
                  <Td><Badge tone={tone}>{label}</Badge></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
