import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { IsNormalizedEmail, IsPhone, IsTrimmedName } from '../../../core/http/validators';

const TIMEZONES = Intl.supportedValuesOf('timeZone');

export class CreateSalonDto {
  @IsTrimmedName(150)
  name: string;

  @IsOptional()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, { message: 'Adresse de page invalide (a-z, 0-9, tirets)' })
  slug?: string;

  @IsTrimmedName(80)
  city: string;

  @IsOptional()
  @IsPhone()
  phone?: string;

  @IsOptional()
  @IsPhone()
  whatsapp?: string;

  @IsOptional()
  @IsNormalizedEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @IsOptional()
  @IsLatitude()
  gpsLat?: number;

  @IsOptional()
  @IsLongitude()
  gpsLng?: number;

  @IsOptional()
  @IsIn(TIMEZONES, { message: 'Fuseau horaire inconnu' })
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  onlineBookingEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7 * 24 * 60)
  bookingMinNoticeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  bookingMaxAdvanceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  cancellationNoticeHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  defaultDepositPercent?: number;
}

export class UpdateSalonDto extends PartialType(CreateSalonDto) {
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
