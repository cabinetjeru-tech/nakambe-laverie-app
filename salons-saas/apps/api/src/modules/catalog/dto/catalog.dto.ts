import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsMoney } from '../../../core/http/money';
import { IsTrimmedName } from '../../../core/http/validators';

export class CategoryDto {
  @IsTrimmedName(80)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CategoryDto) {}

export class VariantDto {
  @IsTrimmedName(80)
  name: string;

  @IsMoney()
  price: number;

  @IsInt()
  @Min(5)
  @Max(16 * 60)
  durationMinutes: number;
}

export class StepDto {
  @IsTrimmedName(80)
  label: string;

  @IsInt()
  @Min(5)
  @Max(16 * 60)
  durationMinutes: number;

  /** false = temps de pose : le coiffeur est libre pendant cette étape. */
  @IsBoolean()
  blocksStaff: boolean;
}

export class CreateServiceDto {
  @IsUUID('all')
  categoryId: string;

  @IsTrimmedName(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsMoney()
  basePrice: number;

  /** Prix affiché « à partir de » : ajustable à l'encaissement. */
  @IsOptional()
  @IsBoolean()
  priceIsFrom?: boolean;

  @IsInt()
  @Min(5)
  @Max(16 * 60)
  durationMinutes: number;

  @IsOptional()
  @IsBoolean()
  bookableOnline?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  depositPercent?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants?: VariantDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps?: StepDto[];

  /** Employés qui réalisent la prestation (par défaut : toute l'équipe active). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  staffIds?: string[];
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
