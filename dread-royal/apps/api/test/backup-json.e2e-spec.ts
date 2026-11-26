import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { JSON_DB_URL } from './global-setup';

/** Moteur de sauvegarde « json » (application Windows) : sauvegarde puis restauration depuis l'application. */
describe('Sauvegarde/restauration JSON (application Windows)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.DATABASE_URL = JSON_DB_URL; // base dédiée : n'interfère pas avec les autres tests
    process.env.BACKUP_ENGINE = 'json';
    process.env.ALLOW_UI_RESTORE = 'true';
    process.env.BACKUP_DIR = '/tmp/dread-royal-test-backups-json';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app, { serveWeb: true });
    await app.init();
    prisma = app.get(PrismaService);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'OWNER' } });
    await prisma.user.upsert({ where: { username: 'restaurateur' }, update: {}, create: { username: 'restaurateur', fullName: 'Test restauration', roleId: role.id, passwordHash: await bcrypt.hash('Restore2026', 10) } });
    token = (await http().post('/api/auth/login').send({ username: 'restaurateur', password: 'Restore2026' })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); delete process.env.BACKUP_ENGINE; delete process.env.ALLOW_UI_RESTORE; });

  it('sauvegarde, modification, restauration : les données reviennent à l’identique', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const info = await http().get('/api/backups/info').set(auth);
    expect(info.body.engine).toBe('json');
    const before = { clients: await prisma.client.count(), services: await prisma.service.count(), sales: await prisma.sale.count() };
    const b = await http().post('/api/backups').set(auth);
    expect(b.status).toBe(201);
    expect(b.body.file).toMatch(/\.json\.gz$/);
    // Modification après la sauvegarde
    await http().post('/api/clients').set(auth).send({ firstName: 'Après', lastName: 'Sauvegarde', gender: 'MALE' });
    expect(await prisma.client.count()).toBe(before.clients + 1);
    expect((await http().post(`/api/backups/${b.body.file}/restore`).set(auth).send({})).status).toBe(400); // confirmation obligatoire
    const r = await http().post(`/api/backups/${b.body.file}/restore`).set(auth).send({ confirm: 'RESTAURER' });
    expect(r.status).toBe(201);
    expect({ clients: await prisma.client.count(), services: await prisma.service.count(), sales: await prisma.sale.count() }).toEqual(before);
    // Intégrité : relations et tableaux restaurés
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'STYLIST' } });
    expect(role.permissions).toContain('appointments.view_own');
    // Une sauvegarde « avant restauration » a été créée
    const list = (await http().get('/api/backups').set(auth)).body;
    expect(list.some((x: any) => x.file.includes('before-restore'))).toBe(true);
  });
});
