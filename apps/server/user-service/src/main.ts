import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const grpcUrl = configService.getOrThrow<string>('GRPC_URL');

  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: 'user',
      protoPath: join(process.cwd(), '../../../packages/contracts/proto/user.proto'),
      url: grpcUrl,
    },
  });

  await app.init();
  await app.startAllMicroservices();

  Logger.log(`User service gRPC is running on ${grpcUrl}`, 'Bootstrap');
}

void bootstrap();
