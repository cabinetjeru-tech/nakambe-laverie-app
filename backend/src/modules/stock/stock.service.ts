import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

  // ---- Fournisseurs ----
  createSupplier(dto: any) {
    return this.prisma.supplier.create({ data: dto });
  }

  findSuppliers() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  // ---- Produits ----
  createProduct(dto: any) {
    return this.prisma.product.create({ data: dto });
  }

  findProducts() {
    return this.prisma.product.findMany({ orderBy: { name: 'asc' } });
  }

  async findLowStock() {
    const products = await this.prisma.product.findMany();
    return products.filter((p) => Number(p.currentStock) <= Number(p.minThreshold));
  }

  async findProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produit introuvable.');
    return product;
  }

  async updateProduct(id: string, dto: any) {
    await this.findProduct(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  // ---- Mouvements de stock ----
  async createMovement(dto: {
    productId: string;
    type: StockMovementType;
    quantity: number;
    unitPrice?: number;
    supplierId?: string;
    reason?: string;
    createdById?: string;
  }) {
    const product = await this.findProduct(dto.productId);
    if (dto.type === StockMovementType.SORTIE && Number(product.currentStock) < dto.quantity) {
      throw new BadRequestException('Stock insuffisant pour cette sortie.');
    }

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({ data: dto });
      const delta = dto.type === StockMovementType.ENTREE ? dto.quantity : -dto.quantity;
      await tx.product.update({
        where: { id: dto.productId },
        data: { currentStock: { increment: delta } },
      });
      return movement;
    });
  }

  findMovements(productId?: string) {
    return this.prisma.stockMovement.findMany({
      where: productId ? { productId } : {},
      include: { product: true, supplier: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
