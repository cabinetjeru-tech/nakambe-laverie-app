import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = setupApp(await NestFactory.create(AppModule));
  const config = app.get(ConfigService);

  const swagger = new DocumentBuilder()
    .setTitle('ALLÔ-COURSIER — API')
    .setDescription('Livraison • Courses • Services — GROUPE AKAMBI SARL')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(config.get('PORT') ?? 3002);
  await app.listen(port);
  Logger.log(`API ALLÔ-COURSIER démarrée sur http://localhost:${port}/api/v1 (documentation : /api/docs)`, 'Bootstrap');
}
bootstrap();
