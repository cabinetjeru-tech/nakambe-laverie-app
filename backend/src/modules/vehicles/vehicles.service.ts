import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, VehicleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateVehicleLocationDto } from './dto/update-vehicle-location.dto';

const TERMINAL_ORDER_STATUSES: OrderStatus[] = [OrderStatus.TERMINE, OrderStatus.ANNULE];

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

  /**
   * Le chauffeur pousse la position GPS du véhicule pendant une mission active.
   * Restreint aux véhicules qu'il conduit réellement en ce moment, pour éviter
   * qu'un chauffeur ne modifie la position d'un véhicule qui ne lui est pas affecté.
   */
  async updateLocation(vehicleId: string, driverId: string, dto: UpdateVehicleLocationDto) {
    const activeMission = await this.prisma.order.findFirst({
      where: { vehicleId, driverId, status: { notIn: TERMINAL_ORDER_STATUSES } },
    });
    if (!activeMission) {
      throw new ForbiddenException("Aucune mission active ne vous relie à ce véhicule.");
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { currentLat: dto.lat, currentLng: dto.lng, locationUpdatedAt: new Date() },
    });
  }
}
