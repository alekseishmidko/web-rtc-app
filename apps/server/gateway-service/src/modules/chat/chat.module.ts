import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../../grpc/grpc-clients.module';
import { ChatController } from './chat.controller';

@Module({
  imports: [GrpcClientsModule],
  controllers: [ChatController],
})
export class ChatModule {}
