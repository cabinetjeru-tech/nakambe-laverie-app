import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { formatFCFA } from '@dread-royal/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { nextNumber } from '../../common/numbering';
import { CashEngine, StockEngine } from '../core/engines';

class CreateProductDto {
  @IsString() @Matches(/^[A-Z0-9-]{2,20}$/, { message: 'Référence : majuscules, chiffres, tirets' }) reference: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsUUID() categoryId: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsInt() @Min(0) purchasePrice: number;
  @IsInt() @Min(0) salePrice: number;
  @IsOptional() @IsInt() @Min(0) minQuantity?: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsBoolean() sellable?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  /** Stock initial : enregistré comme mouvement d'entrée */
  @IsOptional() @IsInt() @Min(0) initialQuantity?: number;
}
class UpdateProductDto extends PartialType(CreateProductDto) {}

class MovementDto {
  @IsUUID() productId: string;
  @IsIn(['IN', 'OUT', 'USAGE', 'ADJUSTMENT']) type: 'IN' | 'OUT' | 'USAGE' | 'ADJUSTMENT';
  /** Positif ; pour ADJUSTMENT, signé (+ ou −) */
  @IsInt() quantity: number;
  @IsOptional() @IsInt() @Min(0) unitCost?: number;
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

class SupplierDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class UpdateSupplierDto extends PartialType(SupplierDto) {}

class PurchaseLineDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) quantity: number;
  @IsInt() @Min(0) unitCost: number;
}
class CreatePurchaseDto {
  @IsUUID() supplierId: string;
  @IsDateString() purchaseDate: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PurchaseLineDto) lines: PurchaseLineDto[];
  @IsOptional() @IsInt() @Min(0) paidAmount?: number;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
class PayPurchaseDto {
  @IsInt() @Min(1) amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}
class InventoryLineDto {
  @IsUUID() productId: string;
  @IsInt() @Min(0) countedQty: number;
}
class InventoryDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InventoryLineDto) lines: InventoryLineDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

@Injectable()
export class StockService {
  constructor(private prisma: PrismaService, private audit: AuditService, private engine: StockEngine, private cash: CashEngine) {}

  categories() {
    return this.prisma.productCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async products(q: { search?: string; categoryId?: string; includeInactive?: string; sellable?: string; alerts?: string }) {
    const list = await this.prisma.product.findMany({
      where: {
        ...(q.includeInactive === 'true' ? {} : { active: true }),
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.sellable === 'true' ? { sellable: true } : {}),
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { reference: { contains: q.search, mode: 'insensitive' } }] } : {}),
      },
      include: { category: true, supplier: { select: { id: true, name: true } } },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });
    const withAlert = list.map((p) => ({ ...p, alert: p.quantity <= p.minQuantity, stockValue: p.quantity * p.purchasePrice }));
    return q.alerts === 'true' ? withAlert.filter((p) => p.alert) : withAlert;
  }

  async alerts() {
    return this.products({ alerts: 'true' });
  }

  async createProduct(dto: CreateProductDto, user: AuthUser, ip?: string) {
    if (await this.prisma.product.findUnique({ where: { reference: dto.reference } })) throw new ConflictException('Référence déjà utilisée');
    const { initialQuantity, ...data } = dto;
    return this.prisma.tx(async (tx) => {
      const p = await tx.product.create({ data });
      if (initialQuantity) await this.engine.move(tx, { productId: p.id, type: 'IN', quantity: initialQuantity, unitCost: p.purchasePrice, reason: 'Stock initial', userId: user.id });
      await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'Product', entityId: p.id, summary: `Produit ${p.reference} ${p.name}`, after: p, ip }, tx);
      return tx.product.findUniqueOrThrow({ where: { id: p.id } });
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto, user: AuthUser, ip?: string) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Produit introuvable');
    const { initialQuantity, ...data } = dto; // la quantité ne se modifie que par mouvement
    const p = await this.prisma.product.update({ where: { id }, data });
    await this.audit.log({ userId: user.id, action: 'UPDATE', entity: 'Product', entityId: id, summary: `Produit ${p.reference}${before.salePrice !== p.salePrice ? ` : prix ${before.salePrice} → ${p.salePrice} FCFA` : ''}`, before, after: p, ip });
    return p;
  }

  async movement(dto: MovementDto, user: AuthUser, ip?: string) {
    if (dto.quantity === 0) throw new BadRequestException('Quantité nulle');
    if (dto.type !== 'ADJUSTMENT' && dto.quantity < 0) throw new BadRequestException('Quantité positive attendue');
    const qty = dto.type === 'IN' || dto.type === 'ADJUSTMENT' ? dto.quantity : -dto.quantity;
    return this.prisma.tx(async (tx) => {
      const m = await this.engine.move(tx, { productId: dto.productId, type: dto.type, quantity: qty, unitCost: dto.unitCost, reason: dto.reason, userId: user.id });
      await this.audit.log({ userId: user.id, action: 'STOCK_MOVEMENT', entity: 'Product', entityId: dto.productId, summary: `Mouvement ${dto.type} ${qty > 0 ? '+' : ''}${qty} — ${dto.reason}`, after: m, ip }, tx);
      return m;
    });
  }

  movements(q: { productId?: string; type?: string; from?: string; to?: string }) {
    const where: Prisma.StockMovementWhereInput = {};
    if (q.productId) where.productId = q.productId;
    if (q.type) where.type = { in: q.type.split(',') as any };
    if (q.from || q.to) where.createdAt = { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lt: new Date(new Date(q.to).getTime() + 86_400_000) }) };
    return this.prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 1000, include: { product: { select: { reference: true, name: true, unit: true } } } });
  }

  // ─────────── Fournisseurs ───────────
  suppliers() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true, purchases: true } } } });
  }
  async createSupplier(dto: SupplierDto, user: AuthUser, ip?: string) {
    const s = await this.prisma.supplier.create({ data: dto });
    await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'Supplier', entityId: s.id, summary: `Fournisseur ${s.name}`, after: s, ip });
    return s;
  }
  async updateSupplier(id: string, dto: Partial<SupplierDto>, user: AuthUser, ip?: string) {
    const before = await this.prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Fournisseur introuvable');
    const s = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.log({ userId: user.id, action: 'UPDATE', entity: 'Supplier', entityId: id, summary: `Fournisseur ${s.name}`, before, after: s, ip });
    return s;
  }

  // ─────────── Achats ───────────
  purchases() {
    return this.prisma.purchase.findMany({ orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }], take: 500, include: { supplier: { select: { name: true } }, lines: { include: { product: { select: { name: true, reference: true } } } }, payments: true } });
  }

  /**
   * Achat fournisseur : entrée en stock, coût moyen pondéré (CMUP) mis à jour,
   * dette fournisseur pour la partie non payée. Ce n'est PAS une charge : le coût passe
   * en résultat au moment de la vente ou de la consommation du produit.
   */
  async createPurchase(dto: CreatePurchaseDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new BadRequestException('Fournisseur inconnu');
      const total = dto.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
      const paid = dto.paidAmount ?? 0;
      if (paid > total) throw new BadRequestException('Le montant payé dépasse le total');
      if (paid > 0 && !dto.method) throw new BadRequestException('Précisez le moyen de paiement');
      const number = await nextNumber(tx, 'ACH');
      const purchase = await tx.purchase.create({
        data: {
          number, supplierId: dto.supplierId, purchaseDate: new Date(dto.purchaseDate), total, paidAmount: paid, status: paid === 0 ? 'UNPAID' : paid < total ? 'PARTIAL' : 'PAID',
          reference: dto.reference, notes: dto.notes, createdById: user.id,
          lines: { create: dto.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost, total: l.quantity * l.unitCost })) },
        },
      });
      for (const l of dto.lines) {
        const p = await tx.product.findUnique({ where: { id: l.productId } });
        if (!p) throw new BadRequestException('Produit inconnu');
        const newQty = p.quantity + l.quantity;
        const cmup = newQty > 0 ? Math.round((p.quantity * p.purchasePrice + l.quantity * l.unitCost) / newQty) : l.unitCost;
        await tx.product.update({ where: { id: p.id }, data: { purchasePrice: cmup, supplierId: p.supplierId ?? dto.supplierId } });
        await this.engine.move(tx, { productId: p.id, type: 'PURCHASE', quantity: l.quantity, unitCost: l.unitCost, reason: `Achat ${number} — ${supplier.name}`, purchaseId: purchase.id, userId: user.id });
      }
      if (paid > 0) {
        if (dto.method === 'CASH') await this.cash.record(tx, { type: 'OUT', source: 'SUPPLIER_PAYMENT', amount: paid, label: `Achat ${number} — ${supplier.name}`, referenceId: purchase.id, userId: user.id });
        await tx.supplierPayment.create({ data: { purchaseId: purchase.id, amount: paid, method: dto.method!, reference: dto.reference, paidById: user.id } });
      }
      await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'Purchase', entityId: purchase.id, summary: `Achat ${number} ${supplier.name} : ${formatFCFA(total)} (payé ${formatFCFA(paid)})`, after: dto, ip }, tx);
      return purchase;
    });
  }

  async payPurchase(id: string, dto: PayPurchaseDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${id} FOR UPDATE`;
      const p = await tx.purchase.findUnique({ where: { id }, include: { supplier: true } });
      if (!p) throw new NotFoundException('Achat introuvable');
      if (dto.amount > p.total - p.paidAmount) throw new BadRequestException(`Reste à payer : ${formatFCFA(p.total - p.paidAmount)}`);
      if (dto.method === 'CASH') await this.cash.record(tx, { type: 'OUT', source: 'SUPPLIER_PAYMENT', amount: dto.amount, label: `Règlement ${p.number} — ${p.supplier.name}`, referenceId: id, userId: user.id });
      await tx.supplierPayment.create({ data: { purchaseId: id, amount: dto.amount, method: dto.method, reference: dto.reference, paidById: user.id } });
      const paid = p.paidAmount + dto.amount;
      const updated = await tx.purchase.update({ where: { id }, data: { paidAmount: paid, status: paid >= p.total ? 'PAID' : 'PARTIAL' } });
      await this.audit.log({ userId: user.id, action: 'PAYMENT', entity: 'Purchase', entityId: id, summary: `Règlement fournisseur ${formatFCFA(dto.amount)} sur ${p.number}`, ip }, tx);
      return updated;
    });
  }

  // ─────────── Inventaires ───────────
  inventories() {
    return this.prisma.inventory.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { lines: true } });
  }

  async inventory(dto: InventoryDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const number = await nextNumber(tx, 'INV', 4);
      const inv = await tx.inventory.create({ data: { number, notes: dto.notes, createdById: user.id } });
      let gaps = 0;
      for (const l of dto.lines) {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${l.productId} FOR UPDATE`;
        const p = await tx.product.findUnique({ where: { id: l.productId } });
        if (!p) throw new BadRequestException('Produit inconnu');
        const diff = l.countedQty - p.quantity;
        await tx.inventoryLine.create({ data: { inventoryId: inv.id, productId: p.id, expectedQty: p.quantity, countedQty: l.countedQty, difference: diff } });
        if (diff !== 0) {
          gaps++;
          await this.engine.move(tx, { productId: p.id, type: 'INVENTORY', quantity: diff, reason: `Inventaire ${number}`, inventoryId: inv.id, userId: user.id });
        }
      }
      await this.audit.log({ userId: user.id, action: 'INVENTORY', entity: 'Inventory', entityId: inv.id, summary: `Inventaire ${number} : ${dto.lines.length} produits comptés, ${gaps} écart(s)`, ip }, tx);
      return tx.inventory.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: true } });
    });
  }
}

@Controller('stock')
export class StockController {
  constructor(private s: StockService) {}
  @Get('categories') @RequirePermissions('stock.view', 'sales.create')
  categories() { return this.s.categories(); }
  @Get('products') @RequirePermissions('stock.view', 'sales.create')
  products(@Query() q: { search?: string; categoryId?: string; includeInactive?: string; sellable?: string; alerts?: string }) { return this.s.products(q); }
  @Get('alerts') @RequirePermissions('stock.view')
  alerts() { return this.s.alerts(); }
  @Post('products') @RequirePermissions('stock.manage')
  create(@Body() dto: CreateProductDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.createProduct(dto, u, ip); }
  @Patch('products/:id') @RequirePermissions('stock.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.updateProduct(id, dto, u, ip); }
  @Post('movements') @RequirePermissions('stock.manage')
  movement(@Body() dto: MovementDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.movement(dto, u, ip); }
  @Get('movements') @RequirePermissions('stock.view')
  movements(@Query() q: { productId?: string; type?: string; from?: string; to?: string }) { return this.s.movements(q); }
  @Get('suppliers') @RequirePermissions('stock.view', 'suppliers.manage', 'expenses.manage')
  suppliers() { return this.s.suppliers(); }
  @Post('suppliers') @RequirePermissions('suppliers.manage')
  createSupplier(@Body() dto: SupplierDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.createSupplier(dto, u, ip); }
  @Patch('suppliers/:id') @RequirePermissions('suppliers.manage')
  updateSupplier(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.updateSupplier(id, dto, u, ip); }
  @Get('purchases') @RequirePermissions('suppliers.manage', 'finance.view')
  purchases() { return this.s.purchases(); }
  @Post('purchases') @RequirePermissions('suppliers.manage')
  createPurchase(@Body() dto: CreatePurchaseDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.createPurchase(dto, u, ip); }
  @Post('purchases/:id/pay') @RequirePermissions('suppliers.manage')
  payPurchase(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPurchaseDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.payPurchase(id, dto, u, ip); }
  @Get('inventories') @RequirePermissions('stock.view')
  inventories() { return this.s.inventories(); }
  @Post('inventories') @RequirePermissions('stock.manage')
  inventory(@Body() dto: InventoryDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.inventory(dto, u, ip); }
}

@Module({ controllers: [StockController], providers: [StockService] })
export class StockModule {}
