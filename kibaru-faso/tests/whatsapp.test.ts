import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decouper, demandeHumain, extraireRelais, messagesRecus, signatureValide, versWhatsApp } from "@/lib/whatsapp/meta";

describe("WhatsApp — notifications Meta", () => {
  it("vérifie la signature HMAC du corps brut", () => {
    const corps = '{"entry":[]}';
    const sig = `sha256=${createHmac("sha256", "secret").update(corps).digest("hex")}`;
    expect(signatureValide(corps, sig, "secret")).toBe(true);
    expect(signatureValide(corps + " ", sig, "secret")).toBe(false);
    expect(signatureValide(corps, sig, "autre")).toBe(false);
    expect(signatureValide(corps, null, "secret")).toBe(false);
    expect(signatureValide(corps, sig, undefined)).toBe(false);
  });

  it("extrait les messages texte et signale les autres types", () => {
    const charge = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                contacts: [{ wa_id: "22670000001", profile: { name: "Awa" } }],
                messages: [
                  { id: "wamid.1", from: "22670000001", timestamp: "1760000000", type: "text", text: { body: " Combien coûte l'abonnement ? " } },
                  { id: "wamid.2", from: "22670000001", timestamp: "1760000001", type: "audio" },
                ],
              },
            },
            { field: "messages", value: { statuses: [{ id: "x" }] } },
          ],
        },
      ],
    };
    const m = messagesRecus(charge);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ id: "wamid.1", de: "22670000001", nom: "Awa", texte: "Combien coûte l'abonnement ?", type: "text" });
    expect(m[1]).toMatchObject({ texte: null, type: "audio" });
    expect(messagesRecus(null)).toEqual([]);
  });
});

describe("WhatsApp — réponses", () => {
  it("convertit le gras Markdown et découpe les longs messages", () => {
    expect(versWhatsApp("**Annuel** : 30 000 FCFA\n## Tarifs")).toBe("*Annuel* : 30 000 FCFA\n*Tarifs*");
    const parts = decouper(["a".repeat(3000), "b".repeat(3000)].join("\n\n"), 3800);
    expect(parts).toHaveLength(2);
    expect(decouper("x".repeat(9000), 3800)).toHaveLength(3);
  });

  it("repère le passage de relais demandé par l'agent", () => {
    expect(extraireRelais("Je transmets à un conseiller. [CONSEILLER: paiement non activé]")).toEqual({ texte: "Je transmets à un conseiller.", relais: true, motif: "paiement non activé" });
    expect(extraireRelais("L'annuel coûte 30 000 FCFA.")).toEqual({ texte: "L'annuel coûte 30 000 FCFA.", relais: false, motif: null });
  });

  it("reconnaît une demande explicite de conseiller", () => {
    expect(demandeHumain("Je veux parler à un conseiller svp")).toBe(true);
    expect(demandeHumain("Puis-je joindre quelqu'un ?")).toBe(true);
    expect(demandeHumain("Comment payer avec Orange Money ?")).toBe(false);
  });
});
