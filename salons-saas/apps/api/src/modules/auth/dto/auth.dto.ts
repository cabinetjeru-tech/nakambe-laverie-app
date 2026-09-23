import { IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { IsNewPassword, IsNormalizedEmail, IsPhone, IsTrimmedName } from '../../../core/http/validators';

/** Inscription d'un professionnel : crée l'entreprise, son premier salon et le compte propriétaire. */
export class SignupDto {
  @IsTrimmedName()
  fullName: string;

  @IsPhone()
  phone: string;

  @IsOptional()
  @IsNormalizedEmail()
  email?: string;

  @IsNewPassword()
  password: string;

  @IsTrimmedName(150)
  businessName: string;

  @IsTrimmedName(150)
  salonName: string;

  @IsTrimmedName(80)
  city: string;
}

/** Inscription d'un client final (compte personnel, sans entreprise). */
export class RegisterDto {
  @IsTrimmedName()
  fullName: string;

  @IsPhone()
  phone: string;

  @IsOptional()
  @IsNormalizedEmail()
  email?: string;

  @IsNewPassword()
  password: string;
}

export class LoginDto {
  /** Téléphone ou email. */
  @IsString()
  @Length(3, 254)
  identifier: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class SwitchTenantDto {
  /** null = sortir de l'entreprise courante (espace personnel). */
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  tenantId: string | null;
}

export class ForgotPasswordDto {
  @IsPhone()
  phone: string;
}

export class ResetPasswordDto {
  @IsPhone()
  phone: string;

  @Matches(/^\d{6}$/, { message: 'Le code comporte 6 chiffres' })
  code: string;

  @IsNewPassword()
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsNewPassword()
  newPassword: string;
}

export class AcceptInvitationDto {
  @IsString()
  @Length(40, 200)
  token: string;

  /** Obligatoire si le numéro invité n'a pas encore de compte. */
  @IsOptional()
  @IsTrimmedName()
  fullName?: string;

  /** Nouveau mot de passe (nouveau compte) ou mot de passe actuel (compte existant). */
  @IsString()
  @Length(1, 128)
  password: string;
}
