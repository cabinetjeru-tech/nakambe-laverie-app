import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

/** Champs qu'un client peut modifier lui-même depuis son espace (jamais son numéro client, son type ou ses points). */
export class UpdateOwnProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  gpsLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  gpsLng?: number;
}
