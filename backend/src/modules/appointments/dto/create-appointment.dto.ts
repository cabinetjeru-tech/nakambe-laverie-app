import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterventionMode, ServiceDomain } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quantityNote?: string;

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
