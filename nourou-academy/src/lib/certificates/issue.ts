import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { getBrand } from "../settings";
import { notify } from "../notify";
import { checkEligibility, type LearnerRecord } from "./eligibility";

export function certificateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `NGA-${new Date().getFullYear()}-${s.slice(0, 5)}-${s.slice(5)}`;
}

export async function learnerRecord(userId: string, courseId: string): Promise<LearnerRecord> {
  const [enrollment, exams, projects, lives] = await Promise.all([
    prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } }),
    prisma.quiz.findMany({
      where: { courseId, isFinalExam: true },
      include: { attempts: { where: { userId, status: { in: ["GRADED", "VALIDATED"] } }, orderBy: { percent: "desc" }, take: 1 } },
    }),
    prisma.assignment.findMany({
      where: { courseId, isProject: true },
      include: { submissions: { where: { userId, status: "GRADED", passed: true }, take: 1 } },
    }),
    prisma.liveSession.findMany({
      where: { courseId, status: { in: ["ENDED", "LIVE"] } },
      include: { registrations: { where: { userId, attended: true } } },
    }),
  ]);
  return {
    progressPercent: enrollment?.progressPercent ?? 0,
    finalExams: exams.map((e) => ({ bestValidatedPercent: e.attempts[0]?.percent ?? null, passingScore: e.passingScore })),
    projects: projects.map((p) => ({ passedAndGraded: p.submissions.length > 0 })),
    liveSessionsTotal: lives.length,
    liveSessionsAttended: lives.filter((l) => l.registrations.length > 0).length,
  };
}

/**
 * Vérifie l'éligibilité et délivre le certificat si tous les critères sont remplis.
 * Si la formation exige une approbation humaine, le certificat est créé en attente.
 */
export async function evaluateCertificate(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !course.hasCertificate) return null;
  const existing = await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) return existing;
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (!enrollment || enrollment.status !== "ACTIVE") return null;

  const result = checkEligibility(course, await learnerRecord(userId, courseId));
  if (!result.eligible) return null;

  const [user, brand] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: userId } }), getBrand()]);
  const cert = await prisma.certificate.create({
    data: {
      code: certificateCode(),
      userId,
      courseId,
      learnerName: user.name,
      courseTitle: course.title,
      score: result.examScore,
      signedBy: brand.certificateSignatory,
      status: course.certRequireHumanApproval ? "PENDING_APPROVAL" : "VALID",
    },
  });
  await notify(userId, {
    type: "CERTIFICATE",
    title: course.certRequireHumanApproval ? "Certificat en cours de validation" : "Félicitations, votre certificat est disponible !",
    body: course.certRequireHumanApproval
      ? `Vous remplissez les critères de « ${course.title} ». Votre certificat sera délivré après validation par l'équipe pédagogique.`
      : `Vous avez obtenu le certificat de « ${course.title} ».`,
    link: "/espace/certificats",
    email: true,
  });
  return cert;
}
