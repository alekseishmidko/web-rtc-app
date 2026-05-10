import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors();
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('WebRTC Gateway API')
    .setDescription('HTTP gateway for auth, rooms, notifications and signaling support.')
    .setVersion('0.1.0')
    .addCookieAuth('accessSessionId')
    .addCookieAuth('refreshSessionId')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = Number(configService.getOrThrow<string>('PORT'));
  const host = configService.getOrThrow<string>('HOST');

  await app.listen(port, host);
  console.log(`Gateway service is running on http://${host}:${port}/api/docs`);

}

void bootstrap();
