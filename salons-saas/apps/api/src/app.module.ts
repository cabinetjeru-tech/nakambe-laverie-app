import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './config/config.module';
import { CoreModule } from './core/core.module';
import { AccessModule } from './modules/access/access.module';
import { AuthModule } from './modules/auth/auth.module';
import { SalonsModule } from './modules/salons/salons.module';

@Module({
  imports: [ConfigModule, CoreModule, AuthModule, AccessModule, SalonsModule],
  controllers: [AppController],
})
export class AppModule {}
