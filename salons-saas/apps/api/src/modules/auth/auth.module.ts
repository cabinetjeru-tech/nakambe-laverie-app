import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, TenantProvisioningService],
})
export class AuthModule {}
