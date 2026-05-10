import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../../grpc/grpc-clients.module';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [GrpcClientsModule],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
