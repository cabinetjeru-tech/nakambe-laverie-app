import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { FEATURES } from '../../core/permissions/catalog';

export class TenantQueryDto {
  @IsOptional() @IsString() @Length(1, 100) search?: string;
  @IsOptional() @IsIn(['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']) status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
  @IsOptional() @IsString() @Length(1, 30) plan?: string;
}

export class UserQueryDto {
  @IsOptional() @IsString() @Length(1, 100) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'LOCKED', 'DISABLED']) status?: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  @IsOptional() @IsIn(['true', 'false']) staff?: 'true' | 'false';
}

export class SubscriptionQueryDto {
  @IsOptional() @IsIn(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED']) status?: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  @IsOptional() @IsString() @Length(1, 30) plan?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) endingWithinDays?: number;
}

export class PaymentQueryDto {
  @IsOptional() @IsIn(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED']) status?: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  @IsOptional() @IsIn(['MOBILE_MONEY_MANUAL', 'ONLINE']) method?: 'MOBILE_MONEY_MANUAL' | 'ONLINE';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(730) days?: number;
}

export class InvoiceQueryDto {
  @IsOptional() @IsIn(['OPEN', 'PAID', 'VOID']) status?: 'OPEN' | 'PAID' | 'VOID';
}

export class UserStatusDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED';
  @IsString() @Length(3, 300) reason!: string;
}

export class GrantStaffDto {
  @IsString() @Length(6, 20) phone!: string;
  @IsIn(['PLATFORM_OWNER', 'PLATFORM_BILLING', 'PLATFORM_SUPPORT']) role!: 'PLATFORM_OWNER' | 'PLATFORM_BILLING' | 'PLATFORM_SUPPORT';
}

class MobileMoneyNumberDto {
  @IsString() @Length(2, 40) operator!: string;
  @IsString() @Matches(/^\+?[0-9 ]{6,20}$/, { message: 'Numéro Mobile Money invalide' }) number!: string;
}

export class PlatformSettingsDto {
  @IsOptional() @IsString() @Length(2, 200) legalName?: string;
  @IsOptional() @IsString() @Length(0, 300) address?: string;
  @IsOptional() @IsString() @Length(0, 60) taxId?: string;
  @IsOptional() @IsString() @Length(0, 30) supportPhone?: string;
  @IsOptional() @IsString() @Length(0, 120) supportEmail?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => MobileMoneyNumberDto) mobileMoney?: MobileMoneyNumberDto[];
  @IsOptional() @IsInt() @Min(0) @Max(90) trialDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(30) graceDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(30) renewalLeadDays?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(30) vatPercent?: number;
  @IsOptional() @IsString() @Length(1, 30) defaultPlanCode?: string;
}

export class PlanDto {
  @IsString() @Matches(/^[A-Za-z0-9_]{2,30}$/, { message: 'Code : 2 à 30 lettres, chiffres ou _' }) code!: string;
  @IsString() @Length(2, 60) name!: string;
  @IsOptional() @IsString() @Length(0, 300) description?: string;
  @IsInt() @Min(0) @Max(100_000_000) priceMonthly!: number;
  @IsInt() @Min(0) @Max(1_000_000_000) priceYearly!: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxSalons?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10000) maxStaff?: number | null;
  @IsInt() @Min(0) @Max(1_000_000) smsQuotaMonthly!: number;
  @IsArray() @IsIn(Object.values(FEATURES), { each: true, message: 'Fonctionnalité inconnue' }) features!: string[];
  @IsBoolean() isPublic!: boolean;
  @IsBoolean() isActive!: boolean;
  @IsInt() @Min(0) @Max(1000) sortOrder!: number;
}
