import { describe, expect, it } from "vitest";
import { echapper, emailBienvenue, emailCommission, emailFinEssai, emailPaiement, emailRappelFin } from "../src/lib/email/modeles";

describe("e-mails automatiques", () => {
  it("échappe le HTML (nom saisi par l'enseignant)", () => {
    expect(echapper('<script>"x"&')).toBe("&lt;script&gt;&quot;x&quot;&amp;");
    const m = emailBienvenue({ nom: "<b>Awa</b>", site: "https://s", lienParrainage: "https://s/decouvrir?parrain=ABC234" });
    expect(m.html).not.toContain("<b>Awa</b>");
    expect(m.html).toContain("&lt;b&gt;Awa&lt;/b&gt;");
  });

  it("bienvenue : essai, lien de parrainage, version texte sans balises", () => {
    const m = emailBienvenue({ nom: "Awa", site: "https://s", lienParrainage: "https://s/decouvrir?parrain=ABC234", essaiFin: new Date("2026-10-01T10:00:00Z") });
    expect(m.sujet).toMatch(/Bienvenue/);
    expect(m.html).toContain("<strong>24 h d'essai gratuit</strong>");
    expect(m.texte).toContain("Bonjour Awa,");
    expect(m.texte).toContain("parrain=ABC234");
    expect(m.texte).not.toMatch(/<|\*\*/);
  });

  it("paiement : montant, date de fin et lien du reçu", () => {
    const m = emailPaiement({ nom: null, formule: "Mensuel", montant: 2000, fin: new Date("2026-10-29T12:00:00Z"), lienRecu: "https://s/recu/PIA1", site: "https://s" });
    expect(m.sujet).toContain("2 000 FCFA");
    expect(m.texte).toContain("Bonjour,");
    expect(m.texte).toContain("29 octobre 2026");
    expect(m.html).toContain('href="https://s/recu/PIA1"');
  });

  it("commission, fin d'essai avec code promo, rappel de fin", () => {
    expect(emailCommission({ nom: "Issa", montant: 400, filleul: "Awa", totalDu: 1200, site: "https://s" }).texte).toContain("1 200 FCFA");
    const f = emailFinEssai({ site: "https://s", prix: { journalier: 200, mensuel: 2000, annuel: 15000 }, promo: { code: "LANCEMENT", remise_pct: 25 } });
    expect(f.texte).toContain("200 FCFA la journée");
    expect(f.texte).toContain("LANCEMENT");
    expect(emailRappelFin({ fin: new Date("2026-10-02T00:00:00Z"), jours: 1, site: "https://s" }).sujet).toContain("demain");
    expect(emailRappelFin({ fin: new Date("2026-10-04T00:00:00Z"), jours: 3, site: "https://s" }).sujet).toContain("dans 3 jours");
  });
});
