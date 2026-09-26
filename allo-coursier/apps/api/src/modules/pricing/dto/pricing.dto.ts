import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DeliverySpeed, ServiceType, VehicleType } from '@prisma/client';
import { LatLngDto } from '../../../common/dto/lat-lng.dto';
import { HHMM_REGEX } from '../../../common/utils/time';

const HHMM_MESSAGE = 'Heure attendue au format HH:mm (ex. 21:00).';

/** Paramètres de calcul d'une règle (partagés entre création et simulation). */
export class PricingParamsDto {
  @ApiProperty({ description: 'Prise en charge (FCFA)', example: 500 })
  @IsInt() @Min(0)
  baseFare: number;

  @ApiProperty({ description: 'Prix minimum de la course (FCFA)', example: 1000 })
  @IsInt() @Min(0)
  minFare: number;

  @ApiProperty({ description: 'Prix par kilomètre (FCFA)', example: 150 })
  @IsInt() @Min(0)
  pricePerKm: number;

  @ApiPropertyOptional({ description: 'Kilomètres inclus dans la prise en charge', default: 0 })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  includedKm?: number;

  @ApiPropertyOptional({ description: 'Supplément express fixe (FCFA)', default: 0 })
  @IsOptional() @IsInt() @Min(0)
  expressFixed?: number;

  @ApiPropertyOptional({ description: 'Supplément express en % du prix de course', default: 0 })
  @IsOptional() @IsNumber() @Min(0) @Max(500)
  expressPercent?: number;

  @ApiPropertyOptional({ description: "Minutes d'attente gratuites", default: 10 })
  @IsOptional() @IsInt() @Min(0) @Max(240)
  waitingFreeMinutes?: number;

  @ApiPropertyOptional({ description: "Prix d'une minute d'attente au-delà du temps gratuit (FCFA)", default: 0 })
  @IsOptional() @IsInt() @Min(0)
  waitingPricePerMinute?: number;

  @ApiPropertyOptional({ description: 'Supplément de nuit (FCFA)', default: 0 })
  @IsOptional() @IsInt() @Min(0)
  nightSurcharge?: number;

  @ApiPropertyOptional({ example: '21:00' })
  @ValidateIf((o) => o.nightStart != null || o.nightEnd != null)
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  nightStart?: string | null;

  @ApiPropertyOptional({ example: '06:00' })
  @ValidateIf((o) => o.nightStart != null || o.nightEnd != null)
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  nightEnd?: string | null;

  @ApiPropertyOptional({ description: "Frais d'achat en % du montant avancé", default: 0 })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  purchaseFeePercent?: number;

  @ApiPropertyOptional({ description: "Frais d'achat minimum (FCFA)", default: 0 })
  @IsOptional() @IsInt() @Min(0)
  purchaseFeeMin?: number;

  @ApiPropertyOptional({ description: 'Prix par arrêt supplémentaire (FCFA)', default: 0 })
  @IsOptional() @IsInt() @Min(0)
  extraStopFee?: number;

  @ApiProperty({ description: 'Commission plateforme en % des frais de livraison', example: 20 })
  @IsNumber() @Min(0) @Max(100)
  commissionPercent: number;

  @ApiPropertyOptional({ description: 'Arrondi au multiple supérieur (FCFA)', default: 50 })
  @IsOptional() @IsInt() @Min(1) @Max(1000)
  roundingStep?: number;
}

export class CreatePricingRuleDto extends PricingParamsDto {
  @ApiProperty({ example: 'Ouagadougou — moto — standard' })
  @IsString() @Length(2, 120)
  name: string;

  @ApiProperty()
  @IsUUID()
  cityId: string;

  @ApiPropertyOptional({ description: 'Vide = toute la ville' })
  @IsOptional() @IsUUID()
  zoneId?: string | null;

  @ApiPropertyOptional({ enum: ServiceType, description: 'Vide = tous les services' })
  @IsOptional() @IsEnum(ServiceType)
  serviceType?: ServiceType | null;

  @ApiPropertyOptional({ enum: VehicleType, description: 'Vide = tous les véhicules' })
  @IsOptional() @IsEnum(VehicleType)
  vehicleType?: VehicleType | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt()
  priority?: number;

  @ApiPropertyOptional({ description: "Date d'entrée en vigueur (par défaut : maintenant)" })
  @IsOptional() @Type(() => Date) @IsDate()
  validFrom?: Date;

  @ApiPropertyOptional({ description: 'Date de fin (vide = sans fin)' })
  @IsOptional() @Type(() => Date) @IsDate()
  validTo?: Date | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdatePricingRuleDto extends PartialType(OmitType(CreatePricingRuleDto, ['cityId'] as const)) {}

export class PricingRuleQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Matches(/^(true|false)$/)
  isActive?: string;
}

export class QuoteRequestDto {
  @ApiProperty({ type: LatLngDto })
  @ValidateNested() @Type(() => LatLngDto)
  pickup: LatLngDto;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested() @Type(() => LatLngDto)
  dropoff: LatLngDto;

  @ApiPropertyOptional({ type: [LatLngDto], description: 'Arrêts intermédiaires (3 au maximum)' })
  @IsOptional() @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => LatLngDto)
  waypoints?: LatLngDto[];

  @ApiProperty({ enum: ServiceType, example: ServiceType.PARCEL })
  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @ApiPropertyOptional({ enum: VehicleType, default: VehicleType.MOTO })
  @IsOptional() @IsEnum(VehicleType)
  vehicleType: VehicleType = VehicleType.MOTO;

  @ApiPropertyOptional({ description: 'Pour une livraison programmée' })
  @IsOptional() @Type(() => Date) @IsDate()
  scheduledAt?: Date;

  @ApiPropertyOptional({ description: 'Budget des achats (courses / achats par le livreur), FCFA' })
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000)
  purchaseAmount?: number;
}

export class SimulateQuoteDto {
  @ApiPropertyOptional({ description: "Règle existante à simuler ; sinon renseigner 'params'" })
  @IsOptional() @IsUUID()
  ruleId?: string;

  @ApiPropertyOptional({ type: PricingParamsDto, description: 'Paramètres d’une règle en projet' })
  @ValidateIf((o) => !o.ruleId)
  @ValidateNested() @Type(() => PricingParamsDto)
  params?: PricingParamsDto;

  @ApiProperty({ example: 6.5 })
  @IsNumber() @Min(0) @Max(500)
  distanceKm: number;

  @ApiPropertyOptional({ enum: DeliverySpeed, default: DeliverySpeed.STANDARD })
  @IsOptional() @IsEnum(DeliverySpeed)
  speed: DeliverySpeed = DeliverySpeed.STANDARD;

  @ApiPropertyOptional({ example: '14:30', default: '12:00' })
  @IsOptional() @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  localTime: string = '12:00';

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  purchaseAmount?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10)
  extraStops?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(600)
  waitingMinutes?: number;
}
