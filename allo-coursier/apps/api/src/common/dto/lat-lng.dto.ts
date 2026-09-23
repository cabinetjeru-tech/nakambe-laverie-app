import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude } from 'class-validator';

export class LatLngDto {
  @ApiProperty({ example: 12.3714 })
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: -1.5197 })
  @IsLongitude()
  lng: number;
}
