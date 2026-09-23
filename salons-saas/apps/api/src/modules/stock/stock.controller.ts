import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import {
  MovementQueryDto,
  ProductDto,
  ProductQueryDto,
  StockAdjustmentDto,
  StockConsumptionDto,
  StockReceiptDto,
  StockTransferDto,
  SupplierDto,
  ThresholdDto,
  UpdateProductDto,
  UpdateSupplierDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

/** Toutes ces permissions exigent la fonctionnalité « stock » de l'offre. */
@Controller()
export class StockController {
  constructor(private readonly stock: StockService) {}

  @RequireAnyPermission('stock.read', 'purchases.manage')
  @Get('suppliers')
  suppliers() {
    return this.stock.listSuppliers();
  }

  @RequirePermissions('purchases.manage')
  @Post('suppliers')
  createSupplier(@Body() dto: SupplierDto) {
    return this.stock.createSupplier(dto);
  }

  @RequirePermissions('purchases.manage')
  @Patch('suppliers/:id')
  updateSupplier(@Param('id', ParseIdPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.stock.updateSupplier(id, dto);
  }

  @RequireAnyPermission('stock.read', 'stock.consume', 'sales.create')
  @Get('products')
  products(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.stock.listProducts(user, query);
  }

  @RequirePermissions('purchases.manage')
  @Post('products')
  createProduct(@Body() dto: ProductDto) {
    return this.stock.createProduct(dto);
  }

  @RequirePermissions('purchases.manage')
  @Patch('products/:id')
  updateProduct(@Param('id', ParseIdPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.stock.updateProduct(id, dto);
  }

  @RequirePermissions('purchases.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('products/:id')
  deleteProduct(@Param('id', ParseIdPipe) id: string) {
    return this.stock.deleteProduct(id);
  }

  @RequirePermissions('stock.adjust')
  @Put('products/:id/threshold')
  threshold(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: ThresholdDto) {
    return this.stock.setThreshold(user, id, dto);
  }

  @RequirePermissions('purchases.manage')
  @Post('stock/receipts')
  receive(@CurrentUser() user: AuthUser, @Body() dto: StockReceiptDto) {
    return this.stock.receive(user, dto);
  }

  @RequirePermissions('stock.adjust')
  @Post('stock/adjustments')
  adjust(@CurrentUser() user: AuthUser, @Body() dto: StockAdjustmentDto) {
    return this.stock.adjust(user, dto);
  }

  @RequirePermissions('stock.consume')
  @Post('stock/consumptions')
  consume(@CurrentUser() user: AuthUser, @Body() dto: StockConsumptionDto) {
    return this.stock.consume(user, dto);
  }

  @RequirePermissions('stock.transfer')
  @Post('stock/transfers')
  transfer(@CurrentUser() user: AuthUser, @Body() dto: StockTransferDto) {
    return this.stock.transfer(user, dto);
  }

  @RequirePermissions('stock.read')
  @Get('stock/movements')
  movements(@CurrentUser() user: AuthUser, @Query() query: MovementQueryDto) {
    return this.stock.movements(user, query.salonId, query.productId);
  }
}
