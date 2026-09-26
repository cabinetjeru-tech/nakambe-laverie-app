import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PaymentProvider, PaymentPurpose, PaymentStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ManualMobileMoneyDto } from '../orders/dto/orders.dto';

export class TopupDto extends ManualMobileMoneyDto {
  @ApiProperty({ example: 5000 }) @IsInt() @Min(500) @Max(1_000_000)
  amount: number;
}

export class PaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus }) @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @ApiPropertyOptional({ enum: PaymentProvider }) @IsOptional() @IsEnum(PaymentProvider) provider?: PaymentProvider;
  @ApiPropertyOptional({ enum: PaymentPurpose }) @IsOptional() @IsEnum(PaymentPurpose) purpose?: PaymentPurpose;
}

export class RejectPaymentDto {
  @ApiProperty({ example: 'Aucun transfert reçu avec cette référence' }) @IsString() @Length(3, 300)
  reason: string;
}
