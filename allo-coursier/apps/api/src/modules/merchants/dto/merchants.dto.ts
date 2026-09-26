import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MerchantMemberRole, MerchantStatus, MerchantType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { HHMM_REGEX } from '../../../common/utils/time';

export class BusinessDto {
  @ApiProperty({ example: 'Maquis Le Palmier' }) @IsString() @Length(2, 80)
  name: string;

  @ApiProperty({ enum: MerchantType }) @IsEnum(MerchantType)
  type: MerchantType;

  @ApiProperty({ example: '70 45 67 89' }) @IsString() @IsNotEmpty()
  phone: string;

  @ApiProperty() @IsUUID()
  cityId: string;

  @ApiProperty() @IsLatitude()
  lat: number;

  @ApiProperty() @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ example: 'Avenue Kwame Nkrumah' }) @IsOptional() @IsString() @MaxLength(200)
  addressText?: string;

  @ApiPropertyOptional({ example: 'À côté de la station Total' }) @IsOptional() @IsString() @MaxLength(200)
  landmark?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  description?: string;
}

export class PartnerOwnerDto {
  @ApiProperty() @IsString() @Length(1, 60) firstName: string;
  @ApiProperty() @IsString() @Length(1, 60) lastName: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone: string;
  @ApiProperty({ description: 'Code secret de 4 à 6 chiffres' }) @IsString() pin: string;
}

/** Inscription d'un commerce par son responsable (sans compte existant). */
export class PartnerSignupDto {
  @ApiProperty({ type: BusinessDto }) @ValidateNested() @Type(() => BusinessDto)
  business: BusinessDto;

  @ApiProperty({ type: PartnerOwnerDto }) @ValidateNested() @Type(() => PartnerOwnerDto)
  owner: PartnerOwnerDto;
}

export class MerchantQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;
  @ApiPropertyOptional({ enum: MerchantType }) @IsOptional() @IsEnum(MerchantType) type?: MerchantType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) search?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
}

export class UpdateMerchantProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) addressText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) landmark?: string;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;
  @ApiPropertyOptional({ description: 'Temps de préparation habituel (minutes)' }) @IsOptional() @IsInt() @Min(5) @Max(180) avgPrepMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) minOrderAmount?: number | null;
  @ApiPropertyOptional({ description: 'Clé /uploads/MERCHANT_MEDIA' }) @IsOptional() @IsString() @MaxLength(80) logoKey?: string;
  @ApiPropertyOptional({ description: 'Clé /uploads/MERCHANT_MEDIA' }) @IsOptional() @IsString() @MaxLength(80) coverKey?: string;
}

export class OpeningSlotDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = dimanche' }) @IsInt() @Min(0) @Max(6) weekday: number;
  @ApiProperty({ example: '08:00' }) @Matches(HHMM_REGEX) opensAt: string;
  @ApiProperty({ example: '22:00' }) @Matches(HHMM_REGEX) closesAt: string;
}

export class SetHoursDto {
  @ApiProperty({ type: [OpeningSlotDto] })
  @IsArray() @ArrayMaxSize(21) @ValidateNested({ each: true }) @Type(() => OpeningSlotDto)
  hours: OpeningSlotDto[];
}

export class ClosureDto {
  @ApiProperty() @Type(() => Date) @IsDate() startsAt: Date;
  @ApiProperty() @Type(() => Date) @IsDate() endsAt: Date;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class OpenOverrideDto {
  @ApiProperty({ description: 'true = ouvert, false = fermé, null = selon les horaires', nullable: true })
  @IsOptional() @IsBoolean()
  isOpenOverride: boolean | null;
}

export class CategoryDto {
  @ApiProperty() @IsString() @Length(1, 60) name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) position?: number;
}

export class ProductOptionDto {
  @ApiProperty({ example: 'Piment' }) @IsString() @Length(1, 60) name: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(100_000) extraPrice?: number;
}

export class ProductOptionGroupDto {
  @ApiProperty({ example: 'Accompagnement' }) @IsString() @Length(1, 60) name: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(10) minChoices?: number;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Max(10) maxChoices?: number;

  @ApiProperty({ type: [ProductOptionDto] })
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ProductOptionDto)
  options: ProductOptionDto[];
}

export class ProductDto {
  @ApiProperty({ example: 'Riz gras au poulet' }) @IsString() @Length(1, 80) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiProperty({ example: 2000 }) @IsInt() @Min(0) @Max(1_000_000) price: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string | null;
  @ApiPropertyOptional({ description: 'Clé /uploads/MERCHANT_MEDIA' }) @IsOptional() @IsString() @MaxLength(80) imageKey?: string | null;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isAvailable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) position?: number;

  @ApiPropertyOptional({ type: [ProductOptionGroupDto], description: 'Remplace toutes les options du produit' })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ProductOptionGroupDto)
  optionGroups?: ProductOptionGroupDto[];
}

export class UpdateProductDto extends PartialType(ProductDto) {}

export class AdminMerchantQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MerchantStatus }) @IsOptional() @IsEnum(MerchantStatus) status?: MerchantStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) search?: string;
}

export class AdminCreateMerchantDto {
  @ApiProperty({ type: BusinessDto }) @ValidateNested() @Type(() => BusinessDto)
  business: BusinessDto;

  @ApiProperty({ description: 'Téléphone du responsable (compte créé s’il n’existe pas)' }) @IsString() @IsNotEmpty()
  ownerPhone: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60) ownerFirstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60) ownerLastName?: string;
}

export class AdminUpdateMerchantDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED'] }) @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
  @ApiPropertyOptional({ description: 'null = taux par défaut' }) @IsOptional() @IsNumber() @Min(0) @Max(100) commissionPercent?: number | null;
  @ApiPropertyOptional({ enum: MerchantType }) @IsOptional() @IsEnum(MerchantType) type?: MerchantType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;
}

export class AddMemberDto {
  @ApiProperty() @IsString() @IsNotEmpty() phone: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60) lastName?: string;
  @ApiProperty({ enum: MerchantMemberRole }) @IsEnum(MerchantMemberRole) role: MerchantMemberRole;
}
