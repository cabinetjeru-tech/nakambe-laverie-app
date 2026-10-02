import { describe, expect, it } from "vitest";
import { liensPartage } from "@/components/partage-reseaux";

describe("liens de partage", () => {
  it("encode le lien pour WhatsApp et Facebook", () => {
    const l = liensPartage("https://pedagogue-ia.vercel.app/decouvrir?parrain=K7M2QX", "Essayez PÉDAGOGUE.IA :");
    expect(l.whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent("Essayez PÉDAGOGUE.IA : https://pedagogue-ia.vercel.app/decouvrir?parrain=K7M2QX")}`);
    expect(l.facebook).toBe("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fpedagogue-ia.vercel.app%2Fdecouvrir%3Fparrain%3DK7M2QX");
    expect(l.tiktok).toContain("tiktok.com");
  });
});
