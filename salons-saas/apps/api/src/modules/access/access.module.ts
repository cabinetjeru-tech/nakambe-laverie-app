import { Module } from '@nestjs/common';
import { AccessController } from './access.controller';
import { AccessPolicyService } from './access-policy.service';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { RolesService } from './roles.service';

@Module({
  controllers: [AccessController],
  providers: [AccessPolicyService, RolesService, MembersService, InvitationsService],
})
export class AccessModule {}
