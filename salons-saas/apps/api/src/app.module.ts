import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './config/config.module';
import { CoreModule } from './core/core.module';
import { AccessModule } from './modules/access/access.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { CashModule } from './modules/cash/cash.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { StaffModule } from './modules/staff/staff.module';
import { StockModule } from './modules/stock/stock.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PlatformModule } from './modules/platform/platform.module';
import { SupportModule } from './modules/support/support.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SalonsModule } from './modules/salons/salons.module';

@Module({
  imports: [
    ConfigModule,
    CoreModule,
    AuthModule,
    AccessModule,
    SalonsModule,
    CatalogModule,
    StaffModule,
    ClientsModule,
    AppointmentsModule,
    StockModule,
    CashModule,
    ExpensesModule,
    ReportsModule,
    BillingModule,
    NotificationsModule,
    SupportModule,
    PlatformModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
