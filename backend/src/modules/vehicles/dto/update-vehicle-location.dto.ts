import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateVehicleLocationDto {
  @ApiProperty()
  @IsLatitude()
  lat: number;

  @ApiProperty()
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ description: 'Précision en mètres renvoyée par le navigateur.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;
}
