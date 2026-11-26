import { Global, Injectable, Module } from '@nestjs/common';
import PDFDocument = require("pdfkit");
import { existsSync } from 'fs';
import { join } from 'path';
import { formatFCFA, PAYMENT_METHOD_LABELS, PAYMENT_KIND_LABELS, PAYMENT_STATUS_LABELS } from '@dread-royal/shared';
import { SettingsService } from '../settings/settings.module';

const GOLD = '#B8902A';
const BLACK = '#0B0B0B';
const GREY = '#6B7280';

function findLogo() {
  for (const p of [join(__dirname, '..', '..', 'assets', 'logo.jpg'), join(__dirname, '..', '..', '..', 'assets', 'logo.jpg'), join(process.cwd(), 'assets', 'logo.jpg')]) {
    if (existsSync(p)) return p;
  }
  return null;
}
const LOGO = findLogo();

export interface ReportColumn {
  key: string;
  label: string;
  type?: 'text' | 'money' | 'int' | 'date' | 'datetime' | 'percent';
  width?: number;
}
export interface ReportData {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  summary?: { label: string; value: string }[];
}

export function formatCell(v: unknown, type?: ReportColumn['type']): string {
  if (v === null || v === undefined || v === '') return '';
  switch (type) {
    case 'money': return formatFCFA(Number(v), false);
    case 'int': return String(v);
    case 'percent': return `${Number(v).toFixed(1)} %`;
    case 'date': return new Date(v as string).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
    case 'datetime': return new Date(v as string).toLocaleString('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
    default: return String(v);
  }
}

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

const d = (x: Date | string) => new Date(x).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
const dt = (x: Date | string) => new Date(x).toLocaleString('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });

@Injectable()
export class PdfService {
  constructor(private settings: SettingsService) {}

  private async header(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
    const salon = await this.settings.get('salon');
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    doc.rect(0, 0, doc.page.width, 110).fill(BLACK);
    if (LOGO) doc.image(LOGO, left, 12, { width: 86, height: 86 });
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(20).text(salon.name, left + 100, 22);
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(9).text(salon.subtitle, left + 100, 46);
    doc.fillColor(GOLD).font('Helvetica-Oblique').fontSize(9).text(salon.slogan, left + 100, 60);
    const info = [salon.address, salon.phone && `Tél. : ${salon.phone}`, salon.email, salon.ifu && `IFU : ${salon.ifu}`, salon.rccm && `RCCM : ${salon.rccm}`].filter(Boolean).join('\n');
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8).text(info, right - 200, 22, { width: 200, align: 'right' });
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(15).text(title, left, 128);
    if (subtitle) doc.font('Helvetica').fontSize(9).fillColor(GREY).text(subtitle, left, 148);
    doc.moveTo(left, 165).lineTo(right, 165).strokeColor(GOLD).lineWidth(1.5).stroke();
    doc.y = 175;
    return salon;
  }

  private footer(doc: PDFKit.PDFDocument, text: string) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 30;
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(7).fillColor(GREY).font('Helvetica').text(`${text}  —  Page ${i + 1}/${range.count}  —  Édité le ${dt(new Date())}`, doc.page.margins.left, bottom, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' });
      doc.page.margins.bottom = oldBottom;
    }
  }

  /** Tableau simple avec saut de page automatique. */
  private table(doc: PDFKit.PDFDocument, columns: { label: string; width: number; align?: 'left' | 'right' | 'center' }[], rows: string[][], opts: { boldLast?: boolean; fontSize?: number } = {}) {
    const left = doc.page.margins.left;
    const fs = opts.fontSize ?? 8.5;
    const drawHead = () => {
      let x = left;
      const y = doc.y;
      const w = columns.reduce((s, c) => s + c.width, 0);
      doc.rect(left, y, w, 18).fill(BLACK);
      doc.font('Helvetica-Bold').fontSize(fs).fillColor(GOLD);
      for (const c of columns) {
        doc.text(c.label, x + 4, y + 5, { width: c.width - 8, align: c.align ?? 'left', lineBreak: false, ellipsis: true });
        x += c.width;
      }
      doc.y = y + 20;
    };
    drawHead();
    rows.forEach((r, idx) => {
      const isLast = opts.boldLast && idx === rows.length - 1;
      doc.font(isLast ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs);
      const h = Math.max(...r.map((cell, i) => doc.heightOfString(cell || ' ', { width: columns[i].width - 8 }))) + 6;
      if (doc.y + h > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        drawHead();
        doc.font(isLast ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs);
      }
      const y = doc.y;
      const w = columns.reduce((s, c) => s + c.width, 0);
      if (idx % 2 === 1 || isLast) doc.rect(left, y, w, h).fill(isLast ? '#F3E7C3' : '#F7F7F7');
      doc.fillColor(BLACK);
      let x = left;
      r.forEach((cell, i) => {
        doc.text(cell ?? '', x + 4, y + 3, { width: columns[i].width - 8, align: columns[i].align ?? 'left' });
        x += columns[i].width;
      });
      doc.y = y + h;
    });
  }

  async invoice(sale: any): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Facture ${sale.number}` } });
    const salon = await this.header(doc, `FACTURE N° ${sale.number}`, `Date : ${dt(sale.saleDate)}   —   Caissier : ${sale.cashierName ?? ''}${sale.appointment ? `   —   RDV ${sale.appointment.code}` : ''}`);
    const left = doc.page.margins.left;
    const W = doc.page.width - 80;
    const y0 = doc.y;
    doc.roundedRect(left, y0, 250, 58, 4).strokeColor('#DDD').lineWidth(0.8).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GREY).text('CLIENT', left + 8, y0 + 6);
    if (sale.client) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK).text(`${sale.client.firstName} ${sale.client.lastName}`, left + 8, y0 + 19);
      doc.font('Helvetica').fontSize(9).text(`${sale.client.code}${sale.client.phone ? `  —  Tél. ${sale.client.phone}` : ''}`, left + 8, y0 + 36);
    } else doc.font('Helvetica').fontSize(10).fillColor(BLACK).text('Client de passage', left + 8, y0 + 20);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(sale.status === 'CANCELLED' ? '#B91C1C' : sale.paymentStatus === 'PAID' ? '#047857' : '#B45309')
      .text(sale.status === 'CANCELLED' ? 'ANNULÉE' : (PAYMENT_STATUS_LABELS[sale.paymentStatus] ?? '').toUpperCase(), left + W - 200, y0 + 20, { width: 200, align: 'right' });
    doc.y = y0 + 72;
    const typeLabel: Record<string, string> = { SERVICE: 'Prestation', PRODUCT: 'Produit', PACKAGE: 'Forfait' };
    this.table(doc, [
      { label: 'Désignation', width: 190 }, { label: 'Type', width: 60 }, { label: 'Coiffeur', width: 85 },
      { label: 'Qté', width: 30, align: 'right' }, { label: 'P.U.', width: 55, align: 'right' }, { label: 'Remise', width: 45, align: 'right' }, { label: 'Total', width: 50, align: 'right' },
    ], sale.items.map((it: any) => [it.label, typeLabel[it.type], it.staff ? `${it.staff.firstName} ${it.staff.lastName}` : '', String(it.quantity), formatFCFA(it.unitPrice, false), it.lineDiscount ? formatFCFA(it.lineDiscount, false) : '', formatFCFA(it.total, false)]));
    doc.moveDown(0.8);
    const tot: [string, string, boolean?][] = [['Sous-total', formatFCFA(sale.subtotal)]];
    if (sale.discount) tot.push([`Remise${sale.discountReason ? ` (${sale.discountReason})` : ''}`, `- ${formatFCFA(sale.discount)}`]);
    if (sale.loyaltyDiscount) tot.push([`Fidélité (${sale.loyaltyPointsUsed} points)`, `- ${formatFCFA(sale.loyaltyDiscount)}`]);
    tot.push(['TOTAL À PAYER', formatFCFA(sale.total), true], ['Montant payé', formatFCFA(sale.paidAmount)]);
    if (sale.refundedAmount) tot.push(['Remboursé', `- ${formatFCFA(sale.refundedAmount)}`]);
    if (sale.status !== 'CANCELLED') tot.push(['RESTE À PAYER', formatFCFA(sale.balance), true]);
    for (const [l, v, bold] of tot) {
      const y = doc.y;
      if (bold) doc.rect(left + W - 250, y - 2, 250, 16).fill('#F3E7C3');
      doc.fillColor(BLACK).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9);
      doc.text(l, left + W - 245, y + 1, { width: 150 });
      doc.text(v, left + W - 100, y + 1, { width: 95, align: 'right' });
      doc.y = y + 17;
    }
    if (sale.payments?.length) {
      doc.moveDown(1).font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text('Règlements', left);
      doc.moveDown(0.3);
      this.table(doc, [{ label: 'N° reçu', width: 95 }, { label: 'Date', width: 90 }, { label: 'Type', width: 80 }, { label: 'Moyen', width: 95 }, { label: 'Référence', width: 75 }, { label: 'Montant', width: 80, align: 'right' }],
        sale.payments.map((p: any) => [p.number, dt(p.paidAt), PAYMENT_KIND_LABELS[p.kind], PAYMENT_METHOD_LABELS[p.method], p.reference ?? '', `${p.kind === 'REFUND' ? '- ' : ''}${formatFCFA(p.amount, false)}`]));
    }
    if (sale.status === 'CANCELLED') {
      doc.moveDown(1).font('Helvetica-Bold').fontSize(10).fillColor('#B91C1C').text(`Vente annulée le ${dt(sale.cancelledAt)} — Motif : ${sale.cancelReason}`, left);
    }
    if (sale.notes) doc.moveDown(0.8).font('Helvetica-Oblique').fontSize(9).fillColor(GREY).text(`Observations : ${sale.notes}`, left);
    doc.moveDown(2).font('Helvetica-Oblique').fontSize(9).fillColor(GOLD).text(salon.invoiceFooter, left, doc.y, { width: W, align: 'center' });
    this.footer(doc, `${salon.name} — Facture ${sale.number} — Montants en FCFA`);
    return toBuffer(doc);
  }

  async receipt(sale: any, payment: any): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A5', margin: 30, bufferPages: true, info: { Title: `Reçu ${payment.number}` } });
    const salon = await this.header(doc, `${payment.kind === 'REFUND' ? 'REÇU DE REMBOURSEMENT' : "REÇU D'ENCAISSEMENT"} N° ${payment.number}`, `Date : ${dt(payment.paidAt)}`);
    const left = doc.page.margins.left;
    const lines: [string, string][] = [
      ['Facture', sale.number],
      ['Client', sale.client ? `${sale.client.firstName} ${sale.client.lastName} (${sale.client.code})` : 'Client de passage'],
      ['Nature', PAYMENT_KIND_LABELS[payment.kind]],
      ['Moyen de paiement', PAYMENT_METHOD_LABELS[payment.method]],
      ...(payment.reference ? [['Référence', payment.reference] as [string, string]] : []),
      ['MONTANT', formatFCFA(payment.amount)],
      ['Total facture', formatFCFA(sale.total)],
      ['Total payé à ce jour', formatFCFA(sale.paidAmount - sale.refundedAmount)],
      ['Reste à payer', formatFCFA(sale.status === 'CANCELLED' ? 0 : sale.balance)],
    ];
    for (const [l, v] of lines) {
      const y = doc.y;
      const big = l === 'MONTANT';
      doc.font('Helvetica').fontSize(9).fillColor(GREY).text(l, left, y, { width: 140 });
      doc.font('Helvetica-Bold').fontSize(big ? 14 : 10).fillColor(big ? GOLD : BLACK).text(v, left + 145, y - (big ? 2 : 0), { width: 200 });
      doc.y = y + (big ? 24 : 17);
    }
    doc.moveDown(2).font('Helvetica').fontSize(9).fillColor(BLACK).text('Signature / cachet :', left);
    doc.moveDown(3).font('Helvetica-Oblique').fontSize(8).fillColor(GOLD).text(salon.invoiceFooter, { align: 'center' });
    this.footer(doc, `${salon.name} — Reçu ${payment.number}`);
    return toBuffer(doc);
  }

  /** Ticket de caisse pour imprimante thermique 80 mm. */
  async ticket(sale: any): Promise<Buffer> {
    const salon = await this.settings.get('salon');
    const width = 226; // 80 mm
    const height = 330 + sale.items.length * 26 + (sale.payments?.length ?? 0) * 14;
    const doc = new PDFDocument({ size: [width, height], margins: { top: 10, bottom: 10, left: 10, right: 10 }, info: { Title: `Ticket ${sale.number}` } });
    const W = width - 20;
    if (LOGO) { doc.image(LOGO, (width - 70) / 2, 8, { width: 70 }); doc.y = 82; }
    doc.font('Helvetica-Bold').fontSize(12).text(salon.name, 10, doc.y, { width: W, align: 'center' });
    doc.font('Helvetica').fontSize(7).text([salon.address, salon.phone && `Tél. ${salon.phone}`, salon.ifu && `IFU ${salon.ifu}`].filter(Boolean).join(' - '), { width: W, align: 'center' });
    const sep = () => { doc.moveDown(0.3).fontSize(7).text('-'.repeat(52), { width: W, align: 'center' }).moveDown(0.2); };
    sep();
    doc.font('Helvetica-Bold').fontSize(8).text(`Ticket ${sale.number}`, { width: W });
    doc.font('Helvetica').fontSize(7).text(`${dt(sale.saleDate)}  -  ${sale.cashierName ?? ''}`, { width: W });
    if (sale.client) doc.text(`Client : ${sale.client.firstName} ${sale.client.lastName}`, { width: W });
    sep();
    for (const it of sale.items) {
      doc.font('Helvetica').fontSize(7.5).text(it.label, { width: W });
      const y = doc.y;
      doc.text(`${it.quantity} x ${formatFCFA(it.unitPrice, false)}${it.lineDiscount ? ` (-${formatFCFA(it.lineDiscount, false)})` : ''}`, 14, y, { width: W - 60 });
      doc.text(formatFCFA(it.total, false), 10, y, { width: W, align: 'right' });
    }
    sep();
    const row = (l: string, v: string, bold = false) => { const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 9 : 7.5).text(l, 10, y, { width: W - 70 }); doc.text(v, 10, y, { width: W, align: 'right' }); };
    if (sale.discount || sale.loyaltyDiscount) row('Sous-total', formatFCFA(sale.subtotal, false));
    if (sale.discount) row('Remise', `-${formatFCFA(sale.discount, false)}`);
    if (sale.loyaltyDiscount) row('Fidélité', `-${formatFCFA(sale.loyaltyDiscount, false)}`);
    row('TOTAL FCFA', formatFCFA(sale.total, false), true);
    for (const p of sale.payments ?? []) row(`${PAYMENT_KIND_LABELS[p.kind]} ${PAYMENT_METHOD_LABELS[p.method]}`, `${p.kind === 'REFUND' ? '-' : ''}${formatFCFA(p.amount, false)}`);
    if (sale.status !== 'CANCELLED') row('Reste à payer', formatFCFA(sale.balance, false), true);
    else row('VENTE ANNULÉE', '', true);
    if (sale.client) row('Points fidélité', String(sale.client.loyaltyPoints));
    sep();
    doc.font('Helvetica-Oblique').fontSize(7.5).text(salon.slogan, 10, doc.y, { width: W, align: 'center' });
    return toBuffer(doc);
  }

  /** Rapport tabulaire générique (paysage si nombreuses colonnes). */
  async report(r: ReportData): Promise<Buffer> {
    const landscape = r.columns.length > 6;
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: r.title } });
    const salon = await this.header(doc, r.title, r.subtitle);
    if (r.summary?.length) {
      const left = doc.page.margins.left;
      const boxW = (doc.page.width - 72 - (Math.min(r.summary.length, 4) - 1) * 8) / Math.min(r.summary.length, 4);
      r.summary.forEach((s, i) => {
        const col = i % 4;
        const rowI = Math.floor(i / 4);
        const x = left + col * (boxW + 8);
        const y = doc.y + rowI * 46;
        doc.roundedRect(x, y, boxW, 40, 4).fill('#F7F1DF');
        doc.fillColor(GREY).font('Helvetica').fontSize(7.5).text(s.label, x + 6, y + 6, { width: boxW - 12 });
        doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text(s.value, x + 6, y + 20, { width: boxW - 12 });
      });
      doc.y += Math.ceil(r.summary.length / 4) * 46 + 6;
    }
    const avail = doc.page.width - 72;
    const weights = r.columns.map((c) => c.width ?? (c.type === 'money' || c.type === 'int' || c.type === 'date' || c.type === 'percent' ? 1 : 1.8));
    const sum = weights.reduce((a, b) => a + b, 0);
    const cols = r.columns.map((c, i) => ({ label: c.label, width: (weights[i] / sum) * avail, align: (c.type === 'money' || c.type === 'int' || c.type === 'percent' ? 'right' : 'left') as 'left' | 'right' }));
    const rows = r.rows.map((row) => r.columns.map((c) => formatCell(row[c.key], c.type)));
    if (r.totals) rows.push(r.columns.map((c, i) => (i === 0 && r.totals![c.key] === undefined ? 'TOTAL' : formatCell(r.totals![c.key], c.type))));
    if (rows.length === 0) doc.font('Helvetica-Oblique').fontSize(10).fillColor(GREY).text('Aucune donnée sur la période.');
    else this.table(doc, cols, rows, { boldLast: !!r.totals, fontSize: landscape ? 7.5 : 8 });
    this.footer(doc, `${salon.name} — ${r.title} — Montants en FCFA`);
    return toBuffer(doc);
  }
}

@Global()
@Module({ providers: [PdfService], exports: [PdfService] })
export class DocumentsModule {}
