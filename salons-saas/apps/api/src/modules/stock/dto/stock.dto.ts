import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsMoney } from '../../../core/http/money';
import { IsNormalizedEmail, IsPhone, IsTrimmedName } from '../../../core/http/validators';

export class SupplierDto {
  @IsTrimmedName(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact?: string;

  @IsOptional()
  @IsPhone()
  phone?: string;

  @IsOptional()
  @IsNormalizedEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSupplierDto extends PartialType(SupplierDto) {}

export class ProductDto {
  @IsTrimmedName(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  barcode?: string;

  @IsIn(['RETAIL', 'PROFESSIONAL', 'BOTH'])
  kind: 'RETAIL' | 'PROFESSIONAL' | 'BOTH';

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsMoney()
  purchasePrice: number;

  @IsOptional()
  @IsMoney()
  salePrice?: number;

  @IsOptional()
  @IsUUID('all')
  supplierId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto extends PartialType(ProductDto) {}


export class ReceiptLineDto {
  @IsUUID('all')
  productId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(1_000_000)
  quantity: number;

  @IsMoney()
  unitCost: number;
}

export class StockReceiptDto {
  @IsUUID('all')
  salonId: string;

  @IsOptional()
  @IsUUID('all')
  supplierId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines: ReceiptLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class StockAdjustmentDto {
  @IsUUID('all')
  salonId: string;

  @IsUUID('all')
  productId: string;

  /** Inventaire : quantité comptée (le système calcule l'écart). */
  @IsIn(['COUNT', 'LOSS'])
  mode: 'COUNT' | 'LOSS';

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1_000_000)
  quantity: number;

  @IsString()
  @MaxLength(300)
  reason: string;
}

export class StockConsumptionDto {
  @IsUUID('all')
  salonId: string;

  @IsUUID('all')
  productId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(1_000_000)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class TransferLineDto {
  @IsUUID('all')
  productId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(1_000_000)
  quantity: number;
}

export class StockTransferDto {
  @IsUUID('all')
  fromSalonId: string;

  @IsUUID('all')
  toSalonId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines: TransferLineDto[];
}

export class ThresholdDto {
  @IsUUID('all')
  salonId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  alertThreshold: number;
}

export class ProductQueryDto {
  @IsOptional()
  @IsUUID('all')
  salonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  lowStock?: boolean;

  @IsOptional()
  @IsIn(['RETAIL', 'PROFESSIONAL', 'BOTH'])
  kind?: 'RETAIL' | 'PROFESSIONAL' | 'BOTH';
}


export class MovementQueryDto {
  @IsOptional()
  @IsUUID('all')
  salonId?: string;

  @IsOptional()
  @IsUUID('all')
  productId?: string;
}
