import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
import { AuditCoreModule } from './common/audit.service';
import { AuthGuard, PermissionsGuard } from './common/guards';
import { Public } from './common/decorators';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SettingsModule } from './modules/settings/settings.module';
import { CoreModule } from './modules/core/engines';
import { DocumentsModule } from './modules/documents/pdf.service';
import { ClientsModule } from './modules/clients/clients.module';
import { StaffModule } from './modules/staff/staff.module';
import { ServicesModule } from './modules/services/services.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { SalesModule } from './modules/sales/sales.module';
import { CashModule } from './modules/cash/cash.module';
import { FinanceModule } from './modules/finance/finance.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { StockModule } from './modules/stock/stock.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { BackupModule } from './modules/backup/backup.module';

@Controller('health')
class HealthController {
  constructor(private prisma: PrismaService) {}
  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', app: 'DREAD ROYAL MANAGEMENT SYSTEM', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const secret = c.getOrThrow<string>('JWT_SECRET');
        if (secret.length < 32) throw new Error('JWT_SECRET trop court (32 caractères minimum)');
        return { secret, signOptions: { expiresIn: (c.get('JWT_ACCESS_TTL') ?? '15m') as any } };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT ?? 600) }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditCoreModule,
    SettingsModule,
    CoreModule,
    DocumentsModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    StaffModule,
    ServicesModule,
    AppointmentsModule,
    SalesModule,
    CashModule,
    FinanceModule,
    CommissionsModule,
    StockModule,
    LoyaltyModule,
    DashboardModule,
    ReportsModule,
    SyncModule,
    BackupModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
