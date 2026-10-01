import { describe, expect, it } from "vitest";
import { casesCouvertes, couverture } from "@/lib/base/couverture";

describe("couverture de la base documentaire", () => {
  it("place les guides et programmes dans leurs cases, y compris les classes groupées", () => {
    const c = couverture([
      { classes: ["6e-5e"], disciplines: ["Français"], type: "GUIDE_PEDAGOGIQUE", statut: "A_VERIFIER" },
      { classes: ["6e", "5e"], disciplines: ["Histoire-Géographie"], type: "CURRICULUM", statut: "PROVISOIRE" },
      { classes: ["4e et 3e"], disciplines: ["Sciences physiques"], type: "CURRICULUM", statut: "ACTIF" },
    ]);
    expect(c["6e"].FR).toEqual({ guide: true, programme: false, attendu: false });
    expect(c["5e"].FR.guide).toBe(true);
    expect(c["5e"].HIST.programme && c["5e"].GEO.programme).toBe(true);
    expect(c["3e"].PHYS.programme).toBe(true);
    expect(c["4e"].FR.guide).toBe(false);
  });

  it("ignore les documents remplacés, archivés ou sans classe précise", () => {
    const c = couverture([
      { classes: ["6e"], disciplines: ["Mathématiques"], type: "GUIDE_PEDAGOGIQUE", statut: "ARCHIVE" },
      { classes: [], disciplines: ["Mathématiques"], type: "PROGRAMME", statut: "ACTIF" },
    ]);
    expect(casesCouvertes(c).couvertes).toBe(0);
  });

  it("signale les ressources attendues et gère le lycée", () => {
    const c = couverture(
      [{ classes: ["Tle"], disciplines: ["Philosophie"], type: "PROGRAMME", statut: "ACTIF" }],
      [{ classes: ["2nde"], disciplines: ["SVT"], type: "GUIDE_PEDAGOGIQUE" }],
    );
    expect(c.Terminale.PHILO.programme).toBe(true);
    expect(c["2nde"].SVT).toEqual({ guide: false, programme: false, attendu: true });
    expect(casesCouvertes(c).couvertes).toBe(1);
  });
});

describe("couverture du préscolaire et du primaire", () => {
  it("remplit la colonne « Toutes » pour un curriculum sans matière et gère les classes bilingues", () => {
    const c = couverture([
      { classes: ["CE1", "CE2"], disciplines: [], type: "CURRICULUM", statut: "A_VERIFIER" },
      { classes: ["Grande section"], disciplines: [], type: "CURRICULUM", statut: "A_VERIFIER" },
      { classes: ["Bilingue 2e année, Bilingue 3e année"], disciplines: ["Géographie"], type: "GUIDE_PEDAGOGIQUE", statut: "A_VERIFIER" },
      { classes: ["CP1"], disciplines: ["Exercices sensoriels"], type: "GUIDE_PEDAGOGIQUE", statut: "A_VERIFIER" },
    ]);
    expect(c.CE2.TOUT.programme).toBe(true);
    expect(c["Grande section"].TOUT.programme).toBe(true);
    expect(c["Bilingue 3e année"].GEO.guide).toBe(true);
    expect(c["Bilingue 2e année"].LN).toBeDefined();
    expect(c.CP1.SCI.guide).toBe(true);
    expect(c["3e"].GEO.guide).toBe(false);
  });
});
