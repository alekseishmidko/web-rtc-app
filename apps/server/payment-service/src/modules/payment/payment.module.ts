import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  imports: [QueueModule],
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule {}
