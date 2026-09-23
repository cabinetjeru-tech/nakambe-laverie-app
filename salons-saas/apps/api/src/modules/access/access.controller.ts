import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Put, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser, Public, RequirePermissions } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { AcceptInvitationDto } from '../auth/dto/auth.dto';
import { sessionBody, setRefreshCookie } from '../auth/refresh-cookie';
import { CreateInvitationDto, CreateRoleDto, UpdateMemberAccessDto, UpdateRoleDto } from './dto/access.dto';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { RolesService } from './roles.service';

@Controller()
export class AccessController {
  constructor(
    private readonly roles: RolesService,
    private readonly members: MembersService,
    private readonly invitations: InvitationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------- Permissions et rôles

  @RequirePermissions('roles.manage')
  @Get('permissions')
  permissions(@CurrentUser() user: AuthUser) {
    return this.roles.catalog(user);
  }

  @RequirePermissions('staff.read')
  @Get('roles')
  listRoles() {
    return this.roles.list();
  }

  @RequirePermissions('roles.manage')
  @Post('roles')
  createRole(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.roles.create(user, dto);
  }

  @RequirePermissions('roles.manage')
  @Patch('roles/:id')
  updateRole(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(user, id, dto);
  }

  @RequirePermissions('roles.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('roles/:id')
  deleteRole(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.roles.remove(user, id);
  }

  // ---------------------------------------------------------------- Membres

  @RequirePermissions('staff.read')
  @Get('members')
  listMembers(@CurrentUser() user: AuthUser) {
    return this.members.list(user);
  }

  @RequirePermissions('roles.manage')
  @Put('members/:id/access')
  updateAccess(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: UpdateMemberAccessDto) {
    return this.members.updateAccess(user, id, dto);
  }

  @RequirePermissions('staff.manage')
  @HttpCode(HttpStatus.OK)
  @Post('members/:id/suspend')
  suspend(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.members.setSuspended(user, id, true);
  }

  @RequirePermissions('staff.manage')
  @HttpCode(HttpStatus.OK)
  @Post('members/:id/reactivate')
  reactivate(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.members.setSuspended(user, id, false);
  }

  // ---------------------------------------------------------------- Invitations

  @RequirePermissions('staff.manage')
  @Throttle({ default: { limit: 30, ttl: 3600_000 } })
  @Post('invitations')
  invite(@CurrentUser() user: AuthUser, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(user, dto);
  }

  @RequirePermissions('staff.manage')
  @Get('invitations')
  listInvitations() {
    return this.invitations.listPending();
  }

  @RequirePermissions('staff.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('invitations/:id')
  revokeInvitation(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.invitations.revoke(user, id);
  }

  /** Acceptation d'une invitation (lien reçu par SMS/WhatsApp). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('auth/invitations/accept')
  async acceptInvitation(@Body() dto: AcceptInvitationDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.invitations.accept(dto);
    setRefreshCookie(res, session, this.config);
    return sessionBody(session);
  }
}
