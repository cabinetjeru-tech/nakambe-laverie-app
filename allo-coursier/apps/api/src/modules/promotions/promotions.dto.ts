import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';
import { PromotionFunder, PromotionType, ServiceType } from '@prisma/client';

export class CreatePromotionDto {
  @ApiPropertyOptional({ example: 'BIENVENUE', description: 'Code saisi par le client' })
  @IsOptional() @Matches(/^[A-Za-z0-9_-]{3,20}$/, { message: 'Code de 3 à 20 lettres ou chiffres.' })
  code?: string;

  @ApiProperty({ example: 'Bienvenue — 1re livraison à -50 %' })
  @IsString() @Length(2, 100)
  name: string;

  @ApiProperty({ enum: PromotionType }) @IsEnum(PromotionType)
  type: PromotionType;

  @ApiProperty({ description: '% ou montant en FCFA selon le type (ignoré pour la livraison offerte)', example: 50 })
  @IsInt() @Min(0)
  value: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  maxDiscount?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  minOrderAmount?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  cityId?: string | null;

  @ApiPropertyOptional({ enum: ServiceType }) @IsOptional() @IsEnum(ServiceType)
  serviceType?: ServiceType | null;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  usageLimit?: number | null;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1)
  perUserLimit?: number | null;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  firstOrderOnly?: boolean;

  @ApiPropertyOptional({ enum: PromotionFunder }) @IsOptional() @IsEnum(PromotionFunder)
  fundedBy?: PromotionFunder;

  @ApiProperty() @Type(() => Date) @IsDate()
  startsAt: Date;

  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate()
  endsAt?: Date | null;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}
