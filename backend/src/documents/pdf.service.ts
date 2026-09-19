import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';

export interface DocumentLineItem {
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface DocumentData {
  docType: 'DEVIS' | 'FACTURE' | 'REÇU';
  docNumber: string;
  date: Date;
  clientName: string;
  clientPhone: string;
  clientAddress?: string;
  items: DocumentLineItem[];
  subtotal: number;
  discount: number;
  total: number;
  deposit?: number;
  balanceDue?: number;
  validUntil?: Date;
  conditions?: string;
  extraNote?: string;
}

const BLUE = rgb(0.06, 0.28, 0.64);
const GOLD = rgb(0.85, 0.65, 0.13);
const GRAY = rgb(0.35, 0.35, 0.35);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);

function formatFcfa(amount: number): string {
  // toLocaleString('fr-FR') insère une espace insécable (U+202F) que la police
  // standard WinAnsi de pdf-lib ne sait pas encoder : on la remplace par une espace normale.
  const formatted = Math.round(amount)
    .toLocaleString('fr-FR')
    .replace(/[  ]/g, ' ');
  return `${formatted} FCFA`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}

@Injectable()
export class PdfService {
  constructor(private config: ConfigService) {}

  async generateDocument(data: DocumentData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const margin = 40;
    let y = 800;

    const companyName = this.config.get<string>('COMPANY_NAME') ?? 'NAKAMBÉ LAVERIE EXPRES ET DIGITALE';
    const companySlogan = this.config.get<string>('COMPANY_SLOGAN') ?? 'La propreté qui vient à vous';
    const companyAddress = this.config.get<string>('COMPANY_ADDRESS') ?? '';
    const phone1 = this.config.get<string>('COMPANY_PHONE_1') ?? '';
    const phone2 = this.config.get<string>('COMPANY_PHONE_2') ?? '';

    // ---- En-tête ----
    page.drawText(companyName, { x: margin, y, size: 16, font: boldFont, color: BLUE });
    y -= 18;
    page.drawText(companySlogan, { x: margin, y, size: 10, font, color: GOLD });
    y -= 16;
    page.drawText(companyAddress, { x: margin, y, size: 9, font, color: GRAY });
    y -= 12;
    page.drawText(`Tél : ${phone1} / ${phone2}`, { x: margin, y, size: 9, font, color: GRAY });

    // Bloc titre document (à droite)
    page.drawText(data.docType, { x: 400, y: 800, size: 18, font: boldFont, color: BLUE });
    page.drawText(`N° ${data.docNumber}`, { x: 400, y: 782, size: 10, font, color: GRAY });
    page.drawText(`Date : ${formatDate(data.date)}`, { x: 400, y: 768, size: 10, font, color: GRAY });
    if (data.validUntil) {
      page.drawText(`Valable jusqu'au : ${formatDate(data.validUntil)}`, {
        x: 400,
        y: 754,
        size: 9,
        font,
        color: GRAY,
      });
    }

    y -= 30;
    page.drawLine({ start: { x: margin, y }, end: { x: 555, y }, thickness: 1.5, color: GOLD });
    y -= 24;

    // ---- Bloc client ----
    page.drawText('Client', { x: margin, y, size: 10, font: boldFont, color: BLUE });
    y -= 14;
    page.drawText(data.clientName, { x: margin, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 14;
    page.drawText(`Tél : ${data.clientPhone}`, { x: margin, y, size: 9, font, color: GRAY });
    if (data.clientAddress) {
      y -= 12;
      page.drawText(data.clientAddress, { x: margin, y, size: 9, font, color: GRAY });
    }

    y -= 28;

    // ---- Tableau des prestations ----
    const colX = { label: margin, qty: 340, unit: 400, total: 480 };
    page.drawRectangle({ x: margin, y: y - 4, width: 555 - margin, height: 20, color: BLUE });
    page.drawText('Description', { x: colX.label + 4, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText('Qté', { x: colX.qty, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText('P.U.', { x: colX.unit, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText('Total', { x: colX.total, y: y + 2, size: 9, font: boldFont, color: rgb(1, 1, 1) });
    y -= 22;

    let rowIndex = 0;
    for (const item of data.items) {
      if (y < 120) {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = 800;
      }
      if (rowIndex % 2 === 0) {
        page.drawRectangle({ x: margin, y: y - 4, width: 555 - margin, height: 18, color: LIGHT_GRAY });
      }
      page.drawText(this.truncate(item.label, 55), { x: colX.label + 4, y, size: 9, font, color: rgb(0, 0, 0) });
      page.drawText(String(item.quantity), { x: colX.qty, y, size: 9, font, color: rgb(0, 0, 0) });
      page.drawText(formatFcfa(item.unitPrice), { x: colX.unit, y, size: 9, font, color: rgb(0, 0, 0) });
      page.drawText(formatFcfa(item.total), { x: colX.total, y, size: 9, font, color: rgb(0, 0, 0) });
      y -= 18;
      rowIndex++;
    }

    y -= 14;
    page.drawLine({ start: { x: 340, y }, end: { x: 555, y }, thickness: 0.5, color: GRAY });
    y -= 16;

    y = this.drawTotalLine(page, font, y, 'Sous-total', data.subtotal);
    if (data.discount) y = this.drawTotalLine(page, font, y, 'Réduction', -data.discount);
    y -= 4;
    y = this.drawTotalLine(page, boldFont, y, 'Montant net', data.total, true);
    if (data.deposit) {
      y = this.drawTotalLine(page, font, y, 'Acompte versé', data.deposit);
      y = this.drawTotalLine(
        page,
        boldFont,
        y,
        'Reste à payer',
        data.balanceDue ?? data.total - data.deposit,
        true,
      );
    }

    y -= 30;
    if (data.conditions) {
      page.drawText('Conditions :', { x: margin, y, size: 9, font: boldFont, color: GRAY });
      y -= 12;
      page.drawText(this.truncate(data.conditions, 100), { x: margin, y, size: 9, font, color: GRAY });
      y -= 20;
    }
    if (data.extraNote) {
      page.drawText(data.extraNote, { x: margin, y, size: 9, font, color: GRAY });
    }

    page.drawText('Merci de votre confiance — NAKAMBÉ, la propreté qui vient à vous.', {
      x: margin,
      y: 40,
      size: 8,
      font,
      color: GOLD,
    });

    return pdfDoc.save();
  }

  private drawTotalLine(
    page: PDFPage,
    font: PDFFont,
    y: number,
    label: string,
    amount: number,
    emphasize = false,
  ): number {
    page.drawText(label, { x: 400, y, size: emphasize ? 11 : 9, font, color: emphasize ? BLUE : GRAY });
    page.drawText(formatFcfa(amount), {
      x: 480,
      y,
      size: emphasize ? 11 : 9,
      font,
      color: emphasize ? BLUE : rgb(0, 0, 0),
    });
    return y - (emphasize ? 18 : 14);
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }
}
