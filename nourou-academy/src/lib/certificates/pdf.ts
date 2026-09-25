import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
import { env } from "../env";
import { getBrand } from "../settings";
import { formatDate } from "../format";

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? ["", "0b", "24", "47"];
  return rgb(parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255);
}

// Les polices standard PDF (WinAnsi) ne couvrent pas tous les caractères : on les remplace proprement.
function safe(text: string) {
  return text.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ€]/g, "");
}

function centered(page: ReturnType<PDFDocument["addPage"]>, text: string, y: number, font: PDFFont, size: number, color = rgb(0.06, 0.13, 0.25)) {
  const t = safe(text);
  const w = font.widthOfTextAtSize(t, size);
  page.drawText(t, { x: (page.getWidth() - w) / 2, y, size, font, color });
}

export async function certificatePdf(c: {
  code: string;
  learnerName: string;
  courseTitle: string;
  issuedAt: Date;
  score: number | null;
  signedBy: string | null;
  status: string;
}): Promise<Uint8Array> {
  const brand = await getBrand();
  const primary = hexToRgb(brand.primaryColor);
  const accent = hexToRgb(brand.accentColor);
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificat ${c.code}`);
  doc.setAuthor(brand.name);
  const page = doc.addPage([842, 595]); // A4 paysage
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const { width, height } = page.getSize();

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 18, y: 18, width: width - 36, height: height - 36, borderColor: primary, borderWidth: 3 });
  page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56, borderColor: accent, borderWidth: 1 });
  page.drawRectangle({ x: 28, y: height - 110, width: width - 56, height: 82, color: primary });

  centered(page, brand.name, height - 65, bold, 24, rgb(1, 1, 1));
  centered(page, brand.slogan, height - 90, regular, 11, rgb(0.85, 0.9, 1));
  centered(page, "CERTIFICAT DE RÉUSSITE", height - 160, bold, 26, primary);
  centered(page, "Ce certificat atteste que", height - 200, regular, 13);
  centered(page, c.learnerName, height - 245, serif, 34, primary);
  centered(page, "a suivi avec succès et validé la formation", height - 280, regular, 13);
  centered(page, c.courseTitle, height - 315, bold, 18, primary);
  centered(
    page,
    `Délivré le ${formatDate(c.issuedAt)}${c.score !== null ? ` - Résultat à l'examen final : ${c.score} %` : ""}`,
    height - 350,
    regular,
    11,
  );

  // Signature
  page.drawLine({ start: { x: 110, y: 120 }, end: { x: 330, y: 120 }, color: primary, thickness: 1 });
  page.drawText(safe(c.signedBy || brand.certificateSignatory), { x: 110, y: 104, size: 11, font: bold, color: primary });
  page.drawText(safe(brand.certificateSignatoryTitle), { x: 110, y: 90, size: 9, font: regular, color: rgb(0.3, 0.35, 0.45) });
  page.drawText("Validation numérique - vérifiable en ligne", { x: 110, y: 76, size: 8, font: regular, color: rgb(0.4, 0.45, 0.55) });

  // QR code de vérification
  const verifyUrl = `${env.appUrl}/verifier-certificat/${encodeURIComponent(c.code)}`;
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 240, color: { dark: "#0B2447", light: "#FFFFFF" } });
  const qrImg = await doc.embedPng(qr);
  page.drawImage(qrImg, { x: width - 190, y: 62, width: 95, height: 95 });
  page.drawText(safe(`ID : ${c.code}`), { x: width - 250, y: 48, size: 9, font: bold, color: primary });
  page.drawText(safe(verifyUrl.replace(/^https?:\/\//, "")), { x: 42, y: 44, size: 7, font: regular, color: rgb(0.4, 0.45, 0.55) });

  page.drawText(
    safe("Attestation de formation professionnelle délivrée par l'académie. Ce document n'est pas un diplôme d'État."),
    { x: 42, y: 34, size: 7, font: regular, color: rgb(0.4, 0.45, 0.55) },
  );

  if (c.status !== "VALID") {
    centered(page, c.status === "REVOKED" ? "CERTIFICAT RÉVOQUÉ" : "EN ATTENTE DE VALIDATION", height / 2 - 20, bold, 40, rgb(0.85, 0.2, 0.2));
  }
  return doc.save();
}
