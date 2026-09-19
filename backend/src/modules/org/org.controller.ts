import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { OrgService } from './org.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('org')
@Controller('org')
export class OrgController {
  constructor(private orgService: OrgService) {}

  @Roles(RoleName.ADMIN)
  @Post('branches')
  createBranch(@Body() dto: any) {
    return this.orgService.createBranch(dto);
  }

  @Public()
  @Get('branches')
  findBranches() {
    return this.orgService.findBranches();
  }

  @Roles(RoleName.ADMIN)
  @Patch('branches/:id')
  updateBranch(@Param('id') id: string, @Body() dto: any) {
    return this.orgService.updateBranch(id, dto);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Post('zones')
  createZone(@Body() dto: any) {
    return this.orgService.createZone(dto);
  }

  @Public()
  @Get('zones')
  findZones(@Query('branchId') branchId?: string) {
    return this.orgService.findZones(branchId);
  }

  @Roles(RoleName.ADMIN, RoleName.GERANT)
  @Patch('zones/:id')
  updateZone(@Param('id') id: string, @Body() dto: any) {
    return this.orgService.updateZone(id, dto);
  }
}
