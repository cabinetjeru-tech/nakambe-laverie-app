import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/env';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.useBodyParser('json', { limit: '100kb' });
  setupApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.PORT);
  new Logger('Bootstrap').log(`API démarrée sur http://localhost:${config.PORT}/api/v1`);
}
bootstrap();
