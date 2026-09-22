import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { DriverStatus, EmploymentType, VehicleType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class DriverQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DriverStatus }) @IsOptional() @IsEnum(DriverStatus)
  status?: DriverStatus;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  cityId?: string;

  @ApiPropertyOptional({ enum: EmploymentType }) @IsOptional() @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ description: 'Nom ou téléphone' }) @IsOptional() @IsString() @MaxLength(60)
  search?: string;
}

export class RejectDriverDto {
  @ApiProperty({ example: 'Photo de la CNIB illisible' })
  @IsString() @Length(3, 300)
  reason: string;
}

export class UpdateDriverDto {
  @ApiPropertyOptional({ enum: ['APPROVED', 'SUSPENDED'] })
  @IsOptional() @IsIn([DriverStatus.APPROVED, DriverStatus.SUSPENDED])
  status?: 'APPROVED' | 'SUSPENDED';

  @ApiPropertyOptional({ enum: EmploymentType }) @IsOptional() @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: VehicleType }) @IsOptional() @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  plateNumber?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  cityId?: string;

  @ApiPropertyOptional({ description: 'Plafond de dette espèces (FCFA) ; null = réglage global' })
  @IsOptional() @IsInt() @Min(0)
  cashDebtLimit?: number | null;

  @ApiPropertyOptional({ description: 'Commission propre (indépendants), en % ; null = celle du tarif' })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  commissionPercent?: number | null;
}

export class CreateDriverDto {
  @ApiProperty({ example: '76 00 00 10' }) @IsString() @IsNotEmpty()
  phone: string;

  @ApiProperty() @IsString() @Length(1, 60)
  firstName: string;

  @ApiProperty() @IsString() @Length(1, 60)
  lastName: string;

  @ApiProperty() @IsUUID()
  cityId: string;

  @ApiProperty({ enum: VehicleType }) @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @ApiProperty({ enum: EmploymentType }) @IsEnum(EmploymentType)
  employmentType: EmploymentType;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  plateNumber?: string;
}
