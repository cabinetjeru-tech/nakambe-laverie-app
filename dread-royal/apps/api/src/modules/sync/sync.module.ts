import { BadRequestException, Body, Controller, Get, HttpException, Injectable, Module, Post, Query } from '@nestjs/common';
import { plainToInstance, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateNested, validate } from 'class-validator';
import { hasPermission } from '@dread-royal/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser, ClientIp } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { ClientsModule, ClientsService, CreateClientDto } from '../clients/clients.module';
import { AppointmentsModule, AppointmentsService, CreateAppointmentDto } from '../appointments/appointments.module';
import { SalesModule } from '../sales/sales.module';
import { CreateSaleDto, SalesService } from '../sales/sales.service';

const TYPES = { 'client.create': 'clients.manage', 'appointment.create': 'appointments.manage', 'sale.create': 'sales.create' } as const;
type OpType = keyof typeof TYPES;

class OperationDto {
  @IsUUID() opId: string;
  @IsIn(Object.keys(TYPES)) type: OpType;
  @IsObject() payload: Record<string, any>;
  @IsOptional() @IsDateString() createdAt?: string;
  /** Références vers des objets créés hors ligne dans le même lot (ex : client créé puis vente) */
  @IsOptional() @IsObject() refs?: Record<string, string>;
}
class SyncDto {
  @IsOptional() @IsString() @MaxLength(100) deviceId?: string;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => OperationDto) operations: OperationDto[];
}

export interface SyncResult {
  opId: string;
  status: 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';
  resultId?: string | null;
  message?: string | null;
  data?: unknown;
}

/**
 * Synchronisation des opérations réalisées hors connexion.
 * - Idempotence : chaque opération a un opId unique (clé primaire de SyncOperation) → jamais appliquée deux fois.
 * - Les permissions sont revérifiées côté serveur pour chaque opération.
 * - Conflits (créneau pris, stock insuffisant, doublon de téléphone…) renvoyés avec leur motif, sans rien appliquer.
 */
@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService, private clients: ClientsService, private appointments: AppointmentsService, private sales: SalesService) {}

  async process(dto: SyncDto, user: AuthUser, ip?: string): Promise<{ results: SyncResult[]; serverTime: string }> {
    const results: SyncResult[] = [];
    const created: Record<string, string> = {}; // opId → id serveur (pour les références)
    for (const op of dto.operations) {
      const existing = await this.prisma.syncOperation.findUnique({ where: { opId: op.opId } });
      if (existing) {
        results.push({ opId: op.opId, status: existing.status === 'APPLIED' ? 'DUPLICATE' : existing.status, resultId: existing.resultId, message: existing.status === 'APPLIED' ? 'Déjà synchronisée' : existing.message });
        if (existing.resultId) created[op.opId] = existing.resultId;
        continue;
      }
      let res: SyncResult;
      try {
        if (!hasPermission(user.permissions, TYPES[op.type])) throw new HttpException("Permission refusée pour cette opération", 403);
        // Résolution des références vers des objets créés hors ligne
        const payload = { ...op.payload };
        for (const [field, refOpId] of Object.entries(op.refs ?? {})) {
          const id = created[refOpId] ?? (await this.prisma.syncOperation.findUnique({ where: { opId: refOpId } }))?.resultId;
          if (!id) throw new HttpException(`Référence ${field} non synchronisée`, 409);
          payload[field] = id;
        }
        const data = await this.apply(op.type, payload, op, user, ip);
        res = { opId: op.opId, status: 'APPLIED', resultId: data.id, data };
        created[op.opId] = data.id;
      } catch (e) {
        const status = e instanceof HttpException ? e.getStatus() : 500;
        const raw = e instanceof HttpException ? (e.getResponse() as any) : null;
        const message = raw?.message ? (Array.isArray(raw.message) ? raw.message.join(' ; ') : raw.message) : (e as Error).message;
        if (status >= 500) throw e; // erreur serveur : l'opération reste en file côté appareil
        res = { opId: op.opId, status: status === 409 ? 'CONFLICT' : 'REJECTED', message };
      }
      await this.prisma.syncOperation.create({
        data: { opId: op.opId, userId: user.id, deviceId: dto.deviceId, type: op.type, payload: op.payload, status: res.status === 'DUPLICATE' ? 'APPLIED' : (res.status as any), resultId: res.resultId, message: res.message, clientCreatedAt: op.createdAt ? new Date(op.createdAt) : null },
      });
      results.push(res);
    }
    return { results, serverTime: new Date().toISOString() };
  }

  private async validated<T extends object>(cls: new () => T, payload: object): Promise<T> {
    const inst = plainToInstance(cls, payload);
    const errors = await validate(inst, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? {})).join(' ; ') || 'Données invalides');
    return inst;
  }

  private async apply(type: OpType, payload: Record<string, any>, op: OperationDto, user: AuthUser, ip?: string): Promise<{ id: string; [k: string]: any }> {
    switch (type) {
      case 'client.create':
        return this.clients.create(await this.validated(CreateClientDto, payload), user, ip);
      case 'appointment.create':
        return this.appointments.create(await this.validated(CreateAppointmentDto, payload), user, ip);
      case 'sale.create': {
        const dto = await this.validated(CreateSaleDto, { ...payload, clientOpId: op.opId, saleDate: payload.saleDate ?? op.createdAt });
        const r = await this.sales.create(dto, user, ip);
        return r.sale;
      }
    }
  }

  history(user: AuthUser, all?: boolean) {
    return this.prisma.syncOperation.findMany({ where: all ? {} : { userId: user.id }, orderBy: { receivedAt: 'desc' }, take: 200 });
  }
}

@Controller('sync')
export class SyncController {
  constructor(private s: SyncService) {}
  @Post() process(@Body() dto: SyncDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.process(dto, u, ip); }
  @Get('history') history(@CurrentUser() u: AuthUser, @Query('all') all?: string) { return this.s.history(u, all === 'true' && hasPermission(u.permissions, 'audit.view')); }
}

@Module({ imports: [ClientsModule, AppointmentsModule, SalesModule], controllers: [SyncController], providers: [SyncService] })
export class SyncModule {}
