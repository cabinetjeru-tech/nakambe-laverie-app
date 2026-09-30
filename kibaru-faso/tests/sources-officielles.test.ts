import { describe, expect, it } from "vitest";
import { hoteOfficiel } from "../src/lib/base/sources-officielles";

describe("import depuis les sites officiels", () => {
  it("n'accepte que les sites du ministère et de Faso e-education", () => {
    expect(hoteOfficiel("https://www.education.gov.bf/fileadmin/user_upload/storages/espace_enseignant/guide_maths_6e.pdf")).toBe(true);
    expect(hoteOfficiel("https://fasoeducation.bf/espace_enseignants/reforme_curriculaire/curricula_postprimaire/mathematiques/curricula_maths_6e.pdf")).toBe(true);
    expect(hoteOfficiel("https://education.gov.bf.pirate.com/x.pdf")).toBe(false);
    expect(hoteOfficiel("https://faux-education.gov.bf.example/x.pdf")).toBe(false);
    expect(hoteOfficiel("http://169.254.169.254/latest")).toBe(false);
    expect(hoteOfficiel("file:///etc/passwd")).toBe(false);
    expect(hoteOfficiel("pas une url")).toBe(false);
  });
});
