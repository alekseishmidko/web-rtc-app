import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors();

  const port = Number(configService.getOrThrow<string>('PORT'));
  const host = configService.getOrThrow<string>('HOST');
  const grpcUrl = configService.getOrThrow<string>('GRPC_URL');

  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: 'chat',
      protoPath: join(process.cwd(), '../../../packages/contracts/proto/chat.proto'),
      url: grpcUrl,
    },
  });

  await app.startAllMicroservices();
  await app.listen(port, host);

  Logger.log(`Chat service is running on http://${host}:${port}`, 'Bootstrap');
  Logger.log(`Chat service gRPC is running on ${grpcUrl}`, 'Bootstrap');
}

void bootstrap();
