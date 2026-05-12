import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // CORS включен для локальной разработки и возможного подключения клиентов
  // с другого устройства в той же сети.
  app.enableCors();

  const port = Number(configService.getOrThrow<string>('PORT'));

  // По умолчанию слушаем только localhost. Для доступа из локальной сети
  // можно запустить сервер с HOST=0.0.0.0.
  const host = configService.getOrThrow<string>('HOST');
  await app.listen(port, host);

  Logger.log(`Server is running on http://${host}:${port}`, 'Bootstrap');
}

void bootstrap();
