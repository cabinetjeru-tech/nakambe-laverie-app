import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [GeoModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
