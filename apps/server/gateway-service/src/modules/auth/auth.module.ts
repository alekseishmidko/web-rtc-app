import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../../grpc/grpc-clients.module';
import { AuthCookieService } from './auth-cookie.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [GrpcClientsModule],
  controllers: [AuthController],
  providers: [AuthCookieService],
})
export class AuthModule {}
