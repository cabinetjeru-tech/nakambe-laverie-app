import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { SettingsService } from './settings.service';

class UpdateSettingDto {
  @ApiProperty({ description: 'Nouvelle valeur (nombre ou texte selon le paramètre)' })
  @IsDefined()
  value: unknown;
}

@ApiTags('Paramètres')
@Controller()
export class SettingsController {
  constructor(private settings: SettingsService) {}

  /** Informations publiques utiles aux applications (numéros Mobile Money de l'entreprise). */
  @Public()
  @Get('settings/public')
  async publicSettings() {
    return {
      mobileMoney: {
        orangeNumber: await this.settings.get('payments.mobileMoney.orangeNumber'),
        moovNumber: await this.settings.get('payments.mobileMoney.moovNumber'),
      },
    };
  }

  @ApiBearerAuth()
  @Get('admin/settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE.code)
  list() {
    return this.settings.list();
  }

  @ApiBearerAuth()
  @Put('admin/settings/:key')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE.code)
  update(@Param('key') key: string, @Body() dto: UpdateSettingDto, @CurrentUser() user: AuthUser) {
    return this.settings.set(key, dto.value, user.id);
  }
}
