import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { PdfService } from '../../documents/pdf.service';

const DOCS_DIR = path.join(process.cwd(), 'uploads', 'documents', 'invoices');

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private numbering: NumberingService,
    private pdfService: PdfService,
  ) {}

  async createFromOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, invoice: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (order.invoice) return order.invoice;

    const invoiceNumber = await this.numbering.next('FAC');
    return this.prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId: order.id,
        clientId: order.clientId,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
        amountPaid: order.amountPaid,
      },
      include: { client: true, order: { include: { items: true } } },
    });
  }

  findAll(clientId?: string) {
    return this.prisma.invoice.findMany({
      where: clientId ? { clientId } : {},
      include: { client: true, order: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { client: true, order: { include: { items: true } }, payments: true },
    });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    return invoice;
  }

  async generatePdf(id: string): Promise<Uint8Array> {
    const invoice = await this.findOne(id);
    if (!invoice.order) {
      throw new BadRequestException('Facture sans commande associée.');
    }
    const bytes = await this.pdfService.generateDocument({
      docType: 'FACTURE',
      docNumber: invoice.invoiceNumber,
      date: invoice.createdAt,
      clientName: invoice.client.fullName,
      clientPhone: invoice.client.phone,
      clientAddress: invoice.client.address ?? undefined,
      items: invoice.order.items.map((i) => ({
        label: i.label,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
      })),
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      total: Number(invoice.total),
      deposit: Number(invoice.amountPaid) || undefined,
      balanceDue: Number(invoice.total) - Number(invoice.amountPaid),
      extraNote: `Statut : ${invoice.status}`,
    });

    fs.mkdirSync(DOCS_DIR, { recursive: true });
    const filePath = path.join(DOCS_DIR, `${invoice.invoiceNumber}.pdf`);
    fs.writeFileSync(filePath, bytes);
    await this.prisma.invoice.update({ where: { id }, data: { pdfPath: filePath } });

    return bytes;
  }
}
