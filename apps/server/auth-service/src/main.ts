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
      package: 'auth',
      protoPath: join(process.cwd(), '../../../packages/contracts/proto/auth.proto'),
      url: grpcUrl,
    },
  });

  await app.startAllMicroservices();
  console.log(`Auth service gRPC is running on ${grpcUrl}`);
}

void bootstrap();
