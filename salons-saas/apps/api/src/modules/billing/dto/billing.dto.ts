import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

export class ChangePlanDto {
  @IsString()
  @Length(1, 30)
  planCode!: string;

  @IsIn(['MONTHLY', 'YEARLY'], { message: 'Cycle MONTHLY ou YEARLY attendu' })
  cycle!: 'MONTHLY' | 'YEARLY';
}

export class PayInvoiceDto {
  @IsIn(['MOBILE_MONEY_MANUAL', 'ONLINE'], { message: 'Mode de paiement MOBILE_MONEY_MANUAL ou ONLINE attendu' })
  method!: 'MOBILE_MONEY_MANUAL' | 'ONLINE';

  /** Référence de la transaction Mobile Money (SMS de confirmation de l'opérateur). */
  @ValidateIf((dto: PayInvoiceDto) => dto.method === 'MOBILE_MONEY_MANUAL')
  @IsString()
  @Matches(/^[A-Za-z0-9.\-_/]{4,40}$/, { message: 'Référence de transaction invalide (4 à 40 caractères, lettres et chiffres)' })
  reference?: string;

  @IsOptional()
  @IsString()
  @Length(2, 40)
  operator?: string;

  @IsOptional()
  @IsString()
  @Length(6, 20)
  payerPhone?: string;
}

export class NotificationQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  unread?: 'true' | 'false';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SandboxCompleteDto {
  @IsIn(['SUCCEEDED', 'FAILED'])
  outcome!: 'SUCCEEDED' | 'FAILED';

  /** Montant réellement « payé » (tests d'un montant falsifié). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount?: number;
}

export class ReasonDto {
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class ExtendTrialDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days!: number;
}
