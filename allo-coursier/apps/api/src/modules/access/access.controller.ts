import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { AccessService } from './access.service';
import {
  CreateRoleDto,
  CreateStaffDto,
  SetRolePermissionsDto,
  SetUserRolesDto,
  SetUserStatusDto,
  UpdateRoleDto,
  UserQueryDto,
} from './dto/access.dto';

@ApiTags('Administration — Utilisateurs, rôles et permissions')
@ApiBearerAuth()
@Controller('admin')
export class AccessController {
  constructor(private access: AccessService) {}

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE.code)
  listPermissions() {
    return this.access.listPermissions();
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USERS_READ.code)
  listRoles() {
    return this.access.listRoles();
  }

  @Post('roles')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE.code)
  createRole(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthUser) {
    return this.access.createRole(dto, user);
  }

  @Patch('roles/:id')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE.code)
  updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: AuthUser) {
    return this.access.updateRole(id, dto, user);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE.code)
  setRolePermissions(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetRolePermissionsDto, @CurrentUser() user: AuthUser) {
    return this.access.setRolePermissions(id, dto.permissionCodes, user);
  }

  @Delete('roles/:id')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE.code)
  deleteRole(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.access.deleteRole(id, user);
  }

  @Get('users')
  @RequirePermissions(PERMISSIONS.USERS_READ.code)
  listUsers(@Query() query: UserQueryDto) {
    return this.access.listUsers(query);
  }

  @Get('users/:id')
  @RequirePermissions(PERMISSIONS.USERS_READ.code)
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.access.getUser(id);
  }

  @Patch('users/:id/status')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE.code)
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetUserStatusDto, @CurrentUser() user: AuthUser) {
    return this.access.setUserStatus(id, dto, user);
  }

  @HttpCode(200)
  @Post('users/:id/reset-secret')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE.code)
  resetSecret(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.access.resetSecret(id, user);
  }

  @Post('staff')
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE.code)
  createStaff(@Body() dto: CreateStaffDto, @CurrentUser() user: AuthUser) {
    return this.access.createStaff(dto, user);
  }

  @Put('users/:id/roles')
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE.code)
  setRoles(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetUserRolesDto, @CurrentUser() user: AuthUser) {
    return this.access.setUserRoles(id, dto.roles, user);
  }
}
