import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('Mon compte')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private users: UsersService) {}

  @Patch()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Get('addresses')
  listAddresses(@CurrentUser() user: AuthUser) {
    return this.users.listAddresses(user.id);
  }

  @Post('addresses')
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.users.createAddress(user.id, dto);
  }

  @Patch('addresses/:id')
  updateAddress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAddressDto) {
    return this.users.updateAddress(user.id, id, dto);
  }

  @Delete('addresses/:id')
  deleteAddress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.deleteAddress(user.id, id);
  }
}
