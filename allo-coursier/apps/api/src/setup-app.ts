import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';

/** Configuration commune à l'application et aux tests de bout en bout. */
export function setupApp(app: INestApplication) {
  const config = app.get(ConfigService);
  // Derrière le proxy HTTPS (Caddy), pour obtenir la vraie adresse IP du client.
  (app as NestExpressApplication).set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  // Compression des réponses : essentiel sur les connexions mobiles lentes.
  app.use(compression());
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  return app;
}
