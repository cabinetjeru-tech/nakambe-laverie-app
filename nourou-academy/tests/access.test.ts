import { describe, expect, it } from "vitest";
import { decideCourseAccess } from "@/lib/access";

const course = { trainerId: "t1", isFree: false, status: "PUBLISHED", includedInSubscription: true };
const base = { role: "LEARNER" as const, userId: "u1", course, hasActiveEnrollment: false, hasActiveSubscription: false };

describe("droits d'accès aux formations", () => {
  it("formation payante non achetée : refus", () => expect(decideCourseAccess(base)).toBe("none"));
  it("inscription active : accès", () => expect(decideCourseAccess({ ...base, hasActiveEnrollment: true })).toBe("enrollment"));
  it("abonnement actif et formation incluse", () => expect(decideCourseAccess({ ...base, hasActiveSubscription: true })).toBe("subscription"));
  it("abonnement actif mais formation exclue", () => expect(decideCourseAccess({ ...base, hasActiveSubscription: true, course: { ...course, includedInSubscription: false } })).toBe("none"));
  it("formation gratuite : réservée aux connectés", () => {
    expect(decideCourseAccess({ ...base, course: { ...course, isFree: true } })).toBe("free");
    expect(decideCourseAccess({ ...base, userId: null, role: null, course: { ...course, isFree: true } })).toBe("none");
  });
  it("formation non publiée : invisible même avec inscription", () => expect(decideCourseAccess({ ...base, hasActiveEnrollment: true, course: { ...course, status: "DRAFT" } })).toBe("none"));
  it("le formateur et l'équipe ont accès", () => {
    expect(decideCourseAccess({ ...base, userId: "t1", role: "TRAINER" })).toBe("trainer");
    expect(decideCourseAccess({ ...base, role: "ADMIN" })).toBe("staff");
  });
});
