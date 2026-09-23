import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const APPOINTMENT_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED_BY_CLIENT',
  'CANCELLED_BY_SALON',
  'NO_SHOW',
] as const;
export type AppointmentStatusValue = (typeof APPOINTMENT_STATUSES)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AppointmentItemDto {
  @IsUUID('all')
  serviceId: string;

  @IsOptional()
  @IsUUID('all')
  variantId?: string;

  @IsUUID('all')
  staffId: string;
}

export class CreateAppointmentDto {
  @IsUUID('all')
  salonId: string;

  @IsOptional()
  @IsUUID('all')
  clientId?: string;

  @IsOptional()
  @IsIn(['COUNTER', 'PHONE', 'WHATSAPP', 'WALK_IN'])
  channel?: 'COUNTER' | 'PHONE' | 'WHATSAPP' | 'WALK_IN';

  @IsDateString()
  startsAt: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => AppointmentItemDto)
  items: AppointmentItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  clientNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;

  /** Hors horaires / planning (heures supplémentaires) : réservé à appointments.manage. */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class RescheduleAppointmentDto {
  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => AppointmentItemDto)
  items?: AppointmentItemDto[];

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ChangeStatusDto {
  @IsIn(APPOINTMENT_STATUSES)
  status: AppointmentStatusValue;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class AvailabilityQueryDto {
  @IsUUID('all')
  salonId: string;

  @Matches(DATE, { message: 'Date au format AAAA-MM-JJ' })
  date: string;

  @IsUUID('all')
  serviceId: string;

  @IsOptional()
  @IsUUID('all')
  variantId?: string;

  @IsOptional()
  @IsUUID('all')
  staffId?: string;
}

export class AppointmentListQueryDto {
  @IsOptional()
  @IsUUID('all')
  salonId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID('all')
  staffId?: string;

  @IsOptional()
  @IsUUID('all')
  clientId?: string;

  @IsOptional()
  @IsIn(APPOINTMENT_STATUSES)
  status?: AppointmentStatusValue;
}

export class AgendaQueryDto {
  @IsUUID('all')
  salonId: string;

  @Matches(DATE, { message: 'Date au format AAAA-MM-JJ' })
  date: string;
}
