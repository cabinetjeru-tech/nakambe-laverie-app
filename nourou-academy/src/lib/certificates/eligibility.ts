/**
 * Critères d'obtention du certificat — fonction pure (testée).
 * L'IA n'intervient jamais dans l'attribution : seuls les critères définis par
 * le formateur et les résultats validés sont pris en compte.
 */
export type CertificateCriteria = {
  hasCertificate: boolean;
  certMinProgress: number;
  certMinExamScore: number;
  certRequireProjects: boolean;
  certMinAttendance: number;
};

export type LearnerRecord = {
  progressPercent: number;
  finalExams: { bestValidatedPercent: number | null; passingScore: number }[];
  projects: { passedAndGraded: boolean }[];
  liveSessionsTotal: number;
  liveSessionsAttended: number;
};

export type Eligibility = { eligible: boolean; checks: { label: string; ok: boolean; detail: string }[]; examScore: number | null };

export function checkEligibility(c: CertificateCriteria, r: LearnerRecord): Eligibility {
  const checks: Eligibility["checks"] = [];
  if (!c.hasCertificate) return { eligible: false, checks: [{ label: "Certificat", ok: false, detail: "Cette formation ne délivre pas de certificat." }], examScore: null };

  checks.push({
    label: "Progression",
    ok: r.progressPercent >= c.certMinProgress,
    detail: `${r.progressPercent} % / ${c.certMinProgress} % requis`,
  });

  let examScore: number | null = null;
  if (r.finalExams.length > 0) {
    const threshold = (e: { passingScore: number }) => Math.max(e.passingScore, c.certMinExamScore);
    const allOk = r.finalExams.every((e) => e.bestValidatedPercent !== null && e.bestValidatedPercent >= threshold(e));
    const scores = r.finalExams.map((e) => e.bestValidatedPercent ?? 0);
    examScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    checks.push({
      label: "Examen final",
      ok: allOk,
      detail: r.finalExams.map((e) => (e.bestValidatedPercent === null ? "non validé" : `${e.bestValidatedPercent} % (min ${threshold(e)} %)`)).join(", "),
    });
  }

  if (c.certRequireProjects) {
    const ok = r.projects.length > 0 && r.projects.every((p) => p.passedAndGraded);
    checks.push({
      label: "Projets pratiques",
      ok,
      detail: r.projects.length === 0 ? "Aucun projet défini" : `${r.projects.filter((p) => p.passedAndGraded).length}/${r.projects.length} validé(s)`,
    });
  }

  if (c.certMinAttendance > 0) {
    const pct = r.liveSessionsTotal > 0 ? Math.round((r.liveSessionsAttended / r.liveSessionsTotal) * 100) : 100;
    checks.push({ label: "Présence aux classes virtuelles", ok: pct >= c.certMinAttendance, detail: `${pct} % / ${c.certMinAttendance} % requis` });
  }

  return { eligible: checks.every((x) => x.ok), checks, examScore };
}
