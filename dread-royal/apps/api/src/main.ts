import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './setup';

async function bootstrap() {
  process.env.TZ = process.env.TZ ?? 'Africa/Ouagadougou';
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  if (process.env.SWAGGER !== 'off') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('DREAD ROYAL MANAGEMENT SYSTEM — API').setVersion('1.0').addBearerAuth().build());
    SwaggerModule.setup('api/docs', app, doc);
  }
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API DREAD ROYAL démarrée sur http://localhost:${port}/api (docs : /api/docs)`, 'Bootstrap');
}
bootstrap();
