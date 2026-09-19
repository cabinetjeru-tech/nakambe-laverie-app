import { Injectable, NotFoundException } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface VehicleInput {
  type: VehicleType;
  label: string;
  plateNumber?: string;
  branchId?: string;
}

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  create(dto: VehicleInput) {
    return this.prisma.vehicle.create({ data: dto });
  }

  findAll() {
    return this.prisma.vehicle.findMany({ where: { isActive: true }, orderBy: { label: 'asc' } });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable.');
    return vehicle;
  }

  async update(id: string, dto: Partial<VehicleInput>) {
    await this.findOne(id);
    return this.prisma.vehicle.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.vehicle.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }
}
