import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterventionMode, PaymentTiming, ServiceDomain } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AppointmentItemDto {
  @ApiProperty()
  @IsString()
  serviceId: string;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateAppointmentDto {
  @ApiProperty({ enum: ServiceDomain })
  @IsEnum(ServiceDomain)
  domain: ServiceDomain;

  @ApiProperty({ enum: InterventionMode })
  @IsEnum(InterventionMode)
  mode: InterventionMode;

  @ApiProperty()
  @IsDateString()
  scheduledDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Latitude GPS du lieu de la demande, pour faciliter la localisation du client.' })
  @IsOptional()
  @IsLatitude()
  gpsLat?: number;

  @ApiPropertyOptional({ description: 'Longitude GPS du lieu de la demande.' })
  @IsOptional()
  @IsLongitude()
  gpsLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quantityNote?: string;

  @ApiPropertyOptional({
    type: [AppointmentItemDto],
    description: 'Services et quantités choisis par le client — un devis est généré automatiquement à partir de cette liste.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppointmentItemDto)
  items?: AppointmentItemDto[];

  @ApiPropertyOptional({ enum: PaymentTiming, default: PaymentTiming.APRES_PRESTATION })
  @IsOptional()
  @IsEnum(PaymentTiming)
  paymentTiming?: PaymentTiming;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  photoUrls?: string[];

  /** Requis uniquement quand un employé crée un rendez-vous pour un client existant. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;
}
