/**
 * Test de bout en bout sur un serveur en marche (données de démonstration chargées).
 *   E2E_BASE_URL=http://localhost:3000 npx vitest run --config vitest.e2e.config.mts
 * Crée des sessions de test directement en base (équivalent d'une connexion).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
const tokens: string[] = [];

async function sessionFor(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  tokens.push(createHash("sha256").update(token).digest("hex"));
  await prisma.session.create({ data: { userId: user.id, tokenHash: tokens[tokens.length - 1]!, expiresAt: new Date(Date.now() + 3600_000) } });
  return `nga_session=${token}`;
}

const get = (path: string, cookie?: string) => fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });

let learner = "";
let admin = "";
beforeAll(async () => {
  learner = await sessionFor("apprenant@demo.nourou-academy.local");
  admin = await sessionFor(process.env.SEED_ADMIN_EMAIL ?? "admin@nourou-academy.local");
});
afterAll(async () => {
  await prisma.session.deleteMany({ where: { tokenHash: { in: tokens } } });
  await prisma.$disconnect();
});

describe("site public", () => {
  it.each(["/", "/formations", "/formations/marketing-digital-pme-africaines", "/tarifs", "/faq", "/blog", "/tuteur-ia", "/formateurs", "/temoignages", "/contact", "/verifier-certificat", "/hors-ligne", "/manifest.webmanifest", "/sw.js"])("%s répond 200", async (p) => {
    expect((await get(p)).status).toBe(200);
  });
  it("recherche dans le catalogue", async () => {
    const html = await (await get("/formations?q=excel")).text();
    expect(html).toContain("Excel pour la gestion quotidienne");
    expect(html).not.toContain("Photographie produit");
  });
  it("certificat inconnu", async () => {
    expect(await (await get("/verifier-certificat/NGA-0000-XXXXX-XXXXX")).text()).toContain("Certificat introuvable");
  });
  it("en-têtes de sécurité", async () => {
    const r = await get("/");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });
});

describe("contrôle d'accès", () => {
  it("espace privé sans session → connexion", async () => {
    const r = await get("/espace");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("/connexion");
  });
  it("apprenant : accès au tableau de bord, refus de l'administration", async () => {
    expect((await get("/espace", learner)).status).toBe(200);
    const r = await get("/admin", learner);
    expect([307, 303, 302]).toContain(r.status);
    expect(r.headers.get("location")).toContain("/acces-refuse");
  });
  it("leçon payante non achetée : contenu masqué", async () => {
    const lesson = await prisma.lesson.findFirstOrThrow({ where: { title: "Configurer WhatsApp Business comme un pro" } });
    const html = await (await get(`/espace/apprendre/marketing-digital-pme-africaines/${lesson.id}`, learner)).text();
    expect(html).toContain("Leçon réservée aux inscrits");
    expect(html).not.toContain("Réponses rapides");
  });
  it("leçon d'aperçu gratuite visible", async () => {
    const lesson = await prisma.lesson.findFirstOrThrow({ where: { title: "Connaître son client idéal" } });
    const html = await (await get(`/espace/apprendre/marketing-digital-pme-africaines/${lesson.id}`, learner)).text();
    expect(html).toContain("client idéal");
    expect(html).not.toContain("Leçon réservée aux inscrits");
  });
  it("progression refusée sur une leçon payante, acceptée sur une formation gratuite suivie", async () => {
    const paid = await prisma.lesson.findFirstOrThrow({ where: { title: "Configurer WhatsApp Business comme un pro" } });
    const free = await prisma.lesson.findFirstOrThrow({ where: { title: "Les bons usages au travail" } });
    const post = (lessonId: string) => fetch(`${BASE}/api/progress`, { method: "POST", headers: { cookie: learner, "content-type": "application/json" }, body: JSON.stringify({ lessonId, position: 42 }) });
    expect((await post(paid.id)).status).toBe(403);
    expect((await post(free.id)).status).toBe(200);
  });
  it("fichier privé sans signature refusé", async () => {
    const f = await prisma.storedFile.create({ data: { key: `tests/${randomBytes(6).toString("hex")}.pdf`, originalName: "x.pdf", mimeType: "application/pdf", size: 1, visibility: "PRIVATE" } });
    try {
      expect((await get(`/api/files/${f.id}`, learner)).status).toBe(403);
      expect((await get(`/api/files/${f.id}?exp=9999999999&sig=faux`)).status).toBe(403);
    } finally {
      await prisma.storedFile.delete({ where: { id: f.id } });
    }
  });
  it("administrateur : pages d'administration accessibles", async () => {
    for (const p of ["/admin", "/admin/utilisateurs", "/admin/formations", "/admin/transactions", "/admin/parametres?onglet=ia", "/admin/rapports", "/formateur", "/formateur/assistant-ia"]) {
      expect((await get(p, admin)).status, p).toBe(200);
    }
  });
  it("les secrets ne sont jamais renvoyés dans les pages", async () => {
    const html = await (await get("/admin/parametres?onglet=paiements", admin)).text();
    expect(html).not.toMatch(/sk-(ant|proj)-[A-Za-z0-9]{10,}/);
  });
});

describe("paiements", () => {
  it("webhook non signé rejeté", async () => {
    const r = await fetch(`${BASE}/api/payments/webhook/wave`, { method: "POST", body: JSON.stringify({ data: { client_reference: "NGA-FAUX" } }), headers: { "content-type": "application/json" } });
    expect(r.status).toBe(400);
  });
  it("prestataire inconnu", async () => {
    expect((await fetch(`${BASE}/api/payments/webhook/demo`, { method: "POST", body: "{}" })).status).toBe(404);
  });
  it("tâches planifiées protégées par secret", async () => {
    expect((await fetch(`${BASE}/api/cron/all`, { method: "POST" })).status).toBe(401);
  });
});

describe("tuteur IA", () => {
  it("exige une session", async () => {
    const fd = new FormData();
    fd.set("message", "Bonjour");
    expect((await fetch(`${BASE}/api/tutor/chat`, { method: "POST", body: fd })).status).toBe(401);
  });
  it("répond (ou signale clairement l'absence de configuration) avec un flux NDJSON", async () => {
    const fd = new FormData();
    fd.set("message", "Comment calculer le seuil de rentabilité ?");
    const r = await fetch(`${BASE}/api/tutor/chat`, { method: "POST", body: fd, headers: { cookie: learner } });
    if (r.status === 503) {
      expect((await r.json()).error).toContain("configur");
      return;
    }
    expect(r.status).toBe(200);
    const lines = (await r.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string; message?: string; citations?: unknown[] });
    expect(lines[0]!.type).toBe("meta");
    const last = lines[lines.length - 1]!;
    expect(["done", "error"]).toContain(last.type);
  });
});
