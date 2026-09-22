import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { UserStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateRoleDto {
  @ApiProperty({ example: 'CAISSIER' })
  @Matches(/^[A-Z][A-Z0-9_]{2,39}$/, { message: 'Code en majuscules, chiffres et _ (ex. CAISSIER).' })
  code: string;

  @ApiProperty({ example: 'Caissier' })
  @IsString() @Length(2, 60)
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['payments.read'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  permissionCodes?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 60)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  description?: string;
}

export class SetRolePermissionsDto {
  @ApiProperty({ type: [String] })
  @IsArray() @IsString({ each: true })
  permissionCodes: string[];
}

export class RoleAssignmentDto {
  @ApiProperty({ example: 'DISPATCHER' })
  @IsString() @IsNotEmpty()
  roleCode: string;

  @ApiPropertyOptional({ description: 'Limite le rôle à une ville' })
  @IsOptional() @IsUUID()
  cityId?: string | null;
}

export class SetUserRolesDto {
  @ApiProperty({ type: [RoleAssignmentDto] })
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => RoleAssignmentDto)
  roles: RoleAssignmentDto[];
}

export class CreateStaffDto extends SetUserRolesDto {
  @ApiProperty({ example: '70 00 00 01' })
  @IsString() @IsNotEmpty()
  phone: string;

  @ApiProperty() @IsString() @Length(1, 60)
  firstName: string;

  @ApiProperty() @IsString() @Length(1, 60)
  lastName: string;

  @ApiPropertyOptional({ description: 'Laisser vide pour générer un mot de passe temporaire' })
  @IsOptional() @IsString() @MaxLength(128)
  password?: string;
}

export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Nom, prénom ou téléphone' })
  @IsOptional() @IsString() @MaxLength(60)
  search?: string;

  @ApiPropertyOptional({ example: 'CLIENT' })
  @IsOptional() @IsString()
  roleCode?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional() @IsEnum(UserStatus)
  status?: UserStatus;
}

export class SetUserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] })
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: 'ACTIVE' | 'SUSPENDED';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}
