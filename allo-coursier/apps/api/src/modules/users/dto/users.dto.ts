import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60)
  firstName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60)
  lastName?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail()
  email?: string | null;
}

export class CreateAddressDto {
  @ApiProperty({ example: 'Maison' })
  @IsString() @Length(1, 40)
  label: string;

  @ApiProperty({ example: 12.3714 }) @IsLatitude()
  lat: number;

  @ApiProperty({ example: -1.5197 }) @IsLongitude()
  lng: number;

  @ApiProperty({ example: 'Derrière la pharmacie du Progrès, portail bleu' })
  @IsString() @Length(3, 200)
  landmark: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  details?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80)
  contactName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
