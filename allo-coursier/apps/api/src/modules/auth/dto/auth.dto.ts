import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';
import { VehicleType } from '@prisma/client';

export class DriverSignupDto {
  @ApiProperty({ description: 'Ville où le livreur souhaite travailler' })
  @IsUUID()
  cityId: string;

  @ApiProperty({ enum: VehicleType })
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @ApiPropertyOptional({ example: '11 GJ 4521' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  plateNumber?: string;
}

export class RegisterDto {
  @ApiProperty({ example: '70 12 34 56' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'Awa' })
  @IsString()
  @Length(1, 60)
  firstName: string;

  @ApiProperty({ example: 'Ouédraogo' })
  @IsString()
  @Length(1, 60)
  lastName: string;

  @ApiProperty({ description: 'Code secret de 4 à 6 chiffres', example: '482913' })
  @IsString()
  pin: string;

  @ApiProperty({ enum: ['CLIENT', 'DRIVER'], default: 'CLIENT' })
  @IsIn(['CLIENT', 'DRIVER'])
  accountType: 'CLIENT' | 'DRIVER' = 'CLIENT';

  @ApiPropertyOptional({ type: DriverSignupDto, description: 'Obligatoire pour un compte livreur' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DriverSignupDto)
  driver?: DriverSignupDto;

  @ApiPropertyOptional({ example: 'Tecno Spark 10' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceLabel?: string;
}

export class LoginDto {
  @ApiProperty({ example: '70 12 34 56' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: 'Code secret (clients, livreurs) ou mot de passe (équipe)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  secret: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceLabel?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ChangeSecretDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentSecret: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  newSecret: string;
}
