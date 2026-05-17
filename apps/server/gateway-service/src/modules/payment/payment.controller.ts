import type { OnModuleInit } from '@nestjs/common';
import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  ListPaymentOperationsResponse,
  PaymentGrpcService,
  PaymentOperation,
} from '@web-rtc-nest/contracts';
import { firstValueFrom } from 'rxjs';
import { PAYMENT_GRPC_CLIENT } from '../../grpc/grpc-clients.module';
import {
  CreatePaymentOperationRequestDto,
  GetPaymentOperationParamsDto,
  ListPaymentOperationsResponseDto,
  ListPaymentOperationsParamsDto,
  ListPaymentOperationsQueryDto,
  PaymentOperationDto,
} from './dto/payment.dto';

@ApiTags('payment')
@Controller('payments')
export class PaymentController implements OnModuleInit {
  private paymentService!: PaymentGrpcService;

  constructor(@Inject(PAYMENT_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  /**
   * Получает gRPC-клиент payment-service после инициализации Nest-модуля.
   *
   * Gateway не содержит бизнес-логику платежей: он принимает HTTP-запрос,
   * валидирует DTO и проксирует команду во внутренний payment-service.
   */
  onModuleInit() {
    this.paymentService = this.client.getService<PaymentGrpcService>('PaymentService');
  }

  /**
   * Создает денежную операцию пользователя.
   *
   * Метод принимает HTTP body, валидирует его через CreatePaymentOperationRequestDto
   * и отправляет gRPC-команду CreateOperation в payment-service. В payment-service
   * операция сначала сохраняется как pending, после чего через Kafka/outbox
   * доводится до итогового статуса.
   */
  @Post('operations')
  @ApiOperation({
    summary: 'Создать денежную операцию',
    description:
      'Создает денежную операцию через payment-service. Payment-service записывает операцию и outbox-событие в Postgres, публикует событие в Kafka, после чего Kafka consumer переводит операцию в итоговый статус. Интеграции с внешней платежной системой пока нет.',
  })
  @ApiBody({ type: CreatePaymentOperationRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Созданная операция. Статус может быть pending до обработки Kafka-события.',
    type: PaymentOperationDto,
  })
  createOperation(@Body() body: CreatePaymentOperationRequestDto): Promise<PaymentOperation> {
    return firstValueFrom(this.paymentService.createOperation(body));
  }

  /**
   * Возвращает одну денежную операцию по ID.
   *
   * Параметр operationId валидируется как UUID. Если payment-service не найдет
   * операцию, gRPC ошибка будет преобразована глобальным фильтром gateway в
   * HTTP-ответ.
   */
  @Get('operations/:operationId')
  @ApiOperation({
    summary: 'Получить денежную операцию по ID',
    description: 'Читает одну денежную операцию из payment-service через gRPC.',
  })
  @ApiParam({
    name: 'operationId',
    description: 'ID денежной операции.',
    example: 'fe9061fe-f787-4c59-94dd-e193105ca950',
  })
  @ApiResponse({ status: 200, type: PaymentOperationDto })
  getOperation(@Param() params: GetPaymentOperationParamsDto): Promise<PaymentOperation> {
    return firstValueFrom(this.paymentService.getOperation({ operationId: params.operationId }));
  }

  /**
   * Возвращает историю денежных операций пользователя.
   *
   * userId валидируется как UUID, limit приводится к number через ValidationPipe.
   * Gateway не читает БД напрямую: список возвращает payment-service по gRPC.
   */
  @Get('users/:userId/operations')
  @ApiOperation({
    summary: 'Получить операции пользователя',
    description:
      'Возвращает денежные операции пользователя от новых к старым. limit по умолчанию равен 50, максимальное значение - 100.',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID пользователя, чьи операции нужно получить.',
    example: 'e63ad47b-caf4-49b0-89f6-bc9b43f2f354',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Необязательный лимит выдачи в диапазоне 1..100.',
    example: 50,
  })
  @ApiResponse({ status: 200, type: ListPaymentOperationsResponseDto })
  listOperations(
    @Param() params: ListPaymentOperationsParamsDto,
    @Query() query: ListPaymentOperationsQueryDto,
  ): Promise<ListPaymentOperationsResponse> {
    return firstValueFrom(
      this.paymentService.listOperations({
        userId: params.userId,
        limit: query.limit,
      }),
    );
  }
}
