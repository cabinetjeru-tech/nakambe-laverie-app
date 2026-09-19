import { Body, Controller, ForbiddenException, Get, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RoleName } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Post('from-order/:orderId')
  createFromOrder(@Param('orderId') orderId: string) {
    return this.invoicesService.createFromOrder(orderId);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT, RoleName.RECEPTIONNISTE)
  @Get()
  findAll() {
    return this.invoicesService.findAll();
  }

  @Roles(RoleName.CLIENT)
  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.findAll(user.clientId ?? undefined);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const invoice = await this.invoicesService.findOne(id);
    const isStaff = user.role !== RoleName.CLIENT;
    if (!isStaff && invoice.clientId !== user.clientId) {
      throw new ForbiddenException('Cette facture ne vous appartient pas.');
    }
    return invoice;
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const bytes = await this.invoicesService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="facture-${id}.pdf"`,
    });
    res.send(Buffer.from(bytes));
  }
}
