import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Logger, Module, NotFoundException, OnModuleInit, Param, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import type { Response } from 'express';
import { execFile } from 'child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { gunzipSync, gzipSync } from 'zlib';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';

const run = promisify(execFile);
const FILE_RE = /^dreadroyal-[\w-]+\.(dump|json\.gz)$/;

/**
 * Sauvegardes :
 * - moteur « pg_dump » (serveur) : fichier .dump restaurable avec pg_restore ;
 * - moteur « json » (application Windows, sans outils PostgreSQL) : export SQL de toutes les tables
 *   en JSON compressé (.json.gz), restaurable depuis l'application.
 */
@Injectable()
export class BackupService implements OnModuleInit {
  private log = new Logger('Sauvegarde');
  readonly dir: string;
  readonly engine: 'pg_dump' | 'json';
  readonly uiRestore: boolean;
  constructor(private config: ConfigService, private audit: AuditService, private scheduler: SchedulerRegistry, private prisma: PrismaService) {
    this.dir = resolve(process.cwd(), this.config.get('BACKUP_DIR') ?? '../../backups');
    this.engine = this.config.get('BACKUP_ENGINE') === 'json' ? 'json' : 'pg_dump';
    this.uiRestore = this.config.get('ALLOW_UI_RESTORE') === 'true';
  }

  onModuleInit() {
    const cron = this.config.get<string>('BACKUP_CRON');
    if (!cron || cron === 'off' || process.env.NODE_ENV === 'test') return;
    const job = new CronJob(cron, async () => { await this.create('auto').catch((e) => this.log.error(`Sauvegarde automatique échouée : ${e.message}`)); }, null, false, 'Africa/Ouagadougou');
    this.scheduler.addCronJob('backup', job);
    job.start();
    this.log.log(`Sauvegarde automatique planifiée (${cron}, moteur ${this.engine}) dans ${this.dir}`);
  }

  info() {
    return { engine: this.engine, dir: this.dir, uiRestore: this.uiRestore, items: this.list() };
  }

  list() {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => FILE_RE.test(f)).map((f) => {
      const s = statSync(join(this.dir, f));
      return { file: f, size: s.size, createdAt: s.mtime };
    }).sort((a, b) => +b.createdAt - +a.createdAt);
  }

  private async tables(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
    return rows.map((r) => r.name);
  }

  /** Tables triées pour que chaque table soit insérée après celles qu'elle référence (clés étrangères). */
  private async tablesInDependencyOrder(): Promise<string[]> {
    const tables = await this.tables();
    const edges = await this.prisma.$queryRaw<{ child: string; parent: string }[]>`
      SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`;
    const clean = (t: string) => t.replace(/"/g, '');
    const deps = new Map(tables.map((t) => [t, new Set<string>()]));
    for (const e of edges) if (clean(e.child) !== clean(e.parent)) deps.get(clean(e.child))?.add(clean(e.parent));
    const order: string[] = [];
    const visit = (t: string, stack = new Set<string>()) => {
      if (order.includes(t)) return;
      if (stack.has(t)) throw new Error(`Dépendance circulaire entre tables : ${t}`);
      stack.add(t);
      for (const d of deps.get(t) ?? []) visit(d, stack);
      stack.delete(t);
      order.push(t);
    };
    tables.forEach((t) => visit(t));
    return order;
  }

  private async migrations(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`SELECT migration_name AS name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
    return rows.map((r) => r.name);
  }

  async create(kind: 'auto' | 'manual' | 'before-restore', userId?: string, ip?: string) {
    mkdirSync(this.dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let file: string;
    if (this.engine === 'json') {
      file = `dreadroyal-${stamp}-${kind}.json.gz`;
      const data: Record<string, unknown[]> = {};
      for (const t of await this.tables()) {
        const r = await this.prisma.$queryRawUnsafe<{ data: string | null }[]>(`SELECT COALESCE(json_agg(t), '[]'::json)::text AS data FROM "${t}" t`);
        data[t] = JSON.parse(r[0].data ?? '[]');
      }
      const payload = { app: 'DREAD ROYAL MANAGEMENT SYSTEM', format: 1, createdAt: new Date().toISOString(), migrations: await this.migrations(), tables: data };
      writeFileSync(join(this.dir, file), gzipSync(Buffer.from(JSON.stringify(payload))));
    } else {
      file = `dreadroyal-${stamp}-${kind}.dump`;
      const url = new URL(this.config.getOrThrow<string>('DATABASE_URL'));
      url.searchParams.delete('schema');
      await run('pg_dump', ['--format=custom', '--no-owner', `--file=${join(this.dir, file)}`, url.toString()], { timeout: 300_000 });
    }
    const keep = Number(this.config.get('BACKUP_KEEP') ?? 30);
    const auto = this.list().filter((b) => b.file.includes('-auto.'));
    for (const old of auto.slice(keep)) unlinkSync(join(this.dir, old.file));
    await this.audit.log({ userId, action: 'BACKUP', entity: 'Backup', entityId: file, summary: `Sauvegarde ${kind === 'auto' ? 'automatique' : kind === 'manual' ? 'manuelle' : 'avant restauration'} ${file}`, ip });
    this.log.log(`Sauvegarde créée : ${file}`);
    return this.list().find((b) => b.file === file);
  }

  /** Restauration d'une sauvegarde JSON (application Windows). Une sauvegarde de l'état actuel est faite avant. */
  async restore(file: string, actor: AuthUser, ip?: string) {
    if (!this.uiRestore) throw new ForbiddenException('Restauration depuis l’application désactivée sur ce serveur (utiliser deploy/restore.sh)');
    if (!file.endsWith('.json.gz')) throw new BadRequestException('Seules les sauvegardes .json.gz se restaurent depuis l’application');
    const payload = JSON.parse(gunzipSync(readFileSync(this.path(file))).toString('utf8'));
    if (payload.app !== 'DREAD ROYAL MANAGEMENT SYSTEM' || payload.format !== 1) throw new BadRequestException('Fichier de sauvegarde non reconnu');
    const current = await this.migrations();
    const unknown = (payload.migrations as string[]).filter((m) => !current.includes(m));
    if (unknown.length) throw new BadRequestException('Cette sauvegarde provient d’une version plus récente du logiciel : mettez d’abord l’application à jour');
    const tables = await this.tablesInDependencyOrder();
    await this.create('before-restore', actor.id, ip);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')}`);
      for (const t of tables) {
        const rows = payload.tables[t];
        if (!rows?.length) continue;
        await tx.$executeRawUnsafe(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, JSON.stringify(rows));
      }
    }, { timeout: 300_000, maxWait: 30_000 });
    await this.audit.log({ userId: null, action: 'RESTORE', entity: 'Backup', entityId: file, summary: `Restauration de la sauvegarde ${file} par ${actor.fullName}`, ip });
    this.log.warn(`Base restaurée depuis ${file}`);
    return { ok: true, restoredFrom: payload.createdAt };
  }

  path(file: string) {
    if (!FILE_RE.test(file)) throw new BadRequestException('Nom de fichier invalide');
    const p = join(this.dir, file);
    if (!existsSync(p)) throw new NotFoundException('Sauvegarde introuvable');
    return p;
  }
}

@Controller('backups')
@RequirePermissions('backup.manage')
export class BackupController {
  constructor(private s: BackupService) {}
  @Get() list() { return this.s.list(); }
  @Get('info') info() { return this.s.info(); }
  @Post() create(@CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.create('manual', u.id, ip); }
  @Post(':file/restore')
  restore(@Param('file') file: string, @Body() body: { confirm?: string }, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    if (body?.confirm !== 'RESTAURER') throw new BadRequestException('Confirmation manquante');
    return this.s.restore(file, u, ip);
  }
  @Get(':file') download(@Param('file') file: string, @Res() res: Response) {
    const p = this.s.path(file);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    createReadStream(p).pipe(res);
  }
}

@Module({ controllers: [BackupController], providers: [BackupService] })
export class BackupModule {}
