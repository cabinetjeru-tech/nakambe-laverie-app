import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getBrand } from "../settings";
import { formatDate, formatXof } from "../format";

function safe(t: string) {
  return t.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ€]/g, "");
}

export async function invoicePdf(inv: {
  number: string;
  issuedAt: Date;
  order: { reference: string; itemLabel: string; subtotalXof: number; discountXof: number; totalXof: number; provider: string | null; mode: string; paidAt: Date | null; status: string; user: { name: string; email: string; phone: string | null } };
}) {
  const brand = await getBrand();
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.04, 0.14, 0.28);
  const text = (s: string, x: number, y: number, size = 10, font = f, color = rgb(0.1, 0.13, 0.2)) => page.drawText(safe(s), { x, y, size, font, color });
  page.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: navy });
  text(brand.name, 40, 805, 18, b, rgb(1, 1, 1));
  text(brand.address, 40, 788, 9, f, rgb(0.85, 0.9, 1));
  text(inv.order.mode === "DEMO" ? "FACTURE DE DÉMONSTRATION" : inv.order.status === "REFUNDED" ? "FACTURE (REMBOURSÉE)" : "FACTURE / REÇU", 40, 735, 16, b, navy);
  text(`N° ${inv.number}`, 40, 715, 11, b);
  text(`Date : ${formatDate(inv.issuedAt)}`, 40, 700);
  text(`Référence de commande : ${inv.order.reference}`, 40, 685);
  text("Client", 360, 715, 11, b);
  text(inv.order.user.name, 360, 700);
  text(inv.order.user.email, 360, 685);
  if (inv.order.user.phone) text(inv.order.user.phone, 360, 670);
  page.drawRectangle({ x: 40, y: 620, width: 515, height: 24, color: rgb(0.93, 0.95, 0.98) });
  text("Désignation", 50, 628, 10, b);
  text("Montant", 470, 628, 10, b);
  text(inv.order.itemLabel.slice(0, 80), 50, 600);
  text(formatXof(inv.order.subtotalXof), 470, 600);
  let y = 580;
  if (inv.order.discountXof > 0) {
    text("Remise (code promotionnel)", 50, y);
    text(`- ${formatXof(inv.order.discountXof)}`, 470, y);
    y -= 20;
  }
  page.drawLine({ start: { x: 40, y: y - 5 }, end: { x: 555, y: y - 5 }, color: rgb(0.8, 0.84, 0.9) });
  text("TOTAL PAYÉ", 350, y - 25, 12, b, navy);
  text(formatXof(inv.order.totalXof), 470, y - 25, 12, b, navy);
  text(`Moyen de paiement : ${inv.order.provider ?? "—"} · Payé le ${formatDate(inv.order.paidAt)}`, 40, y - 60, 9);
  text("Montants en francs CFA (XOF). Mentions fiscales (NIF/IFU, RCCM, TVA) : à compléter dans les paramètres selon votre statut.", 40, 80, 8, f, rgb(0.4, 0.45, 0.55));
  text(`${brand.promoter} - ${brand.email} - ${brand.phone}`, 40, 66, 8, f, rgb(0.4, 0.45, 0.55));
  if (inv.order.mode === "DEMO") text("DÉMONSTRATION - SANS VALEUR", 120, 420, 36, b, rgb(0.9, 0.3, 0.3));
  return doc.save();
}
