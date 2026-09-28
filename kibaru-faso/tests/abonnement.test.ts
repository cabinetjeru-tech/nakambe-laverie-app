import { describe, expect, it } from "vitest";
import { finAbonnement, formatFcfa, joursRestants, nouvellePeriode, nouvelleTransaction, prixValide, statutCinetpay } from "@/lib/abonnement";

const J = 86_400_000;
const now = new Date("2026-10-01T10:00:00Z");

describe("Abonnements", () => {
  it("démarre maintenant quand il n'y a pas d'abonnement en cours", () => {
    const p = nouvellePeriode(now, null, 30);
    expect(p.debut).toEqual(now);
    expect(p.fin.getTime() - now.getTime()).toBe(30 * J);
    expect(nouvellePeriode(now, new Date(now.getTime() - 5 * J), 30).debut).toEqual(now);
  });
  it("prolonge un abonnement en cours sans perdre de jours", () => {
    const fin = new Date(now.getTime() + 10 * J);
    const p = nouvellePeriode(now, fin, 365);
    expect(p.debut).toEqual(fin);
    expect(joursRestants(p.fin, now)).toBe(375);
  });
  it("retient la fin la plus lointaine", () => {
    expect(finAbonnement([])).toBeNull();
    expect(finAbonnement([{ fin: "2026-10-05T00:00:00Z" }, { fin: "2026-12-01T00:00:00Z" }, { fin: "bad" }])?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
  it("compte les jours restants", () => {
    expect(joursRestants(null, now)).toBe(0);
    expect(joursRestants(new Date(now.getTime() - 1), now)).toBe(0);
    expect(joursRestants(new Date(now.getTime() + 1.2 * J), now)).toBe(2);
  });
});

describe("Paiement", () => {
  it("valide les montants mobile money (FCFA, multiples de 5)", () => {
    expect(prixValide(2000)).toBe(true);
    expect(prixValide(15000)).toBe(true);
    expect(prixValide(2002)).toBe(false);
    expect(prixValide(50)).toBe(false);
    expect(prixValide(1999.5)).toBe(false);
  });
  it("traduit les statuts CinetPay", () => {
    expect(statutCinetpay("ACCEPTED")).toBe("reussi");
    expect(statutCinetpay("REFUSED")).toBe("echoue");
    expect(statutCinetpay("CANCELED")).toBe("annule");
    expect(statutCinetpay("WAITING_FOR_CUSTOMER")).toBe("en_attente");
    expect(statutCinetpay(undefined)).toBe("en_attente");
  });
  it("produit des identifiants de transaction uniques et acceptés par les routes", () => {
    const ids = new Set(Array.from({ length: 200 }, () => nouvelleTransaction()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{6,64}$/);
  });
  it("formate les montants", () => {
    expect(formatFcfa(15000)).toBe("15 000 FCFA");
  });
});
