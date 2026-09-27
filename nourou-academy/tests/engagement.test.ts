import { describe, expect, it } from "vitest";
import { fillNudgeTemplate } from "@/lib/engagement-template";

describe("fillNudgeTemplate", () => {
  it("remplace le prénom, la formation et la progression", () => {
    expect(fillNudgeTemplate("Bonjour {prenom}, {progression} % de « {formation} » ({prenom})", { name: "Awa Ouédraogo", course: "Excel", progress: 40 }))
      .toBe("Bonjour Awa, 40 % de « Excel » (Awa)");
  });
  it("laisse le texte intact sans variables", () => {
    expect(fillNudgeTemplate("Reprenez votre formation.", { name: "Moussa", course: "X", progress: 0 })).toBe("Reprenez votre formation.");
  });
});
