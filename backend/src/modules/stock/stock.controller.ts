import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { StockService } from './stock.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('stock')
@Roles(RoleName.ADMIN, RoleName.GERANT)
@Controller('stock')
export class StockController {
  constructor(private stockService: StockService) {}

  @Post('suppliers')
  createSupplier(@Body() dto: any) {
    return this.stockService.createSupplier(dto);
  }

  @Get('suppliers')
  findSuppliers() {
    return this.stockService.findSuppliers();
  }

  @Post('products')
  createProduct(@Body() dto: any) {
    return this.stockService.createProduct(dto);
  }

  @Get('products')
  findProducts() {
    return this.stockService.findProducts();
  }

  @Get('products/low')
  findLowStock() {
    return this.stockService.findLowStock();
  }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: any) {
    return this.stockService.updateProduct(id, dto);
  }

  @Post('movements')
  createMovement(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.stockService.createMovement({ ...dto, createdById: user.userId });
  }

  @Get('movements')
  findMovements(@Query('productId') productId?: string) {
    return this.stockService.findMovements(productId);
  }
}
