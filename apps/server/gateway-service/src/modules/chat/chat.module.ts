import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../../grpc/grpc-clients.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [GrpcClientsModule],
  controllers: [ChatController],
  providers: [ChatGateway],
})
export class ChatModule {}
