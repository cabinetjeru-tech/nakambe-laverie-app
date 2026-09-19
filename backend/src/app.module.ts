import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { OrdersModule } from './modules/orders/orders.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { StockModule } from './modules/stock/stock.module';
import { FinanceModule } from './modules/finance/finance.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { OrgModule } from './modules/org/org.module';
import { B2bModule } from './modules/b2b/b2b.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { OnlinePaymentsModule } from './modules/online-payments/online-payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ClientsModule,
    CatalogModule,
    AppointmentsModule,
    OrdersModule,
    QuotesModule,
    InvoicesModule,
    PaymentsModule,
    EmployeesModule,
    VehiclesModule,
    StockModule,
    FinanceModule,
    DashboardModule,
    OrgModule,
    B2bModule,
    EngagementModule,
    NotificationsModule,
    AdminModule,
    OnlinePaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
