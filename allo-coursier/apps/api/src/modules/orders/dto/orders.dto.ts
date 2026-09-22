import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DeliverySpeed,
  MobileMoneyOperator,
  OrderStatus,
  PackageSize,
  ServiceType,
  StopKind,
  VehicleType,
} from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class StopInputDto {
  @ApiProperty({ example: 12.3569 }) @IsLatitude()
  lat: number;

  @ApiProperty({ example: -1.5352 }) @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ example: 'Gounghin, rue 17.32' }) @IsOptional() @IsString() @MaxLength(200)
  addressText?: string;

  @ApiProperty({ example: 'Près du marché, portail bleu' }) @IsString() @Length(3, 200)
  landmark: string;

  @ApiProperty({ example: 'Awa Ouédraogo' }) @IsString() @Length(2, 80)
  contactName: string;

  @ApiProperty({ example: '70 11 22 33' }) @IsString() @IsNotEmpty()
  contactPhone: string;
}

export class OrderItemInputDto {
  @ApiProperty({ example: '2 kg de riz' }) @IsString() @Length(1, 120)
  label: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Max(999)
  quantity?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}

export class ManualMobileMoneyDto {
  @ApiProperty({ enum: MobileMoneyOperator }) @IsEnum(MobileMoneyOperator)
  operator: MobileMoneyOperator;

  @ApiProperty({ description: 'Référence de la transaction reçue par SMS', example: 'CI230922.1542.A12345' })
  @IsString() @Length(4, 60)
  reference: string;

  @ApiProperty({ description: 'Numéro qui a envoyé l’argent', example: '70 11 22 33' })
  @IsString() @IsNotEmpty()
  payerPhone: string;
}

export class CreateOrderDto {
  @ApiProperty({ enum: ServiceType }) @IsIn([ServiceType.PARCEL, ServiceType.PICKUP_DROP, ServiceType.ERRAND, ServiceType.PURCHASE])
  serviceType: ServiceType;

  @ApiPropertyOptional({ enum: DeliverySpeed, default: DeliverySpeed.STANDARD }) @IsOptional() @IsEnum(DeliverySpeed)
  speed: DeliverySpeed = DeliverySpeed.STANDARD;

  @ApiPropertyOptional({ enum: VehicleType, default: VehicleType.MOTO }) @IsOptional() @IsEnum(VehicleType)
  vehicleType: VehicleType = VehicleType.MOTO;

  @ApiProperty({ type: StopInputDto, description: 'Ramassage (pour les courses : lieu d’achat, ex. marché)' })
  @ValidateNested() @Type(() => StopInputDto)
  pickup: StopInputDto;

  @ApiProperty({ type: StopInputDto }) @ValidateNested() @Type(() => StopInputDto)
  dropoff: StopInputDto;

  @ApiPropertyOptional({ example: 'Enveloppe de documents' }) @IsOptional() @IsString() @MaxLength(300)
  packageDescription?: string;

  @ApiPropertyOptional({ enum: PackageSize }) @IsOptional() @IsEnum(PackageSize)
  packageSize?: PackageSize;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isFragile?: boolean;

  @ApiPropertyOptional({ type: [OrderItemInputDto], description: 'Liste de courses' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];

  @ApiPropertyOptional({ description: 'Budget maximum des achats (FCFA)', example: 10000 })
  @IsOptional() @IsInt() @Min(500) @Max(500_000)
  purchaseBudget?: number;

  @ApiPropertyOptional({ description: 'Livraison programmée' }) @IsOptional() @Type(() => Date) @IsDate()
  scheduledAt?: Date;

  @ApiProperty({ enum: ['CASH', 'WALLET', 'MANUAL_MOBILE_MONEY'] })
  @IsIn(['CASH', 'WALLET', 'MANUAL_MOBILE_MONEY'])
  paymentMethod: 'CASH' | 'WALLET' | 'MANUAL_MOBILE_MONEY';

  @ApiPropertyOptional({ enum: StopKind, description: 'Espèces : payées au ramassage ou à la livraison' })
  @IsOptional() @IsEnum(StopKind)
  cashCollectAt?: StopKind;

  @ApiPropertyOptional({ type: ManualMobileMoneyDto, description: 'Mobile Money : référence déjà disponible' })
  @IsOptional() @ValidateNested() @Type(() => ManualMobileMoneyDto)
  mobileMoney?: ManualMobileMoneyDto;

  @ApiPropertyOptional({ example: 'BIENVENUE' }) @IsOptional() @IsString() @MaxLength(20)
  promoCode?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class CancelOrderDto {
  @ApiProperty({ example: 'Je n’ai plus besoin de la livraison' }) @IsString() @Length(3, 300)
  reason: string;
}

export class OrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus, isArray: true })
  @IsOptional() @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus | OrderStatus[];
}

export class AdminOrderQueryDto extends OrderQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() driverId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
  @ApiPropertyOptional({ description: 'Référence, nom ou téléphone' }) @IsOptional() @IsString() @MaxLength(60) search?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

export class GeoPointDto {
  @ApiProperty() @IsLatitude() lat: number;
  @ApiProperty() @IsLongitude() lng: number;
}

export class DriverActionDto {
  @ApiProperty({ enum: ['ARRIVED_PICKUP', 'START_PURCHASE', 'PICKED_UP', 'ARRIVED_DROPOFF', 'FAIL', 'RETURN'] })
  @IsIn(['ARRIVED_PICKUP', 'START_PURCHASE', 'PICKED_UP', 'ARRIVED_DROPOFF', 'FAIL', 'RETURN'])
  action: 'ARRIVED_PICKUP' | 'START_PURCHASE' | 'PICKED_UP' | 'ARRIVED_DROPOFF' | 'FAIL' | 'RETURN';

  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;

  @ApiPropertyOptional({ description: 'Obligatoire en cas d’échec' }) @IsOptional() @IsString() @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({ description: 'Heure réelle de l’action (file hors connexion)' }) @IsOptional() @Type(() => Date) @IsDate()
  occurredAt?: Date;
}

export class PurchaseDto {
  @ApiProperty({ example: 8750 }) @IsInt() @Min(1) @Max(1_000_000)
  actualAmount: number;

  @ApiProperty({ description: 'Photo du ticket (clé renvoyée par /uploads/RECEIPT)' }) @IsString() @MaxLength(80)
  receiptFileKey: string;
}

export class DeliverDto {
  @ApiPropertyOptional({ example: '4821' }) @IsOptional() @IsString() @Length(4, 4)
  code?: string;

  @ApiPropertyOptional({ description: 'Photo de la remise (clé /uploads/DELIVERY_PROOF)' }) @IsOptional() @IsString() @MaxLength(80)
  photoFileKey?: string;

  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() occurredAt?: Date;
}

export class AssignDriverDto {
  @ApiProperty() @IsUUID() driverId: string;
}

export class AdminStatusDto {
  @ApiProperty({ enum: ['DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'] })
  @IsIn(['DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'])
  status: 'DELIVERED' | 'FAILED' | 'RETURNED' | 'CANCELLED';

  @ApiProperty() @IsString() @Length(3, 300)
  reason: string;
}

export class RatingDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5)
  score: number;

  @ApiPropertyOptional({ type: [String], example: ['Rapide', 'Poli'] })
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(30, { each: true })
  tags?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  comment?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: 'Identifiant généré par l’application (anti-doublon)' }) @IsString() @Length(8, 64)
  clientMessageId: string;

  @ApiProperty({ enum: ['TEXT', 'QUICK_REPLY', 'LOCATION', 'IMAGE'] }) @IsIn(['TEXT', 'QUICK_REPLY', 'LOCATION', 'IMAGE'])
  type: 'TEXT' | 'QUICK_REPLY' | 'LOCATION' | 'IMAGE';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  body?: string;

  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;

  @ApiPropertyOptional({ description: 'Clé /uploads/CHAT' }) @IsOptional() @IsString() @MaxLength(80)
  attachmentKey?: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ description: 'Messages postérieurs à cette date (synchronisation)' })
  @IsOptional() @Type(() => Date) @IsDate()
  after?: Date;
}

export class LocationPointDto extends GeoPointDto {
  @ApiPropertyOptional() @IsOptional() @Min(0) @Max(100) speed?: number;
  @ApiPropertyOptional() @IsOptional() @Min(0) @Max(360) heading?: number;
  @ApiPropertyOptional() @IsOptional() @Min(0) @Max(10000) accuracy?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() recordedAt?: Date;
}

export class LocationBatchDto {
  @ApiProperty({ type: [LocationPointDto], description: 'Positions (plusieurs si le réseau était coupé)' })
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LocationPointDto)
  points: LocationPointDto[];
}

export class OnlineDto {
  @ApiProperty() @IsBoolean() online: boolean;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;
}

export class RejectOfferDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

// ---------------------------------------------------------------------------- repas et commerces

export class CartItemDto {
  @ApiProperty() @IsUUID()
  productId: string;

  @ApiProperty({ minimum: 1, maximum: 50 }) @IsInt() @Min(1) @Max(50)
  quantity: number;

  @ApiPropertyOptional({ type: [String], description: 'Choix retenus (identifiants des options)' })
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('4', { each: true })
  optionIds?: string[];

  @ApiPropertyOptional({ example: 'Sans oignons' }) @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}

export class FoodQuoteDto {
  @ApiProperty() @IsUUID()
  merchantId: string;

  @ApiProperty({ type: [CartItemDto] })
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CartItemDto)
  items: CartItemDto[];

  @ApiProperty({ type: GeoPointDto }) @ValidateNested() @Type(() => GeoPointDto)
  dropoff: GeoPointDto;
}

export class CreateFoodOrderDto {
  @ApiProperty() @IsUUID()
  merchantId: string;

  @ApiProperty({ type: [CartItemDto] })
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CartItemDto)
  items: CartItemDto[];

  @ApiProperty({ type: StopInputDto }) @ValidateNested() @Type(() => StopInputDto)
  dropoff: StopInputDto;

  @ApiPropertyOptional({ enum: DeliverySpeed, default: DeliverySpeed.STANDARD }) @IsOptional() @IsEnum(DeliverySpeed)
  speed: DeliverySpeed = DeliverySpeed.STANDARD;

  @ApiProperty({ enum: ['CASH', 'WALLET', 'MANUAL_MOBILE_MONEY'] }) @IsIn(['CASH', 'WALLET', 'MANUAL_MOBILE_MONEY'])
  paymentMethod: 'CASH' | 'WALLET' | 'MANUAL_MOBILE_MONEY';

  @ApiPropertyOptional({ type: ManualMobileMoneyDto }) @IsOptional() @ValidateNested() @Type(() => ManualMobileMoneyDto)
  mobileMoney?: ManualMobileMoneyDto;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  promoCode?: string;

  @ApiPropertyOptional({ description: 'Message pour le commerçant et le livreur' }) @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class MerchantAcceptDto {
  @ApiProperty({ description: 'Temps de préparation annoncé (minutes)', example: 20 }) @IsInt() @Min(1) @Max(180)
  prepMinutes: number;
}

export class MerchantOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'ACTIVE', 'DONE'] }) @IsOptional() @IsIn(['PENDING', 'ACTIVE', 'DONE'])
  view?: 'PENDING' | 'ACTIVE' | 'DONE';
}

export class MerchantPayoutDto {
  @ApiProperty({ example: 25000 }) @IsInt() @Min(1) @Max(10_000_000)
  amount: number;

  @ApiProperty({ description: 'Numéro Mobile Money qui recevra le reversement' }) @IsString() @IsNotEmpty()
  destinationPhone: string;
}
