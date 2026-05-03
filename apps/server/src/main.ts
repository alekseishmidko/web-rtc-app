import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS включен для локальной разработки и возможного подключения клиентов
  // с другого устройства в той же сети.
  app.enableCors();

  const port = Number(process.env.PORT ?? 3000);

  // По умолчанию слушаем только localhost. Для доступа из локальной сети
  // можно запустить сервер с HOST=0.0.0.0.
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);

  console.log(`Server is running on http://${host}:${port}`);
}

void bootstrap();
