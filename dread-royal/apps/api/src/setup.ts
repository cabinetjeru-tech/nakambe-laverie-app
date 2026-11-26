import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

/** Configuration commune (serveur et tests e2e). */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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
