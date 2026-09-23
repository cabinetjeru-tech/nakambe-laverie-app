import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditService } from './audit/audit.service';
import { AccessTokenService } from './auth/access-token.service';
import { AuthGuard } from './auth/auth.guard';
import { LiveAccessService } from './auth/live-access.service';
import { SessionService } from './auth/session.service';
import { TenantAccessService } from './auth/tenant-access.service';
import { DbContextInterceptor } from './db/db-context.interceptor';
import { DbService } from './db/db.service';
import { PrismaExceptionFilter } from './http/prisma-exception.filter';
import { MessagingService } from './messaging/messaging.service';
import { CryptoService } from './security/crypto.service';
import { PasswordService } from './security/password.service';

@Global()
@Module({
  imports: [
    JwtModule.register({}),
    // Limite globale par IP ; les routes sensibles ont des limites plus basses (@Throttle).
    // Stockage en mémoire : à remplacer par Redis dès qu'il y aura plusieurs instances de l'API.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // Désactivable uniquement pendant les tests automatisés (des dizaines d'inscriptions
      // depuis la même IP) ; la variable est ignorée dans tout autre environnement.
      skipIf: () => process.env.NODE_ENV === 'test' && process.env.THROTTLE_DISABLED === 'true',
    }),
  ],
  providers: [
    DbService,
    CryptoService,
    PasswordService,
    AccessTokenService,
    TenantAccessService,
    SessionService,
    LiveAccessService,
    AuditService,
    MessagingService,
    // Ordre des gardes : limitation de débit, puis authentification/permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: DbContextInterceptor },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
  exports: [
    DbService,
    CryptoService,
    PasswordService,
    AccessTokenService,
    TenantAccessService,
    SessionService,
    AuditService,
    MessagingService,
  ],
})
export class CoreModule {}
