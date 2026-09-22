import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DeliverySpeed, PricingRule, Prisma, ServiceType } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { localTimeHHmm } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { GeoService } from '../geo/geo.service';
import { RoutingService } from '../geo/routing.service';
import {
  CreatePricingRuleDto,
  PricingParamsDto,
  PricingRuleQueryDto,
  QuoteRequestDto,
  SimulateQuoteDto,
  UpdatePricingRuleDto,
} from './dto/pricing.dto';
import { computeQuote, PricingRuleParams, selectPricingRule } from './pricing.engine';

const PURCHASE_SERVICES: ServiceType[] = [ServiceType.ERRAND, ServiceType.PURCHASE];

/** Valeurs par défaut des paramètres facultatifs (identiques à celles du schéma). */
export function toParams(p: PricingParamsDto | PricingRule): PricingRuleParams {
  return {
    baseFare: p.baseFare,
    minFare: p.minFare,
    pricePerKm: p.pricePerKm,
    includedKm: p.includedKm ?? 0,
    expressFixed: p.expressFixed ?? 0,
    expressPercent: p.expressPercent ?? 0,
    waitingFreeMinutes: p.waitingFreeMinutes ?? 10,
    waitingPricePerMinute: p.waitingPricePerMinute ?? 0,
    nightSurcharge: p.nightSurcharge ?? 0,
    nightStart: p.nightStart ?? null,
    nightEnd: p.nightEnd ?? null,
    purchaseFeePercent: p.purchaseFeePercent ?? 0,
    purchaseFeeMin: p.purchaseFeeMin ?? 0,
    extraStopFee: p.extraStopFee ?? 0,
    commissionPercent: p.commissionPercent,
    roundingStep: p.roundingStep ?? 50,
  };
}

@Injectable()
export class PricingService {
  constructor(
    private prisma: PrismaService,
    private geo: GeoService,
    private routing: RoutingService,
    private audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ devis client

  /**
   * Calcule le prix d'une course pour les deux vitesses (standard et express) en un seul appel,
   * afin que l'application affiche le choix sans second aller-retour réseau.
   */
  async quote(dto: QuoteRequestDto) {
    const at = dto.scheduledAt ?? new Date();
    const pickupLoc = await this.geo.locateOrFail(dto.pickup, "L'adresse de ramassage");
    const dropoffLoc = await this.geo.locateOrFail(dto.dropoff, "L'adresse de livraison");
    for (const [i, wp] of (dto.waypoints ?? []).entries()) {
      const loc = await this.geo.locateOrFail(wp, `L'arrêt n°${i + 1}`);
      if (loc.city.id !== pickupLoc.city.id) {
        throw new BadRequestException('Tous les arrêts doivent être dans la même ville.');
      }
    }
    if (pickupLoc.city.id !== dropoffLoc.city.id) {
      throw new BadRequestException("Les livraisons entre deux villes ne sont pas encore disponibles.");
    }
    const city = pickupLoc.city;

    const rules = await this.prisma.pricingRule.findMany({ where: { cityId: city.id, isActive: true } });
    const rule = selectPricingRule(rules, {
      zoneId: pickupLoc.zone?.id ?? null,
      serviceType: dto.serviceType,
      vehicleType: dto.vehicleType,
      at,
    });
    if (!rule) {
      throw new UnprocessableEntityException(
        `Aucun tarif n'est configuré pour ce service à ${city.name}. Contactez le service client.`,
      );
    }

    const path = [dto.pickup, ...(dto.waypoints ?? []), dto.dropoff];
    const route = await this.routing.estimatePath(path);
    const localTime = localTimeHHmm(at, city.timezone);
    const purchaseAmount = PURCHASE_SERVICES.includes(dto.serviceType) ? dto.purchaseAmount ?? 0 : 0;
    const base = {
      distanceKm: route.distanceKm,
      localTime,
      purchaseAmount,
      extraStops: dto.waypoints?.length ?? 0,
    };
    const params = toParams(rule);

    return {
      city: { id: city.id, name: city.name },
      zone: pickupLoc.zone ? { id: pickupLoc.zone.id, name: pickupLoc.zone.name } : null,
      rule: { id: rule.id, name: rule.name },
      serviceType: dto.serviceType,
      vehicleType: dto.vehicleType,
      at,
      localTime,
      distanceKm: route.distanceKm,
      routingMethod: route.method,
      standard: computeQuote(params, { ...base, speed: DeliverySpeed.STANDARD }),
      express: computeQuote(params, { ...base, speed: DeliverySpeed.EXPRESS }),
    };
  }

  // ------------------------------------------------------------------ simulateur (admin)

  async simulate(dto: SimulateQuoteDto) {
    let params: PricingRuleParams;
    if (dto.ruleId) {
      params = toParams(await this.getRule(dto.ruleId));
    } else if (dto.params) {
      this.assertNightRange(dto.params);
      params = toParams(dto.params);
    } else {
      throw new BadRequestException("Indiquez une règle existante (ruleId) ou des paramètres (params).");
    }
    return computeQuote(params, {
      distanceKm: dto.distanceKm,
      speed: dto.speed,
      localTime: dto.localTime,
      purchaseAmount: dto.purchaseAmount,
      extraStops: dto.extraStops,
      waitingMinutes: dto.waitingMinutes,
    });
  }

  // ------------------------------------------------------------------ règles (admin)

  listRules(query: PricingRuleQueryDto) {
    return this.prisma.pricingRule.findMany({
      where: {
        cityId: query.cityId,
        isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
      },
      include: { city: { select: { id: true, name: true } }, zone: { select: { id: true, name: true } } },
      orderBy: [{ cityId: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getRule(id: string) {
    const rule = await this.prisma.pricingRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Règle de tarif introuvable.');
    return rule;
  }

  async createRule(dto: CreatePricingRuleDto, actorId: string) {
    await this.assertRuleConsistency(dto.cityId, dto);
    const rule = await this.prisma.pricingRule.create({ data: { ...dto, createdById: actorId } });
    await this.audit.log({ actorId, action: 'pricing_rule.create', entityType: 'PricingRule', entityId: rule.id, after: rule });
    return rule;
  }

  async updateRule(id: string, dto: UpdatePricingRuleDto, actorId: string) {
    const before = await this.getRule(id);
    await this.assertRuleConsistency(before.cityId, { ...before, ...dto });
    const rule = await this.prisma.pricingRule.update({ where: { id }, data: dto as Prisma.PricingRuleUpdateInput });
    await this.audit.log({ actorId, action: 'pricing_rule.update', entityType: 'PricingRule', entityId: id, before, after: rule });
    return rule;
  }

  /** Les commandes gardent le détail de prix figé : désactiver une règle n'altère aucun historique. */
  async deactivateRule(id: string, actorId: string) {
    const before = await this.getRule(id);
    const rule = await this.prisma.pricingRule.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ actorId, action: 'pricing_rule.deactivate', entityType: 'PricingRule', entityId: id, before, after: rule });
    return rule;
  }

  private async assertRuleConsistency(
    cityId: string,
    rule: Partial<CreatePricingRuleDto> & { minFare?: number; baseFare?: number },
  ) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) throw new BadRequestException('Ville introuvable.');
    if (rule.zoneId) {
      const zone = await this.prisma.zone.findUnique({ where: { id: rule.zoneId } });
      if (!zone || zone.cityId !== cityId) throw new BadRequestException("La zone n'appartient pas à cette ville.");
    }
    if (rule.validFrom && rule.validTo && rule.validTo <= rule.validFrom) {
      throw new BadRequestException('La date de fin doit être postérieure à la date de début.');
    }
    this.assertNightRange(rule);
  }

  private assertNightRange(p: { nightStart?: string | null; nightEnd?: string | null; nightSurcharge?: number }) {
    const hasStart = !!p.nightStart;
    const hasEnd = !!p.nightEnd;
    if (hasStart !== hasEnd) {
      throw new BadRequestException('Renseignez à la fois le début et la fin de la plage de nuit.');
    }
    if ((p.nightSurcharge ?? 0) > 0 && !hasStart) {
      throw new BadRequestException('Un supplément de nuit nécessite une plage horaire de nuit.');
    }
  }
}
