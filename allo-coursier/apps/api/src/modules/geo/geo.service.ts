import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { City, Prisma, Zone } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { GeoJsonPolygon, haversineKm, LatLng, pointInPolygon, polygonValidationError } from '../../common/utils/geo';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCityDto, CreateZoneDto, UpdateCityDto, UpdateZoneDto } from './dto/geo.dto';

export interface Location {
  city: City;
  zone: Zone | null;
}

/**
 * Trouve la ville et la zone d'un point.
 * Une zone active contenant le point désigne sa ville ; sinon on prend la ville active
 * la plus proche dont le rayon de service couvre le point.
 */
export function locatePoint(point: LatLng, cities: (City & { zones: Zone[] })[]): Location | null {
  const zoneMatches = cities
    .filter((c) => c.isActive)
    .flatMap((city) =>
      city.zones
        .filter((z) => z.isActive && pointInPolygon(point, z.polygon as unknown as GeoJsonPolygon))
        .map((zone) => ({ city, zone })),
    )
    .sort((a, b) => b.zone.priority - a.zone.priority);
  if (zoneMatches.length > 0) return zoneMatches[0];

  const inRadius = cities
    .filter((c) => c.isActive)
    .map((city) => ({ city, distance: haversineKm(point, { lat: city.centerLat, lng: city.centerLng }) }))
    .filter(({ city, distance }) => distance <= city.serviceRadiusKm)
    .sort((a, b) => a.distance - b.distance);
  return inRadius.length > 0 ? { city: inRadius[0].city, zone: null } : null;
}

@Injectable()
export class GeoService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ localisation

  async locate(point: LatLng): Promise<Location | null> {
    const cities = await this.prisma.city.findMany({ where: { isActive: true }, include: { zones: true } });
    return locatePoint(point, cities);
  }

  async locateOrFail(point: LatLng, label = 'Cette adresse'): Promise<Location> {
    const location = await this.locate(point);
    if (!location) {
      throw new BadRequestException(`${label} est hors de nos zones de service (Ouagadougou, Tenkodogo).`);
    }
    return location;
  }

  // ------------------------------------------------------------------ villes

  listCities(includeInactive = false) {
    return this.prisma.city.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async getCity(id: string) {
    const city = await this.prisma.city.findUnique({ where: { id }, include: { zones: { orderBy: { name: 'asc' } } } });
    if (!city) throw new NotFoundException('Ville introuvable.');
    return city;
  }

  async createCity(dto: CreateCityDto, actorId: string) {
    const city = await this.prisma.city
      .create({ data: dto })
      .catch((e) => this.rethrowUnique(e, 'Une ville avec ce slug existe déjà.'));
    await this.audit.log({ actorId, action: 'city.create', entityType: 'City', entityId: city.id, after: city });
    return city;
  }

  async updateCity(id: string, dto: UpdateCityDto, actorId: string) {
    const before = await this.getCity(id);
    const city = await this.prisma.city
      .update({ where: { id }, data: dto })
      .catch((e) => this.rethrowUnique(e, 'Une ville avec ce slug existe déjà.'));
    await this.audit.log({ actorId, action: 'city.update', entityType: 'City', entityId: id, before: { ...before, zones: undefined }, after: city });
    return city;
  }

  // ------------------------------------------------------------------ zones

  listZones(cityId: string) {
    return this.prisma.zone.findMany({ where: { cityId }, orderBy: [{ priority: 'desc' }, { name: 'asc' }] });
  }

  async createZone(cityId: string, dto: CreateZoneDto, actorId: string) {
    await this.getCity(cityId);
    this.assertPolygon(dto.polygon);
    const zone = await this.prisma.zone.create({
      data: { ...dto, cityId, polygon: dto.polygon as Prisma.InputJsonValue },
    });
    await this.audit.log({ actorId, action: 'zone.create', entityType: 'Zone', entityId: zone.id, after: zone });
    return zone;
  }

  async updateZone(id: string, dto: UpdateZoneDto, actorId: string) {
    const before = await this.prisma.zone.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Zone introuvable.');
    if (dto.polygon !== undefined) this.assertPolygon(dto.polygon);
    const zone = await this.prisma.zone.update({
      where: { id },
      data: { ...dto, polygon: dto.polygon as Prisma.InputJsonValue | undefined },
    });
    await this.audit.log({ actorId, action: 'zone.update', entityType: 'Zone', entityId: id, before, after: zone });
    return zone;
  }

  async deleteZone(id: string, actorId: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: { _count: { select: { pricingRules: true, merchants: true } } },
    });
    if (!zone) throw new NotFoundException('Zone introuvable.');
    if (zone._count.pricingRules > 0 || zone._count.merchants > 0) {
      throw new BadRequestException(
        'Cette zone est utilisée par des tarifs ou des commerçants : désactivez-la plutôt que de la supprimer.',
      );
    }
    await this.prisma.zone.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'zone.delete', entityType: 'Zone', entityId: id, before: zone });
    return { success: true };
  }

  private assertPolygon(polygon: unknown) {
    const error = polygonValidationError(polygon);
    if (error) throw new BadRequestException(error);
  }

  private rethrowUnique(e: unknown, message: string): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new BadRequestException(message);
    }
    throw e;
  }
}
