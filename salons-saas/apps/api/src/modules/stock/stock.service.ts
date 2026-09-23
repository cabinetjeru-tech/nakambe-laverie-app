import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { toMoney } from '../../core/http/money';
import { assertSalonAccess, salonIdFilter } from '../../core/permissions/salon-scope';
import {
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
import { StockLedgerService } from './stock-ledger.service';

const productSelect = {
  id: true,
  name: true,
  brand: true,
  sku: true,
  barcode: true,
  kind: true,
  unit: true,
  purchasePrice: true,
  salePrice: true,
  isActive: true,
  supplier: { select: { id: true, name: true } },
} as const;

@Injectable()
export class StockService {
  constructor(
    private readonly db: DbService,
    private readonly ledger: StockLedgerService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ Fournisseurs

  listSuppliers() {
    return this.db.tx.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  async createSupplier(dto: SupplierDto) {
    return this.db.tx.supplier.create({ data: { tenantId: this.db.tenantId!, ...dto } });
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto) {
    await this.findSupplier(id);
    return this.db.tx.supplier.update({ where: { id }, data: dto });
  }

  // ------------------------------------------------------------------ Produits

  async listProducts(user: AuthUser, query: ProductQueryDto) {
    if (query.salonId) assertSalonAccess(user, query.salonId);
    const q = query.q?.trim();
    const products = await this.db.tx.product.findMany({
      where: {
        deletedAt: null,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { brand: { contains: q, mode: 'insensitive' } },
                { sku: { equals: q } },
                { barcode: { equals: q } },
              ],
            }
          : {}),
      },
      select: {
        ...productSelect,
        stocks: {
          where: { salonId: query.salonId ?? salonIdFilter(user) },
          select: { salonId: true, quantity: true, alertThreshold: true, averageCost: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    const rows = products.map((p) => ({
      ...p,
      stocks: p.stocks.map((s) => ({ ...s, isLow: s.alertThreshold !== null && s.quantity.lte(s.alertThreshold) })),
    }));
    return query.lowStock ? rows.filter((p) => p.stocks.some((s) => s.isLow)) : rows;
  }

  async createProduct(dto: ProductDto) {
    if (dto.supplierId) await this.findSupplier(dto.supplierId);
    if (dto.kind !== 'PROFESSIONAL' && dto.salePrice === undefined) {
      throw new BadRequestException('Un produit revendu doit avoir un prix de vente.');
    }
    const product = await this.db.tx.product.create({
      data: {
        tenantId: this.db.tenantId!,
        name: dto.name,
        brand: dto.brand ?? null,
        sku: dto.sku ?? null,
        barcode: dto.barcode ?? null,
        kind: dto.kind,
        unit: dto.unit ?? 'pièce',
        purchasePrice: toMoney(dto.purchasePrice),
        salePrice: dto.salePrice !== undefined ? toMoney(dto.salePrice) : null,
        supplierId: dto.supplierId ?? null,
      },
      select: productSelect,
    });
    await this.audit.log({ action: 'stock.product_create', entityType: 'product', entityId: product.id });
    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.findProduct(id);
    if (dto.supplierId) await this.findSupplier(dto.supplierId);
    const product = await this.db.tx.product.update({
      where: { id },
      data: {
        ...dto,
        purchasePrice: dto.purchasePrice !== undefined ? toMoney(dto.purchasePrice) : undefined,
        salePrice: dto.salePrice !== undefined ? toMoney(dto.salePrice) : undefined,
      },
      select: productSelect,
    });
    await this.audit.log({ action: 'stock.product_update', entityType: 'product', entityId: id, after: JSON.parse(JSON.stringify(dto)) });
    return product;
  }

  async deleteProduct(id: string) {
    await this.findProduct(id);
    await this.db.tx.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  async setThreshold(user: AuthUser, productId: string, dto: ThresholdDto) {
    assertSalonAccess(user, dto.salonId);
    await this.findProduct(productId);
    const tenantId = this.db.tenantId!;
    return this.db.tx.productStock.upsert({
      where: { tenantId_productId_salonId: { tenantId, productId, salonId: dto.salonId } },
      create: { tenantId, productId, salonId: dto.salonId, alertThreshold: new Prisma.Decimal(dto.alertThreshold) },
      update: { alertThreshold: new Prisma.Decimal(dto.alertThreshold) },
      select: { salonId: true, quantity: true, alertThreshold: true },
    });
  }

  // ------------------------------------------------------------------ Mouvements

  /** Réception de marchandise (achat) : entrée en stock et mise à jour du coût moyen. */
  async receive(user: AuthUser, dto: StockReceiptDto) {
    assertSalonAccess(user, dto.salonId);
    await this.findSalon(dto.salonId);
    if (dto.supplierId) await this.findSupplier(dto.supplierId);
    for (const line of dto.lines) {
      await this.findProduct(line.productId);
      await this.ledger.apply({
        salonId: dto.salonId,
        productId: line.productId,
        type: 'PURCHASE_RECEIPT',
        quantity: line.quantity,
        unitCost: toMoney(line.unitCost),
        reason: dto.note ?? null,
      });
      await this.db.tx.product.update({ where: { id: line.productId }, data: { purchasePrice: toMoney(line.unitCost) } });
    }
    await this.audit.log({ action: 'stock.receipt', entityType: 'stock', salonId: dto.salonId, after: JSON.parse(JSON.stringify(dto)) });
    return { received: dto.lines.length };
  }

  /** Inventaire (quantité comptée) ou perte (casse, péremption, vol). */
  async adjust(user: AuthUser, dto: StockAdjustmentDto) {
    assertSalonAccess(user, dto.salonId);
    await this.findSalon(dto.salonId);
    await this.findProduct(dto.productId);
    let delta: Prisma.Decimal;
    if (dto.mode === 'COUNT') {
      const tenantId = this.db.tenantId!;
      const current = await this.db.tx.productStock.findUnique({
        where: { tenantId_productId_salonId: { tenantId, productId: dto.productId, salonId: dto.salonId } },
        select: { quantity: true },
      });
      delta = new Prisma.Decimal(dto.quantity).minus(current?.quantity ?? 0);
      if (delta.isZero()) return { quantity: new Prisma.Decimal(dto.quantity), unchanged: true };
    } else {
      if (dto.quantity <= 0) throw new BadRequestException('Quantité perdue invalide.');
      delta = new Prisma.Decimal(dto.quantity).negated();
    }
    const result = await this.ledger.apply({
      salonId: dto.salonId,
      productId: dto.productId,
      type: dto.mode === 'COUNT' ? 'ADJUSTMENT' : 'LOSS',
      quantity: delta,
      reason: dto.reason,
    });
    await this.audit.log({ action: `stock.${dto.mode === 'COUNT' ? 'inventory' : 'loss'}`, entityType: 'product', entityId: dto.productId, salonId: dto.salonId, after: { delta: delta.toString(), reason: dto.reason } });
    return { quantity: result.quantity, delta };
  }

  /** Consommation déclarée hors prestation automatique (produit technique ouvert…). */
  async consume(user: AuthUser, dto: StockConsumptionDto) {
    assertSalonAccess(user, dto.salonId);
    await this.findProduct(dto.productId);
    return this.ledger.apply({
      salonId: dto.salonId,
      productId: dto.productId,
      type: 'CONSUMPTION',
      quantity: -dto.quantity,
      reason: dto.reason ?? null,
    });
  }

  async transfer(user: AuthUser, dto: StockTransferDto) {
    if (dto.fromSalonId === dto.toSalonId) throw new BadRequestException('Les deux salons doivent être différents.');
    assertSalonAccess(user, dto.fromSalonId);
    assertSalonAccess(user, dto.toSalonId);
    await this.findSalon(dto.fromSalonId);
    await this.findSalon(dto.toSalonId);
    const tenantId = this.db.tenantId!;
    const transfer = await this.db.tx.stockTransfer.create({
      data: {
        tenantId,
        fromSalonId: dto.fromSalonId,
        toSalonId: dto.toSalonId,
        status: 'RECEIVED',
        sentAt: new Date(),
        receivedAt: new Date(),
        createdBy: user.userId,
        lines: { create: dto.lines.map((l) => ({ productId: l.productId, quantity: new Prisma.Decimal(l.quantity) })) },
      },
      select: { id: true },
    });
    for (const line of dto.lines) {
      await this.findProduct(line.productId);
      const out = await this.ledger.apply({
        salonId: dto.fromSalonId,
        productId: line.productId,
        type: 'TRANSFER_OUT',
        quantity: -line.quantity,
        transferId: transfer.id,
      });
      if (out.quantity.isNegative()) {
        throw new ConflictException('Stock insuffisant dans le salon de départ pour ce transfert.');
      }
      await this.ledger.apply({
        salonId: dto.toSalonId,
        productId: line.productId,
        type: 'TRANSFER_IN',
        quantity: line.quantity,
        unitCost: out.averageCost,
        transferId: transfer.id,
      });
    }
    await this.audit.log({ action: 'stock.transfer', entityType: 'stock_transfer', entityId: transfer.id });
    return { id: transfer.id };
  }

  async movements(user: AuthUser, salonId?: string, productId?: string) {
    if (salonId) assertSalonAccess(user, salonId);
    return this.db.tx.stockMovement.findMany({
      where: { salonId: salonId ?? salonIdFilter(user), ...(productId ? { productId } : {}) },
      select: {
        id: true,
        salonId: true,
        type: true,
        quantity: true,
        unitCost: true,
        reason: true,
        saleId: true,
        createdAt: true,
        product: { select: { id: true, name: true, unit: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ------------------------------------------------------------------ Outils

  private async findSupplier(id: string) {
    const supplier = await this.db.tx.supplier.findFirst({ where: { id } });
    if (!supplier) throw new NotFoundException('Fournisseur introuvable.');
    return supplier;
  }

  private async findProduct(id: string) {
    const product = await this.db.tx.product.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!product) throw new NotFoundException('Produit introuvable.');
    return product;
  }

  private async findSalon(id: string) {
    const salon = await this.db.tx.salon.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!salon) throw new NotFoundException('Salon introuvable.');
  }
}
