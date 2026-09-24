import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, lastValueFrom, Observable } from 'rxjs';
import { LiveAccessService } from '../auth/live-access.service';
import { MANUAL_TRANSACTION_KEY, READ_ONLY_EXEMPT_KEY } from '../auth/decorators';
import { DbService, RequestMeta } from './db.service';

export function requestMeta(request: Request): RequestMeta {
  return { ipAddress: request.ip ?? null, userAgent: request.get('user-agent')?.slice(0, 500) ?? null };
}

/**
 * Enveloppe chaque requête HTTP dans une transaction PostgreSQL portant le tenant et
 * l'utilisateur du jeton : la RLS s'applique à toutes les requêtes du traitement, et tout
 * est annulé si le traitement échoue.
 */
@Injectable()
export class DbContextInterceptor implements NestInterceptor {
  constructor(
    private readonly db: DbService,
    private readonly reflector: Reflector,
    private readonly liveAccess: LiveAccessService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    const dbContext = { tenantId: user?.tenantId ?? null, userId: user?.userId ?? null, meta: requestMeta(request) };

    const manual = this.reflector.getAllAndOverride<boolean>(MANUAL_TRANSACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const exempt =
      this.reflector.getAllAndOverride<boolean>(READ_ONLY_EXEMPT_KEY, [context.getHandler(), context.getClass()]) ?? false;

    if (manual) {
      // Le traitement ouvre ses propres transactions ; on vérifie seulement la session.
      const run = async () => {
        if (user) await this.db.withContext(dbContext, () => this.liveAccess.assertStillValid(user, request.method, exempt));
        return lastValueFrom(next.handle(), { defaultValue: undefined });
      };
      return from(run());
    }

    return from(
      this.db.withContext(dbContext, async () => {
        if (user) await this.liveAccess.assertStillValid(user, request.method, exempt);
        return lastValueFrom(next.handle(), { defaultValue: undefined });
      }),
    );
  }
}
