import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

/** Configuration commune (serveur et tests e2e). */
export function configureApp(app: INestApplication, opts: { serveWeb?: boolean } = {}) {
  app.setGlobalPrefix('api');
  // Quand l'API sert aussi le site (application Windows), la CSP par défaut bloquerait les scripts de Next.js
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: opts.serveWeb ? false : undefined }));
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: false, exposedHeaders: ['Content-Disposition'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: undefined,
    }),
  );
}
