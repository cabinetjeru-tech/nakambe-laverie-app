import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServiceDomain } from '@prisma/client';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.serviceCategory.create({ data: dto });
  }

  findCategories(domain?: ServiceDomain) {
    return this.prisma.serviceCategory.findMany({
      where: { isActive: true, ...(domain ? { domain } : {}) },
      include: { services: { where: { isActive: true } } },
    });
  }

  createService(dto: CreateServiceDto) {
    return this.prisma.service.create({ data: dto });
  }

  findServices(domain?: ServiceDomain) {
    return this.prisma.service.findMany({
      where: {
        isActive: true,
        ...(domain ? { category: { domain } } : {}),
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOneService(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Service introuvable.');
    return service;
  }

  async updateService(id: string, dto: UpdateServiceDto) {
    await this.findOneService(id);
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async removeService(id: string) {
    await this.findOneService(id);
    await this.prisma.service.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }
}
