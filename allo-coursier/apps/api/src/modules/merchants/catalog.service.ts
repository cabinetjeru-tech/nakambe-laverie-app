import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FilePurpose, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CategoryDto, ProductDto, ProductOptionGroupDto, UpdateProductDto } from './dto/merchants.dto';
import { MerchantsService } from './merchants.service';

const productInclude = { optionGroups: { include: { options: true } } } satisfies Prisma.ProductInclude;

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private merchants: MerchantsService,
    private storage: StorageService,
  ) {}

  async catalog(userId: string, merchantId: string) {
    await this.merchants.assertMember(userId, merchantId);
    const [categories, products] = await Promise.all([
      this.prisma.catalogCategory.findMany({ where: { merchantId }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.prisma.product.findMany({ where: { merchantId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], include: productInclude }),
    ]);
    return { categories, products };
  }

  // ------------------------------------------------------------------ catégories

  async createCategory(userId: string, merchantId: string, dto: CategoryDto) {
    await this.merchants.assertMember(userId, merchantId, true);
    return this.prisma.catalogCategory.create({ data: { merchantId, name: dto.name.trim(), position: dto.position ?? 0 } });
  }

  async updateCategory(userId: string, merchantId: string, id: string, dto: CategoryDto) {
    await this.merchants.assertMember(userId, merchantId, true);
    const updated = await this.prisma.catalogCategory.updateMany({ where: { id, merchantId }, data: { name: dto.name.trim(), position: dto.position } });
    if (!updated.count) throw new NotFoundException('Catégorie introuvable.');
    return this.prisma.catalogCategory.findUniqueOrThrow({ where: { id } });
  }

  async deleteCategory(userId: string, merchantId: string, id: string) {
    await this.merchants.assertMember(userId, merchantId, true);
    // Les produits de la catégorie restent au menu, sans catégorie.
    await this.prisma.$transaction([
      this.prisma.product.updateMany({ where: { merchantId, categoryId: id }, data: { categoryId: null } }),
      this.prisma.catalogCategory.deleteMany({ where: { id, merchantId } }),
    ]);
    return { success: true };
  }

  // ------------------------------------------------------------------ produits

  private validateGroups(groups: ProductOptionGroupDto[] = []) {
    for (const g of groups) {
      const min = g.minChoices ?? 0;
      const max = g.maxChoices ?? 1;
      if (min > max) throw new BadRequestException(`« ${g.name} » : le minimum dépasse le maximum.`);
      if (g.options.length === 0) throw new BadRequestException(`« ${g.name} » : ajoutez au moins un choix.`);
      if (min > g.options.length) throw new BadRequestException(`« ${g.name} » : minimum supérieur au nombre de choix.`);
    }
  }

  private groupsCreate(groups: ProductOptionGroupDto[]) {
    return groups.map((g) => ({
      name: g.name.trim(),
      minChoices: g.minChoices ?? 0,
      maxChoices: g.maxChoices ?? 1,
      options: { create: g.options.map((o) => ({ name: o.name.trim(), extraPrice: o.extraPrice ?? 0 })) },
    }));
  }

  private async resolveCategory(merchantId: string, categoryId?: string | null) {
    if (!categoryId) return categoryId;
    const category = await this.prisma.catalogCategory.findFirst({ where: { id: categoryId, merchantId } });
    if (!category) throw new BadRequestException('Catégorie introuvable.');
    return categoryId;
  }

  private async imageUrl(userId: string, key?: string | null) {
    if (key === undefined) return undefined;
    if (!key) return null;
    await this.storage.assertOwned(key, userId, [FilePurpose.MERCHANT_MEDIA]);
    return this.storage.publicUrl(key);
  }

  async createProduct(userId: string, merchantId: string, dto: ProductDto) {
    await this.merchants.assertMember(userId, merchantId, true);
    this.validateGroups(dto.optionGroups);
    return this.prisma.product.create({
      data: {
        merchantId,
        name: dto.name.trim(),
        description: dto.description,
        price: dto.price,
        categoryId: await this.resolveCategory(merchantId, dto.categoryId),
        imageUrl: await this.imageUrl(userId, dto.imageKey),
        isAvailable: dto.isAvailable ?? true,
        position: dto.position ?? 0,
        optionGroups: dto.optionGroups?.length ? { create: this.groupsCreate(dto.optionGroups) } : undefined,
      },
      include: productInclude,
    });
  }

  async updateProduct(userId: string, merchantId: string, id: string, dto: UpdateProductDto) {
    // Changer la disponibilité (rupture de stock) est permis à toute l'équipe ; le reste au responsable.
    const onlyAvailability = Object.keys(dto).every((k) => k === 'isAvailable');
    await this.merchants.assertMember(userId, merchantId, !onlyAvailability);
    const product = await this.prisma.product.findFirst({ where: { id, merchantId } });
    if (!product) throw new NotFoundException('Produit introuvable.');
    this.validateGroups(dto.optionGroups);
    return this.prisma.$transaction(async (tx) => {
      if (dto.optionGroups) {
        await tx.productOptionGroup.deleteMany({ where: { productId: id } });
      }
      return tx.product.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description,
          price: dto.price,
          categoryId: dto.categoryId === undefined ? undefined : await this.resolveCategory(merchantId, dto.categoryId),
          imageUrl: await this.imageUrl(userId, dto.imageKey),
          isAvailable: dto.isAvailable,
          position: dto.position,
          optionGroups: dto.optionGroups?.length ? { create: this.groupsCreate(dto.optionGroups) } : undefined,
        },
        include: productInclude,
      });
    });
  }

  /** Retire un produit du menu ; s'il figure dans d'anciennes commandes, il est seulement masqué. */
  async deleteProduct(userId: string, merchantId: string, id: string) {
    await this.merchants.assertMember(userId, merchantId, true);
    const product = await this.prisma.product.findFirst({ where: { id, merchantId }, include: { _count: { select: { orderItems: true } } } });
    if (!product) throw new NotFoundException('Produit introuvable.');
    if (product._count.orderItems > 0) {
      await this.prisma.product.update({ where: { id }, data: { isAvailable: false } });
      return { success: true, hidden: true };
    }
    await this.prisma.product.delete({ where: { id } });
    return { success: true, hidden: false };
  }
}
