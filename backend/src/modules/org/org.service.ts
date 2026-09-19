import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService) {}

  // ---- Agences ----
  createBranch(dto: any) {
    return this.prisma.branch.create({ data: dto });
  }

  findBranches() {
    return this.prisma.branch.findMany({ include: { zones: true }, orderBy: { name: 'asc' } });
  }

  async updateBranch(id: string, dto: any) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Agence introuvable.');
    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  // ---- Zones ----
  createZone(dto: any) {
    return this.prisma.zone.create({ data: dto });
  }

  findZones(branchId?: string) {
    return this.prisma.zone.findMany({
      where: { isActive: true, ...(branchId ? { branchId } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async updateZone(id: string, dto: any) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Zone introuvable.');
    return this.prisma.zone.update({ where: { id }, data: dto });
  }
}
