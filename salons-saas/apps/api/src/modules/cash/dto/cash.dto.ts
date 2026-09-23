import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsMoney } from '../../../core/http/money';

export class OpenSessionDto {
  @IsUUID('all')
  salonId: string;

  @IsMoney()
  openingFloat: number;
}

export class CloseSessionDto {
  @IsMoney()
  countedCash: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  differenceReason?: string;
}

export class CashMovementDto {
  @IsUUID('all')
  salonId: string;

  @IsIn(['CASH_IN', 'CASH_OUT', 'BANK_DEPOSIT'])
  type: 'CASH_IN' | 'CASH_OUT' | 'BANK_DEPOSIT';

  @IsMoney(1)
  amount: number;

  @IsString()
  @Length(3, 300)
  reason: string;
}

export class SaleItemDto {
  @IsIn(['SERVICE', 'PRODUCT'])
  type: 'SERVICE' | 'PRODUCT';

  /** Facultatif si la ligne reprend un rendez-vous (appointmentItemId). */
  @ValidateIf((o) => o.type === 'SERVICE' && !o.appointmentItemId)
  @IsUUID('all')
  serviceId?: string;

  @IsOptional()
  @IsUUID('all')
  variantId?: string;

  @ValidateIf((o) => o.type === 'PRODUCT')
  @IsUUID('all')
  productId?: string;

  /** Ligne de rendez-vous facturée (prix et employé repris du rendez-vous). */
  @IsOptional()
  @IsUUID('all')
  appointmentItemId?: string;

  /** Employé crédité (commission). */
  @IsOptional()
  @IsUUID('all')
  staffId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity?: number;

  /** Prix unitaire ajusté : prestation « à partir de » ou permission de modifier les prix. */
  @IsOptional()
  @IsMoney()
  unitPrice?: number;

  @IsOptional()
  @IsMoney()
  discountAmount?: number;
}

export class TipDto {
  @IsUUID('all')
  staffId: string;

  @IsMoney(1)
  amount: number;
}

export const SALE_PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY_MANUAL', 'CARD', 'BANK_TRANSFER'] as const;

export class SalePaymentDto {
  @IsIn(SALE_PAYMENT_METHODS)
  method: (typeof SALE_PAYMENT_METHODS)[number];

  @IsMoney(1)
  amount: number;

  /** Référence de la transaction Mobile Money (obligatoire pour ce moyen). */
  @ValidateIf((o) => o.method === 'MOBILE_MONEY_MANUAL')
  @IsString()
  @Length(4, 60)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  operator?: string;
}

export class CreateSaleDto {
  @IsUUID('all')
  salonId: string;

  @IsOptional()
  @IsUUID('all')
  clientId?: string;

  @IsOptional()
  @IsUUID('all')
  appointmentId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  /** Remise globale sur le ticket. */
  @IsOptional()
  @IsMoney()
  discount?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TipDto)
  tips?: TipDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** Identifiant généré par l'appareil : rejouer la même vente (réseau coupé) ne la duplique pas. */
  @IsOptional()
  @IsString()
  @Length(8, 64)
  offlineId?: string;
}

export class VoidSaleDto {
  @IsString()
  @Length(3, 300)
  reason: string;
}

export class SalesQueryDto {
  @IsOptional()
  @IsUUID('all')
  salonId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['OPEN', 'PAID', 'VOIDED'])
  status?: 'OPEN' | 'PAID' | 'VOIDED';

  @IsOptional()
  @IsUUID('all')
  cashSessionId?: string;
}

export class SessionsQueryDto {
  @IsOptional()
  @IsUUID('all')
  salonId?: string;
}

export class SalonQueryDto {
  @IsUUID('all')
  salonId: string;
}
