import { Module } from '@nestjs/common';
import { PaymentQueueService } from './payment-queue.service';

@Module({
  providers: [PaymentQueueService],
  exports: [PaymentQueueService],
})
export class QueueModule {}
