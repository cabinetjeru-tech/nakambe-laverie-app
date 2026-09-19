import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('admin')
@Controller()
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Public()
  @Get('settings')
  findSettings() {
    return this.adminService.findSettings();
  }

  @Roles(RoleName.ADMIN)
  @Put('settings/:key')
  setSetting(@Param('key') key: string, @Body('value') value: string) {
    return this.adminService.setSetting(key, value);
  }

  @Roles(RoleName.ADMIN)
  @Get('audit-logs')
  findAuditLogs(
    @Query('entityType') entityType?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.findAuditLogs(
      entityType,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
    );
  }
}
