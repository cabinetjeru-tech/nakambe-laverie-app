/**
 * Démarrage de l'API pour l'application Windows (Electron) :
 * l'API sert aussi le site (export statique) sur le même port → une seule adresse, aucune configuration.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { configureApp } from './setup';
import { PrismaService } from './prisma/prisma.service';
import { seedBaseData } from './seed/base-data';

export interface DesktopOptions {
  port: number;
  host: string;
  webDir: string;
  owner: { username: string; password: string };
  log?: (m: string) => void;
}

export async function startDesktopServer(o: DesktopOptions) {
  const log = o.log ?? console.log;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  configureApp(app, { serveWeb: true });
  await seedBaseData(app.get(PrismaService), o.owner, log);
  const express = require('express');
  const server = app.getHttpAdapter().getInstance();
  server.use(express.static(o.webDir, { extensions: ['html'], maxAge: '1h', setHeaders: (res: any, p: string) => { if (p.endsWith('sw.js') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  // Liens profonds (/clients/fiche/?id=…) : renvoyer la page correspondante, sinon l'accueil
  server.use((req: any, res: any, next: any) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    const candidate = join(o.webDir, req.path, 'index.html');
    res.sendFile(existsSync(candidate) ? candidate : join(o.webDir, 'index.html'));
  });
  await app.listen(o.port, o.host);
  log(`DREAD ROYAL prêt sur http://${o.host}:${o.port}`);
  return app;
}
