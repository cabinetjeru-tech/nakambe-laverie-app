import { describe, expect, it } from "vitest";
import { checkEligibility, type CertificateCriteria, type LearnerRecord } from "@/lib/certificates/eligibility";

const criteria: CertificateCriteria = { hasCertificate: true, certMinProgress: 100, certMinExamScore: 70, certRequireProjects: true, certMinAttendance: 50 };
const record: LearnerRecord = { progressPercent: 100, finalExams: [{ bestValidatedPercent: 80, passingScore: 70 }], projects: [{ passedAndGraded: true }], liveSessionsTotal: 2, liveSessionsAttended: 1 };

describe("critères du certificat", () => {
  it("éligible quand tous les critères sont remplis", () => expect(checkEligibility(criteria, record).eligible).toBe(true));
  it("progression insuffisante", () => expect(checkEligibility(criteria, { ...record, progressPercent: 90 }).eligible).toBe(false));
  it("examen final non validé (en attente de correction humaine)", () => expect(checkEligibility(criteria, { ...record, finalExams: [{ bestValidatedPercent: null, passingScore: 70 }] }).eligible).toBe(false));
  it("le seuil le plus exigeant s'applique", () => expect(checkEligibility({ ...criteria, certMinExamScore: 85 }, record).eligible).toBe(false));
  it("projet non validé", () => expect(checkEligibility(criteria, { ...record, projects: [{ passedAndGraded: false }] }).eligible).toBe(false));
  it("présence insuffisante", () => expect(checkEligibility(criteria, { ...record, liveSessionsAttended: 0 }).eligible).toBe(false));
  it("aucun certificat si la formation n'en délivre pas", () => expect(checkEligibility({ ...criteria, hasCertificate: false }, record).eligible).toBe(false));
});
