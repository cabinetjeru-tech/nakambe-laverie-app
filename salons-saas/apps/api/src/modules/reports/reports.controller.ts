import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../core/auth/decorators';
import { DashboardQueryDto, ReportQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequireAnyPermission('reports.read', 'reports.finance.read', 'reports.read.own')
  @Get('reports/summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: ReportQueryDto) {
    return this.reports.summary(user, query);
  }

  /** Tout membre de l'équipe a un tableau de bord ; son contenu dépend de ses permissions. */
  @RequirePermissions('salons.read')
  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.reports.dashboard(user, query);
  }
}
