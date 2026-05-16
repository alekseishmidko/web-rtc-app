import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  CreatePaymentOperationPayload,
  GetPaymentOperationPayload,
  ListPaymentOperationsPayload,
  ListPaymentOperationsResponse,
  PaymentOperation,
} from '@web-rtc-nest/contracts';
import { PaymentService } from './payment.service';

@Controller()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @GrpcMethod('PaymentService', 'CreateOperation')
  createOperation(request: CreatePaymentOperationPayload): Promise<PaymentOperation> {
    return this.paymentService.createOperation(request);
  }

  @GrpcMethod('PaymentService', 'GetOperation')
  getOperation(request: GetPaymentOperationPayload): Promise<PaymentOperation> {
    return this.paymentService.getOperation(request);
  }

  @GrpcMethod('PaymentService', 'ListOperations')
  listOperations(
    request: ListPaymentOperationsPayload,
  ): Promise<ListPaymentOperationsResponse> {
    return this.paymentService.listOperations(request);
  }
}
