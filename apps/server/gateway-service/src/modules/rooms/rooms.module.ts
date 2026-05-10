import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../../grpc/grpc-clients.module';
import { RoomsController } from './rooms.controller';

@Module({
  imports: [GrpcClientsModule],
  controllers: [RoomsController],
})
export class RoomsModule {}
