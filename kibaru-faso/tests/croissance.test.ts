import { describe, expect, it } from "vitest";
import { accepteCreditPass, codeLicenceValide, estPass, messageLicence, nouveauCodeLicence, passesDeductibles, prixApresCredit, statsAmbassadeur, tauxPour } from "@/lib/abonnement";

const maintenant = new Date("2026-10-10T12:00:00Z");
const ilYa = (jours: number) => new Date(maintenant.getTime() - jours * 86_400_000).toISOString();

describe("pass 24 h déduit de l'annuel", () => {
  it("ne retient que les pass de moins de 7 jours, jamais déduits", () => {
    const passes = [
      { id: "a", montant_fcfa: 500, cree_le: ilYa(1), deduit_par: null },
      { id: "b", montant_fcfa: 500, cree_le: ilYa(6.9), deduit_par: null },
      { id: "c", montant_fcfa: 500, cree_le: ilYa(8), deduit_par: null },
      { id: "d", montant_fcfa: 500, cree_le: ilYa(2), deduit_par: "x" },
    ];
    expect(passesDeductibles(passes, maintenant).map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("déduit le crédit en restant payable par mobile money", () => {
    expect(prixApresCredit(30000, 500)).toBe(29500);
    expect(prixApresCredit(28500, 1000)).toBe(27500);
    expect(prixApresCredit(30000, 0)).toBe(30000);
    expect(prixApresCredit(300, 500)).toBe(100);
  });
  it("s'applique du pass vers l'annuel uniquement", () => {
    expect(estPass(1)).toBe(true);
    expect(estPass(30)).toBe(false);
    expect(accepteCreditPass(365)).toBe(true);
    expect(accepteCreditPass(30)).toBe(false);
  });
});

describe("licences établissement", () => {
  it("génère et valide des codes lisibles", () => {
    for (let i = 0; i < 50; i++) expect(codeLicenceValide(nouveauCodeLicence())).not.toBeNull();
    expect(codeLicenceValide(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(codeLicenceValide("ABCDEFG0")).toBeNull();
  });
  it("traduit les erreurs de réservation", () => {
    expect(messageLicence("LICENCE_COMPLETE")).toContain("places");
    expect(messageLicence("autre")).toContain("Réessayez");
  });
});

describe("ambassadeurs", () => {
  it("applique le taux de l'ambassadeur actif", () => {
    expect(tauxPour({ actif: true, taux: "15.00" }, 10)).toBe(15);
    expect(tauxPour({ actif: false, taux: 15 }, 10)).toBe(10);
    expect(tauxPour({ actif: true, taux: null }, 10)).toBe(10);
    expect(tauxPour(null, 10)).toBe(10);
  });
  it("calcule inscriptions, conversions et ventes du mois", () => {
    const debutMois = new Date("2026-10-01T00:00:00Z");
    const s = statsAmbassadeur(
      [
        { id: "f1", cree_le: "2026-09-20T00:00:00Z" },
        { id: "f2", cree_le: "2026-10-03T00:00:00Z" },
        { id: "f3", cree_le: "2026-10-05T00:00:00Z" },
        { id: "f4", cree_le: "2026-10-06T00:00:00Z" },
      ],
      [
        { utilisateur_id: "f1", montant_fcfa: 30000, cree_le: "2026-09-25T00:00:00Z" },
        { utilisateur_id: "f2", montant_fcfa: 500, cree_le: "2026-10-04T00:00:00Z" },
        { utilisateur_id: "f2", montant_fcfa: 29500, cree_le: "2026-10-06T00:00:00Z" },
        { utilisateur_id: "autre", montant_fcfa: 7500, cree_le: "2026-10-06T00:00:00Z" },
      ],
      debutMois,
    );
    expect(s).toEqual({ inscrits: 4, inscritsMois: 3, payeurs: 2, conversion: 50, ventes: 60000, ventesMois: 30000, payeursMois: 1 });
  });
});
