import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { toMoney } from '../../core/http/money';
import { CategoryDto, CreateServiceDto, UpdateCategoryDto, UpdateServiceDto } from './dto/catalog.dto';

export const serviceSelect = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  basePrice: true,
  priceIsFrom: true,
  durationMinutes: true,
  bookableOnline: true,
  depositPercent: true,
  isActive: true,
  category: { select: { id: true, name: true } },
  variants: { where: { isActive: true }, select: { id: true, name: true, price: true, durationMinutes: true }, orderBy: { sortOrder: 'asc' } },
  steps: { select: { position: true, label: true, durationMinutes: true, blocksStaff: true }, orderBy: { position: 'asc' } },
  staffSkills: { select: { staffId: true, priceOverride: true, durationFactor: true } },
} as const;

@Injectable()
export class CatalogService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ Catégories

  listCategories() {
    return this.db.tx.serviceCategory.findMany({
      select: { id: true, name: true, sortOrder: true, isActive: true, _count: { select: { services: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CategoryDto) {
    const category = await this.db.tx.serviceCategory.create({
      data: { tenantId: this.db.tenantId!, name: dto.name, sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true },
    });
    await this.audit.log({ action: 'catalog.category_create', entityType: 'service_category', entityId: category.id });
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.findCategory(id);
    return this.db.tx.serviceCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    await this.findCategory(id);
    const used = await this.db.tx.service.count({ where: { categoryId: id, deletedAt: null } });
    if (used > 0) throw new ConflictException('Cette catégorie contient des prestations : déplacez-les ou supprimez-les d’abord.');
    await this.db.tx.serviceCategory.delete({ where: { id } });
  }

  // ------------------------------------------------------------------ Prestations

  listServices(includeInactive = false) {
    return this.db.tx.service.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      select: serviceSelect,
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getService(id: string) {
    const service = await this.db.tx.service.findFirst({ where: { id, deletedAt: null }, select: serviceSelect });
    if (!service) throw new NotFoundException('Prestation introuvable.');
    return service;
  }

  async createService(dto: CreateServiceDto) {
    await this.findCategory(dto.categoryId);
    this.assertSteps(dto.durationMinutes, dto.steps);
    const tenantId = this.db.tenantId!;

    const staffIds = dto.staffIds ?? (await this.db.tx.staffMember.findMany({ where: { isActive: true }, select: { id: true } })).map((s) => s.id);
    await this.assertStaffExist(staffIds);

    const service = await this.db.tx.service.create({
      data: {
        tenantId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description ?? null,
        basePrice: toMoney(dto.basePrice),
        priceIsFrom: dto.priceIsFrom ?? false,
        durationMinutes: dto.durationMinutes,
        bookableOnline: dto.bookableOnline ?? true,
        depositPercent: dto.depositPercent ?? null,
        variants: dto.variants?.length
          ? { create: dto.variants.map((v, i) => ({ name: v.name, price: toMoney(v.price), durationMinutes: v.durationMinutes, sortOrder: i })) }
          : undefined,
        steps: dto.steps?.length
          ? { create: dto.steps.map((s, i) => ({ position: i + 1, label: s.label, durationMinutes: s.durationMinutes, blocksStaff: s.blocksStaff })) }
          : undefined,
        staffSkills: staffIds.length ? { create: staffIds.map((staffId) => ({ staffId })) } : undefined,
      },
      select: serviceSelect,
    });
    await this.audit.log({ action: 'catalog.service_create', entityType: 'service', entityId: service.id, after: { name: service.name, price: dto.basePrice } });
    return service;
  }

  async updateService(user: AuthUser, id: string, dto: UpdateServiceDto) {
    const before = await this.getService(id);
    const touchesPrices = dto.basePrice !== undefined || dto.variants !== undefined;
    if (touchesPrices && !user.permissions.includes('prices.manage')) {
      throw new ForbiddenException('Modifier les prix nécessite la permission « Modifier les prix ».');
    }
    if (dto.categoryId) await this.findCategory(dto.categoryId);
    const duration = dto.durationMinutes ?? before.durationMinutes;
    if (dto.steps) this.assertSteps(duration, dto.steps);
    else if (dto.durationMinutes && before.steps.length) this.assertSteps(duration, before.steps);

    const tx = this.db.tx;
    const tenantId = this.db.tenantId!;
    await tx.service.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        basePrice: dto.basePrice !== undefined ? toMoney(dto.basePrice) : undefined,
        priceIsFrom: dto.priceIsFrom,
        durationMinutes: dto.durationMinutes,
        bookableOnline: dto.bookableOnline,
        depositPercent: dto.depositPercent,
        isActive: dto.isActive,
      },
    });
    if (dto.variants) {
      // Les variantes déjà utilisées restent en base (historique) mais ne sont plus proposées.
      await tx.serviceVariant.updateMany({ where: { serviceId: id }, data: { isActive: false } });
      if (dto.variants.length) {
        await tx.serviceVariant.createMany({
          data: dto.variants.map((v, i) => ({ tenantId, serviceId: id, name: v.name, price: toMoney(v.price), durationMinutes: v.durationMinutes, sortOrder: i })),
        });
      }
    }
    if (dto.steps) {
      await tx.serviceStep.deleteMany({ where: { serviceId: id } });
      if (dto.steps.length) {
        await tx.serviceStep.createMany({
          data: dto.steps.map((s, i) => ({ tenantId, serviceId: id, position: i + 1, label: s.label, durationMinutes: s.durationMinutes, blocksStaff: s.blocksStaff })),
        });
      }
    }
    if (dto.staffIds) {
      await this.assertStaffExist(dto.staffIds);
      await tx.staffSkill.deleteMany({ where: { serviceId: id, staffId: { notIn: dto.staffIds } } });
      await tx.staffSkill.createMany({ data: dto.staffIds.map((staffId) => ({ tenantId, staffId, serviceId: id })), skipDuplicates: true });
    }
    const after = await this.getService(id);
    await this.audit.log({
      action: 'catalog.service_update',
      entityType: 'service',
      entityId: id,
      before: { name: before.name, basePrice: Number(before.basePrice), durationMinutes: before.durationMinutes },
      after: { name: after.name, basePrice: Number(after.basePrice), durationMinutes: after.durationMinutes },
    });
    return after;
  }

  /** Suppression logique : l'historique des rendez-vous et ventes reste intact. */
  async deleteService(id: string) {
    await this.getService(id);
    await this.db.tx.service.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.audit.log({ action: 'catalog.service_delete', entityType: 'service', entityId: id });
  }

  private async findCategory(id: string) {
    const category = await this.db.tx.serviceCategory.findFirst({ where: { id } });
    if (!category) throw new BadRequestException('Catégorie inconnue.');
    return category;
  }

  private async assertStaffExist(staffIds: string[]) {
    if (staffIds.length === 0) return;
    const found = await this.db.tx.staffMember.count({ where: { id: { in: staffIds } } });
    if (found !== staffIds.length) throw new BadRequestException('Employé inconnu.');
  }

  private assertSteps(durationMinutes: number, steps?: { durationMinutes: number; blocksStaff: boolean }[]) {
    if (!steps || steps.length === 0) return;
    const total = steps.reduce((sum, step) => sum + step.durationMinutes, 0);
    if (total !== durationMinutes) {
      throw new BadRequestException(`La somme des étapes (${total} min) doit être égale à la durée de la prestation (${durationMinutes} min).`);
    }
    if (!steps.some((step) => step.blocksStaff)) {
      throw new BadRequestException('Au moins une étape doit mobiliser l’employé.');
    }
  }
}
