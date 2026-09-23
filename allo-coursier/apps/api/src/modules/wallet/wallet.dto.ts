import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, NotEquals } from 'class-validator';
import { PayoutStatus, WalletKind } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class PayoutRequestDto {
  @ApiProperty({ example: 15000 }) @IsInt() @Min(1) @Max(5_000_000)
  amount: number;

  @ApiProperty({ description: 'Numéro Mobile Money qui recevra le paiement', example: '70 12 34 56' })
  @IsString() @IsNotEmpty()
  destinationPhone: string;
}

export class CashSettlementDto {
  @ApiProperty({ example: 12500 }) @IsInt() @Min(1) @Max(5_000_000)
  amount: number;

  @ApiProperty({ enum: ['ESPECES', 'MOBILE_MONEY'] }) @IsIn(['ESPECES', 'MOBILE_MONEY'])
  method: 'ESPECES' | 'MOBILE_MONEY';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60)
  reference?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class PayPayoutDto {
  @ApiProperty({ description: 'Référence du transfert Mobile Money effectué' }) @IsString() @Length(3, 60)
  reference: string;
}

export class RejectDto {
  @ApiProperty() @IsString() @Length(3, 300)
  reason: string;
}

export class AdjustWalletDto {
  @ApiProperty({ description: 'Positif = crédit, négatif = débit', example: -500 }) @IsInt() @NotEquals(0) @Min(-5_000_000) @Max(5_000_000)
  amount: number;

  @ApiProperty() @IsString() @Length(5, 300)
  reason: string;
}

export class WalletQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: WalletKind }) @IsOptional() @IsEnum(WalletKind)
  kind?: WalletKind;
}

export class PayoutQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PayoutStatus }) @IsOptional() @IsEnum(PayoutStatus)
  status?: PayoutStatus;
}

export class SettlementQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  driverId?: string;
}
