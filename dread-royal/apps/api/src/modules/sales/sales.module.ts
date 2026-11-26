import { Body, Controller, Get, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { PdfService } from '../documents/pdf.service';
import { CancelSaleDto, CreateSaleDto, PaymentDto, SaleQuery, SalesService } from './sales.service';

export function sendPdf(res: Response, buf: Buffer, filename: string, download?: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
}

@Controller('sales')
export class SalesController {
  constructor(private s: SalesService, private pdf: PdfService) {}

  @Get() @RequirePermissions('sales.view')
  list(@Query() q: SaleQuery) { return this.s.list(q); }

  @Get(':id') @RequirePermissions('sales.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.s.get(id); }

  @Post() @RequirePermissions('sales.create')
  async create(@Body() dto: CreateSaleDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    const r = await this.s.create(dto, u, ip);
    return r.sale;
  }

  @Post(':id/payments') @RequirePermissions('payments.create')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.addPayment(id, dto, u, ip); }

  @Post(':id/cancel') @RequirePermissions('sales.cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSaleDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.cancel(id, dto, u, ip); }

  @Get(':id/invoice.pdf') @RequirePermissions('sales.view')
  async invoice(@Param('id', ParseUUIDPipe) id: string, @Query('download') dl: string, @Res() res: Response) {
    const sale = await this.s.get(id);
    sendPdf(res, await this.pdf.invoice(sale), `Facture-${sale.number}.pdf`, dl);
  }

  @Get(':id/ticket.pdf') @RequirePermissions('sales.view')
  async ticket(@Param('id', ParseUUIDPipe) id: string, @Query('download') dl: string, @Res() res: Response) {
    const sale = await this.s.get(id);
    sendPdf(res, await this.pdf.ticket(sale), `Ticket-${sale.number}.pdf`, dl);
  }

  @Get(':id/payments/:paymentId/receipt.pdf') @RequirePermissions('sales.view')
  async receipt(@Param('id', ParseUUIDPipe) id: string, @Param('paymentId', ParseUUIDPipe) pid: string, @Query('download') dl: string, @Res() res: Response) {
    const sale = await this.s.get(id);
    const p = sale.payments.find((x) => x.id === pid);
    if (!p) throw new NotFoundException('Paiement introuvable');
    sendPdf(res, await this.pdf.receipt(sale, p), `Recu-${p.number}.pdf`, dl);
  }
}

@Module({ controllers: [SalesController], providers: [SalesService], exports: [SalesService] })
export class SalesModule {}
