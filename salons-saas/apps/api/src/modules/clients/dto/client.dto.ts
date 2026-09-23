import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { IsNormalizedEmail, IsPhone, IsTrimmedName } from '../../../core/http/validators';

export class CreateClientDto {
  @IsTrimmedName(120)
  fullName: string;

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
  @IsDateString({ strict: true })
  birthDate?: string;

  @IsOptional()
  @IsIn(['FEMALE', 'MALE', 'OTHER'])
  gender?: 'FEMALE' | 'MALE' | 'OTHER';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  hairType?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 30, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsUUID('all')
  preferredSalonId?: string;

  @IsOptional()
  @IsUUID('all')
  preferredStaffId?: string;

  /** Consentement aux messages promotionnels (WhatsApp/SMS), recueilli au comptoir. */
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}

export class UpdateClientDto extends PartialType(CreateClientDto) {
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
}

export class ClientQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class NoteDto {
  @IsString()
  @Length(1, 2000)
  body: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class TechnicalNoteDto {
  @IsIn(['coloration', 'allergie', 'soin', 'autre'])
  kind: 'coloration' | 'allergie' | 'soin' | 'autre';

  @IsString()
  @Length(1, 4000)
  content: string;

  @IsOptional()
  @IsUUID('all')
  appointmentId?: string;
}

export class ConsentDto {
  @IsIn(['MARKETING_SMS', 'MARKETING_WHATSAPP', 'MARKETING_EMAIL', 'PHOTOS', 'PHOTOS_PUBLIC', 'TECHNICAL_DATA'])
  type: 'MARKETING_SMS' | 'MARKETING_WHATSAPP' | 'MARKETING_EMAIL' | 'PHOTOS' | 'PHOTOS_PUBLIC' | 'TECHNICAL_DATA';

  @IsBoolean()
  granted: boolean;
}
