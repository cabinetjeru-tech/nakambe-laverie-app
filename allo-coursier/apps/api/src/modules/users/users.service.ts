import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeBurkinaPhone } from '../../common/utils/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { GeoService } from '../geo/geo.service';
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/users.dto';

const MAX_ADDRESSES = 20;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private geo: GeoService,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          email: dto.email === undefined ? undefined : dto.email?.toLowerCase() || null,
        },
        select: { id: true, phone: true, firstName: true, lastName: true, email: true, avatarUrl: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Cette adresse email est déjà utilisée.');
      }
      throw e;
    }
  }

  listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const count = await this.prisma.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) throw new BadRequestException(`Vous avez atteint la limite de ${MAX_ADDRESSES} adresses.`);
    const location = await this.geo.locate(dto);
    const data = { ...dto, contactPhone: this.normalizeContactPhone(dto.contactPhone), cityId: location?.city.id ?? null };
    return this.prisma.$transaction(async (tx) => {
      const isDefault = dto.isDefault ?? count === 0;
      if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({ data: { ...data, userId, isDefault } });
    });
  }

  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    const existing = await this.findOwnAddress(userId, id);
    const lat = dto.lat ?? existing.lat;
    const lng = dto.lng ?? existing.lng;
    const moved = lat !== existing.lat || lng !== existing.lng;
    const cityId = moved ? (await this.geo.locate({ lat, lng }))?.city.id ?? null : undefined;
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({
        where: { id },
        data: {
          ...dto,
          contactPhone: dto.contactPhone === undefined ? undefined : this.normalizeContactPhone(dto.contactPhone),
          cityId,
        },
      });
    });
  }

  async deleteAddress(userId: string, id: string) {
    await this.findOwnAddress(userId, id);
    await this.prisma.address.delete({ where: { id } });
    return { success: true };
  }

  private async findOwnAddress(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new NotFoundException('Adresse introuvable.');
    return address;
  }

  private normalizeContactPhone(phone?: string): string | undefined {
    if (!phone) return undefined;
    const normalized = normalizeBurkinaPhone(phone);
    if (!normalized) throw new BadRequestException('Numéro du contact invalide (8 chiffres).');
    return normalized;
  }
}
