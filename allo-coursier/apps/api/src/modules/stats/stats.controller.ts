import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsUUID } from 'class-validator';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { StatsService } from './stats.service';

class StatsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

@ApiTags('Administration — Statistiques')
@ApiBearerAuth()
@Controller('admin/stats')
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.STATS_READ.code)
  overview(@Query() query: StatsQueryDto, @CurrentUser() user: AuthUser) {
    return this.stats.overview({ ...query, cityId: this.stats.scopedCity(user, query.cityId) });
  }

  @Get('drivers')
  @RequirePermissions(PERMISSIONS.STATS_READ.code)
  drivers(@Query() query: StatsQueryDto, @CurrentUser() user: AuthUser) {
    return this.stats.drivers({ ...query, cityId: this.stats.scopedCity(user, query.cityId) });
  }
}
