import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../../grpc/grpc-clients.module';
import { PaymentController } from './payment.controller';

@Module({
  imports: [GrpcClientsModule],
  controllers: [PaymentController],
})
export class PaymentModule {}
