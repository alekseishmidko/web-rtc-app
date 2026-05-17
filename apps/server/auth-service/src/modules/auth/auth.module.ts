import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { TokenModule } from '../token/token.module';
import { AuthController } from './auth.controller';
import { USER_GRPC_CLIENT } from './auth.constants';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

@Module({
  imports: [
    TokenModule,
    ClientsModule.registerAsync([
      {
        name: USER_GRPC_CLIENT,
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'user',
            protoPath: join(process.cwd(), '../../../packages/contracts/proto/user.proto'),
            url: configService.getOrThrow<string>('USER_GRPC_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
})
export class AuthModule {}
