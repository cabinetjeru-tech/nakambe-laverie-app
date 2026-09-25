import { describe, expect, it, beforeAll } from "vitest";
import { createHmac } from "node:crypto";

beforeAll(() => {
  process.env.SETTINGS_ENCRYPTION_KEY = "test-key";
  process.env.FILE_SIGNING_SECRET = "file-secret";
});

describe("chiffrement des secrets", async () => {
  const { decryptSecret, encryptSecret, maskSecret } = await import("@/lib/crypto");
  it("aller-retour AES-256-GCM, IV aléatoire", () => {
    const a = encryptSecret("sk-ant-123456");
    expect(a).not.toContain("sk-ant");
    expect(a).not.toBe(encryptSecret("sk-ant-123456"));
    expect(decryptSecret(a)).toBe("sk-ant-123456");
  });
  it("détecte une altération", () => {
    const a = encryptSecret("secret");
    const parts = a.split(":");
    parts[3] = Buffer.from("autre").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
  it("masque", () => expect(maskSecret("abcdefgh1234")).toBe("••••••1234"));
});

describe("URL signées des fichiers", async () => {
  const { signedFileUrl, verifyFileSignature } = await import("@/lib/storage");
  it("signature valide puis refus si modifiée ou expirée", () => {
    const url = new URL("http://x" + signedFileUrl("file1", { ttlSeconds: 60 }));
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    expect(verifyFileSignature("file1", exp, sig)).toBe(true);
    expect(verifyFileSignature("file2", exp, sig)).toBe(false);
    expect(verifyFileSignature("file1", String(Number(exp) + 10), sig)).toBe(false);
    expect(verifyFileSignature("file1", "1000", sig)).toBe(false);
  });
});

describe("signatures des webhooks de paiement", async () => {
  const { waveSignatureValid } = await import("@/lib/payments/providers/wave");
  const { cinetpayToken } = await import("@/lib/payments/providers/cinetpay");
  it("Wave : HMAC valide, rejet si corps modifié ou horodatage ancien", () => {
    const body = JSON.stringify({ data: { client_reference: "NGA1" } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec").update(`${t}${body}`).digest("hex");
    expect(waveSignatureValid(`t=${t},v1=${sig}`, body, "whsec")).toBe(true);
    expect(waveSignatureValid(`t=${t},v1=${sig}`, body + " ", "whsec")).toBe(false);
    const old = t - 3600;
    const oldSig = createHmac("sha256", "whsec").update(`${old}${body}`).digest("hex");
    expect(waveSignatureValid(`t=${old},v1=${oldSig}`, body, "whsec")).toBe(false);
    expect(waveSignatureValid(null, body, "whsec")).toBe(false);
  });
  it("CinetPay : jeton HMAC calculé sur les champs dans l'ordre documenté", () => {
    const f = new URLSearchParams({ cpm_site_id: "123", cpm_trans_id: "NGA1", cpm_amount: "25000", cpm_currency: "XOF" });
    const expected = createHmac("sha256", "sec").update("123NGA125000XOF").digest("hex");
    expect(cinetpayToken(f, "sec")).toBe(expected);
  });
});

describe("rendu Markdown sûr", async () => {
  const { renderMarkdown } = await import("@/lib/markdown");
  it("échappe le HTML et refuse les liens javascript:", () => {
    const html = renderMarkdown('<script>alert(1)</script> [clic](javascript:alert(1)) <img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript');
  });
  it("rend titres, listes, gras et citations de sources", () => {
    const html = renderMarkdown("## Titre\n- **un**\n- deux [S1]");
    expect(html).toContain("<h3>Titre</h3>");
    expect(html).toContain("<strong>un</strong>");
    expect(html).toContain('<sup class="cite">S1</sup>');
  });
});

describe("validation des fichiers téléversés", async () => {
  const { detectFileType, validateUpload } = await import("@/lib/uploads");
  it("reconnaît un PDF par sa signature, refuse un exécutable renommé", () => {
    expect(detectFileType(Buffer.from("%PDF-1.7 ..."), "a.pdf")?.mime).toBe("application/pdf");
    expect(validateUpload(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), "cours.pdf", "document", 1e6).ok).toBe(false);
  });
  it("refuse un fichier trop volumineux", () => {
    expect(validateUpload(Buffer.alloc(2000, 65), "a.txt", "document", 1000).ok).toBe(false);
  });
});
