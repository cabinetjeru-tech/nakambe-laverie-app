import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { ComplaintCategory, ComplaintStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateComplaintDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  orderId?: string;

  @ApiProperty({ enum: ComplaintCategory }) @IsEnum(ComplaintCategory)
  category: ComplaintCategory;

  @ApiProperty() @IsString() @Length(10, 2000)
  description: string;

  @ApiPropertyOptional({ description: 'Photo (clé /uploads/COMPLAINT)' }) @IsOptional() @IsString() @MaxLength(80)
  attachmentKey?: string;
}

export class ComplaintMessageDto {
  @ApiProperty() @IsString() @Length(1, 2000)
  body: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80)
  attachmentKey?: string;

  @ApiPropertyOptional({ description: 'Note interne (équipe uniquement)' }) @IsOptional() @IsBoolean()
  isInternal?: boolean;
}

export class ComplaintQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ComplaintStatus }) @IsOptional() @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;
}

export class UpdateComplaintDto {
  @ApiPropertyOptional({ enum: ComplaintStatus }) @IsOptional() @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  assignedToId?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 2 }) @IsOptional() @IsInt() @Min(0) @Max(2)
  priority?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000)
  resolution?: string;

  @ApiPropertyOptional({ description: 'Remboursement crédité sur le portefeuille du client (FCFA)' })
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000)
  refundAmount?: number;
}
