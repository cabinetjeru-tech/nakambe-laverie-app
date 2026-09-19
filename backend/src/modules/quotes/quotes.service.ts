import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { PdfService } from '../../documents/pdf.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

const DOCS_DIR = path.join(process.cwd(), 'uploads', 'documents', 'quotes');

@Injectable()
export class QuotesService {
  constructor(
    private prisma: PrismaService,
    private numbering: NumberingService,
    private pdfService: PdfService,
  ) {}

  async create(dto: CreateQuoteDto, requestingClientId?: string) {
    const clientId = requestingClientId ?? dto.clientId;
    if (!clientId) throw new BadRequestException('clientId est requis.');

    const resolvedItems = await Promise.all(
      dto.items.map(async (item) => {
        if (item.serviceId) {
          const service = await this.prisma.service.findUnique({ where: { id: item.serviceId } });
          if (!service) throw new BadRequestException(`Service ${item.serviceId} introuvable.`);
          const unitPrice = Number(service.price);
          return {
            serviceId: service.id,
            label: item.label || service.name,
            quantity: item.quantity,
            unitPrice,
            total: unitPrice * item.quantity,
          };
        }
        if (item.unitPrice === undefined) {
          throw new BadRequestException(`L'article "${item.label}" nécessite un prix unitaire.`);
        }
        return {
          serviceId: null,
          label: item.label,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.unitPrice * item.quantity,
        };
      }),
    );

    const subtotal = resolvedItems.reduce((sum, i) => sum + i.total, 0);
    const discount = dto.discount ?? 0;
    const total = subtotal - discount;
    const quoteNumber = await this.numbering.next('DEV');

    return this.prisma.quote.create({
      data: {
        quoteNumber,
        clientId,
        subtotal,
        discount,
        total,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        conditions: dto.conditions,
        items: { create: resolvedItems },
      },
      include: { items: true, client: true },
    });
  }

  findAll(clientId?: string) {
    return this.prisma.quote.findMany({
      where: clientId ? { clientId } : {},
      include: { client: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { client: true, items: true },
    });
    if (!quote) throw new NotFoundException('Devis introuvable.');
    return quote;
  }

  async updateStatus(id: string, status: QuoteStatus) {
    await this.findOne(id);
    return this.prisma.quote.update({ where: { id }, data: { status } });
  }

  async generatePdf(id: string): Promise<Uint8Array> {
    const quote = await this.findOne(id);
    const bytes = await this.pdfService.generateDocument({
      docType: 'DEVIS',
      docNumber: quote.quoteNumber,
      date: quote.createdAt,
      clientName: quote.client.fullName,
      clientPhone: quote.client.phone,
      clientAddress: quote.client.address ?? undefined,
      items: quote.items.map((i) => ({
        label: i.label,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
      })),
      subtotal: Number(quote.subtotal),
      discount: Number(quote.discount),
      total: Number(quote.total),
      deposit: Number(quote.deposit) || undefined,
      validUntil: quote.validUntil ?? undefined,
      conditions: quote.conditions ?? undefined,
    });

    fs.mkdirSync(DOCS_DIR, { recursive: true });
    const filePath = path.join(DOCS_DIR, `${quote.quoteNumber}.pdf`);
    fs.writeFileSync(filePath, bytes);
    await this.prisma.quote.update({ where: { id }, data: { pdfPath: filePath } });

    return bytes;
  }
}
