import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsPhone, IsTrimmedName } from '../../../core/http/validators';
import { ALL_PERMISSION_CODES } from '../../../core/permissions/catalog';

export class CreateRoleDto {
  @IsTrimmedName(60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSION_CODES, { each: true, message: 'Permission inconnue' })
  permissions: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsTrimmedName(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSION_CODES, { each: true, message: 'Permission inconnue' })
  permissions?: string[];
}

export class UpdateMemberAccessDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  roleIds: string[];

  @IsBoolean()
  allSalons: boolean;

  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  salonIds: string[];
}

export class CreateInvitationDto {
  @IsPhone()
  phone: string;

  @IsUUID('all')
  roleId: string;

  @IsBoolean()
  allSalons: boolean;

  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  salonIds: string[];
}
