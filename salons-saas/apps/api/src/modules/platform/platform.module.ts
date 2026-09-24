import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformController } from './platform.controller';
import { PlatformSettingsAdminService } from './platform-settings.admin.service';
import { PlatformStaffGuard } from './platform-staff.guard';
import { PlatformStatsService } from './platform-stats.service';
import { PlatformSupportService } from './platform-support.service';
import { PlatformTenantsService } from './platform-tenants.service';
import { PlatformUsersService } from './platform-users.service';

/** Console super administrateur de l'éditeur. */
@Module({
  imports: [BillingModule],
  controllers: [PlatformController],
  providers: [
    PlatformStaffGuard,
    PlatformTenantsService,
    PlatformUsersService,
    PlatformBillingService,
    PlatformStatsService,
    PlatformSupportService,
    PlatformSettingsAdminService,
  ],
})
export class PlatformModule {}
