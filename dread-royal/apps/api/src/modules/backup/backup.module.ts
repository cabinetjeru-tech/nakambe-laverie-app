import { BadRequestException, Controller, Get, Injectable, Logger, Module, NotFoundException, OnModuleInit, Param, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import type { Response } from 'express';
import { execFile } from 'child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';

const run = promisify(execFile);

@Injectable()
export class BackupService implements OnModuleInit {
  private log = new Logger('Sauvegarde');
  readonly dir: string;
  constructor(private config: ConfigService, private audit: AuditService, private scheduler: SchedulerRegistry) {
    this.dir = resolve(process.cwd(), this.config.get('BACKUP_DIR') ?? '../../backups');
  }

  onModuleInit() {
    const cron = this.config.get<string>('BACKUP_CRON');
    if (!cron || cron === 'off' || process.env.NODE_ENV === 'test') return;
    const job = new CronJob(cron, async () => { await this.create('auto').catch((e) => this.log.error(`Sauvegarde automatique échouée : ${e.message}`)); }, null, false, 'Africa/Ouagadougou');
    this.scheduler.addCronJob('backup', job);
    job.start();
    this.log.log(`Sauvegarde automatique planifiée (${cron}) dans ${this.dir}`);
  }

  list() {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => f.endsWith('.dump')).map((f) => {
      const s = statSync(join(this.dir, f));
      return { file: f, size: s.size, createdAt: s.mtime };
    }).sort((a, b) => +b.createdAt - +a.createdAt);
  }

  async create(kind: 'auto' | 'manual', userId?: string, ip?: string) {
    mkdirSync(this.dir, { recursive: true });
    const url = new URL(this.config.getOrThrow<string>('DATABASE_URL'));
    url.searchParams.delete('schema');
    const file = `dreadroyal-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${kind}.dump`;
    await run('pg_dump', ['--format=custom', '--no-owner', `--file=${join(this.dir, file)}`, url.toString()], { timeout: 300_000 });
    const keep = Number(this.config.get('BACKUP_KEEP') ?? 30);
    const all = this.list();
    for (const old of all.slice(keep)) unlinkSync(join(this.dir, old.file));
    await this.audit.log({ userId, action: 'BACKUP', entity: 'Backup', entityId: file, summary: `Sauvegarde ${kind === 'auto' ? 'automatique' : 'manuelle'} ${file}`, ip });
    this.log.log(`Sauvegarde créée : ${file}`);
    return this.list().find((b) => b.file === file);
  }

  path(file: string) {
    if (!/^dreadroyal-[\w-]+\.dump$/.test(file)) throw new BadRequestException('Nom de fichier invalide');
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
  @Post() create(@CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.create('manual', u.id, ip); }
  @Get(':file') download(@Param('file') file: string, @Res() res: Response) {
    const p = this.s.path(file);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    createReadStream(p).pipe(res);
  }
}

@Module({ controllers: [BackupController], providers: [BackupService] })
export class BackupModule {}
