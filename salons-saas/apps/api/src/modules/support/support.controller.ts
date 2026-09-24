import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../core/auth/auth-user';
import { Authenticated, CurrentUser, ReadOnlyExempt } from '../../core/auth/decorators';
import { ParseIdPipe } from '../../core/http/parse-id.pipe';
import { CreateTicketDto, TicketMessageDto } from './support.dto';
import { SupportService } from './support.service';

/** Demandes d'assistance du salon à l'équipe plateforme (ouvertes même en lecture seule). */
@ReadOnlyExempt()
@Authenticated()
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.support.list(requireTenant(user));
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.support.detail(requireTenant(user), id);
  }

  @Throttle({ default: { limit: 10, ttl: 3600_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.support.create(requireTenant(user), dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/messages')
  reply(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string, @Body() dto: TicketMessageDto) {
    return this.support.reply(requireTenant(user), id, dto.body);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.support.close(requireTenant(user), id);
  }
}

function requireTenant(user: AuthUser): AuthUser {
  if (!user.tenantId || !user.membershipId) throw new ForbiddenException('Sélectionnez une entreprise pour contacter le support.');
  return user;
}
