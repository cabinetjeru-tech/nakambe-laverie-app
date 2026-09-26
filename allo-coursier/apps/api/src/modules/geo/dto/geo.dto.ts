import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateCityDto {
  @ApiProperty({ example: 'Ouagadougou' })
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty({ example: 'ouagadougou' })
  @Matches(/^[a-z0-9-]{2,60}$/, { message: 'Le slug ne doit contenir que des minuscules, chiffres et tirets.' })
  slug: string;

  @ApiProperty({ example: 12.3714 })
  @IsLatitude()
  centerLat: number;

  @ApiProperty({ example: -1.5197 })
  @IsLongitude()
  centerLng: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  serviceRadiusKm?: number;

  @ApiPropertyOptional({ default: 'Africa/Ouagadougou' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCityDto extends PartialType(CreateCityDto) {}

export class CreateZoneDto {
  @ApiProperty({ example: 'Ouaga 2000' })
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty({
    description: 'Polygone GeoJSON, coordonnées en [longitude, latitude], contour fermé',
    example: { type: 'Polygon', coordinates: [[[-1.53, 12.30], [-1.49, 12.30], [-1.49, 12.33], [-1.53, 12.33], [-1.53, 12.30]]] },
  })
  @IsDefined()
  @IsObject()
  polygon: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateZoneDto extends PartialType(CreateZoneDto) {}

export class LocateQueryDto {
  @ApiProperty()
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty()
  @Type(() => Number)
  @IsLongitude()
  lng: number;
}
