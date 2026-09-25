import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "./db";
import { getBrand, getSecret, getTechnicalSettings } from "./settings";
import { env } from "./env";

/**
 * Envoi d'emails via SMTP (configurable dans l'administration).
 * Tous les emails passent par une file (EmailOutbox) : en cas de coupure ou de
 * serveur SMTP non configuré, ils restent en attente et sont renvoyés par la tâche
 * planifiée /api/cron/outbox. Aucun email n'est déclaré "envoyé" sans l'avoir été.
 */

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function renderEmail(title: string, paragraphs: string[], cta?: { label: string; href: string }) {
  const brand = await getBrand();
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.href.startsWith("http") ? cta.href : env.appUrl + cta.href)}" style="background:${brand.primaryColor};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#10213f">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:${brand.primaryColor};color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-weight:700;letter-spacing:.3px">${escapeHtml(brand.name)}</div>
<div style="background:#fff;padding:24px 22px;border-radius:0 0 12px 12px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}${button}
</div>
<p style="font-size:12px;color:#5b6b85;text-align:center;margin-top:16px">${escapeHtml(brand.name)} — ${escapeHtml(brand.slogan)}<br>${escapeHtml(brand.address)}</p>
</div></body></html>`;
}

export async function queueEmail(to: string, subject: string, html: string) {
  const row = await prisma.emailOutbox.create({ data: { to, subject, html } });
  // Tentative immédiate, sans bloquer l'appelant en cas d'échec.
  deliver(row.id).catch(() => undefined);
  return row;
}

async function transporter() {
  const tech = await getTechnicalSettings();
  if (!tech.smtpHost || !tech.smtpFrom) return null;
  const password = await getSecret("smtp.password");
  return {
    from: tech.smtpFrom,
    t: nodemailer.createTransport({
      host: tech.smtpHost,
      port: tech.smtpPort,
      secure: tech.smtpSecure,
      auth: tech.smtpUser ? { user: tech.smtpUser, pass: password || "" } : undefined,
    }),
  };
}

export async function deliver(id: string) {
  const row = await prisma.emailOutbox.findUnique({ where: { id } });
  if (!row || row.status === "SENT") return;
  const tr = await transporter();
  if (!tr) {
    if (!env.isProduction) console.info(`[mail] SMTP non configuré — email en attente pour ${row.to} : « ${row.subject} »`);
    await prisma.emailOutbox.update({ where: { id }, data: { error: "SMTP non configuré" } });
    return;
  }
  try {
    await tr.t.sendMail({ from: tr.from, to: row.to, subject: row.subject, html: row.html });
    await prisma.emailOutbox.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, error: null } });
  } catch (e) {
    const attempts = row.attempts + 1;
    await prisma.emailOutbox.update({
      where: { id },
      data: { attempts, error: (e as Error).message.slice(0, 500), status: attempts >= 8 ? "FAILED" : "PENDING" },
    });
  }
}

export async function flushOutbox(limit = 50) {
  const rows = await prisma.emailOutbox.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: limit });
  for (const r of rows) await deliver(r.id);
  return rows.length;
}
