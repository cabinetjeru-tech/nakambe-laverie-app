import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { APP_CONFIG, AppConfig } from './config/env';

/** Les montants sont des BigInt : sérialisés en nombre s'ils sont sûrs, sinon en chaîne. */
function enableBigIntJson() {
  (BigInt.prototype as unknown as { toJSON: () => number | string }).toJSON = function (this: bigint) {
    return this >= BigInt(Number.MIN_SAFE_INTEGER) && this <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(this) : this.toString();
  };
}

/** Configuration HTTP commune au serveur et aux tests. */
export function setupApp(app: INestApplication) {
  const config = app.get<AppConfig>(APP_CONFIG);
  enableBigIntJson();

  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  if (config.TRUST_PROXY) express.set('trust proxy', 1);

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );
  app.enableShutdownHooks();
}
