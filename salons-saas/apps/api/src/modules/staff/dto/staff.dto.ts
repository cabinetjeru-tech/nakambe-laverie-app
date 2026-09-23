import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsMoney } from '../../../core/http/money';
import { IsPhone, IsTrimmedName } from '../../../core/http/validators';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export class CreateStaffDto {
  @IsTrimmedName(80)
  displayName: string;

  @IsOptional()
  @IsPhone()
  phone?: string;

  @IsOptional()
  @IsIn(['EMPLOYEE', 'FREELANCE', 'CHAIR_RENTAL', 'APPRENTICE'])
  contractType?: 'EMPLOYEE' | 'FREELANCE' | 'CHAIR_RENTAL' | 'APPRENTICE';

  @IsOptional()
  @Matches(COLOR, { message: 'Couleur au format #RRGGBB' })
  calendarColor?: string;

  @IsOptional()
  @IsBoolean()
  bookableOnline?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsMoney()
  baseSalary?: number;

  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  salonIds: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class StaffSkillDto {
  @IsUUID('all')
  serviceId: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMoney()
  priceOverride?: number | null;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(300)
  durationFactor?: number;
}

export class StaffSkillsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StaffSkillDto)
  skills: StaffSkillDto[];
}

export class ScheduleEntryDto {
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @Matches(HHMM)
  startsAt: string;

  @Matches(HHMM)
  endsAt: string;
}

export class ScheduleDto {
  @IsUUID('all')
  salonId: string;

  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntryDto)
  entries: ScheduleEntryDto[];
}

export class TimeOffDto {
  @IsIn(['LEAVE', 'SICK', 'BREAK', 'TRAINING', 'OTHER'])
  type: 'LEAVE' | 'SICK' | 'BREAK' | 'TRAINING' | 'OTHER';

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CommissionRuleDto {
  @IsOptional()
  @IsUUID('all')
  staffId?: string;

  @IsIn(['SERVICE', 'PRODUCT'])
  appliesTo: 'SERVICE' | 'PRODUCT';

  @IsOptional()
  @IsUUID('all')
  serviceCategoryId?: string;

  @IsOptional()
  @IsUUID('all')
  serviceId?: string;

  @IsOptional()
  @IsUUID('all')
  productId?: string;

  @IsIn(['PERCENT', 'FIXED'])
  type: 'PERCENT' | 'FIXED';

  @IsInt()
  @Min(0)
  @Max(10_000_000)
  value: number;
}
