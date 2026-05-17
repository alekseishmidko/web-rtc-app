import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../../grpc/grpc-clients.module';
import { UserController } from './user.controller';

@Module({
  imports: [GrpcClientsModule],
  controllers: [UserController],
})
export class UserModule {}
