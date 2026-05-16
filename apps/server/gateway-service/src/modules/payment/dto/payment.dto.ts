import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  CreatePaymentOperationPayload,
  PaymentOperation,
  PaymentOperationStatus,
  PaymentOperationType,
} from '@web-rtc-nest/contracts';

const paymentOperationTypes: PaymentOperationType[] = [
  'deposit',
  'withdrawal',
  'refund',
  'adjustment',
];

const paymentOperationStatuses: PaymentOperationStatus[] = ['pending', 'done', 'rejected'];

export class CreatePaymentOperationRequestDto implements CreatePaymentOperationPayload {
  /** ID пользователя, к которому относится денежная операция. */
  @ApiProperty({
    description: 'ID пользователя, к которому относится денежная операция.',
    example: '2a2d0f7f-c1df-4b8b-a6cc-80101895b405',
  })
  @IsUUID()
  userId: string;

  /** Тип операции: пополнение, списание, возврат или ручная корректировка. */
  @ApiProperty({
    description: 'Тип операции: пополнение, списание, возврат или ручная корректировка.',
    enum: paymentOperationTypes,
    example: 'deposit',
  })
  @IsEnum(paymentOperationTypes)
  type: PaymentOperationType;

  /** Валюта операции в формате ISO 4217: USD, EUR, RUB и так далее. */
  @ApiProperty({
    description: 'Валюта операции в формате ISO 4217: USD, EUR, RUB и так далее.',
    example: 'USD',
  })
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a valid uppercase ISO 4217 code.',
  })
  currency: string;

  /** Сумма операции. Хранится строкой, чтобы не терять точность на float. */
  @ApiProperty({
    description: 'Сумма операции. Хранится строкой, чтобы не терять точность на float.',
    example: '25.50',
  })
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a positive decimal with up to 2 fractional digits.',
  })
  amount: string;

  /** Необязательное описание причины операции для аудита и поддержки. */
  @ApiPropertyOptional({
    description: 'Необязательное описание причины операции для аудита и поддержки.',
    example: 'Manual test top-up',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PaymentOperationDto implements PaymentOperation {
  /** ID денежной операции. */
  @ApiProperty({
    description: 'ID денежной операции.',
    example: '9f11c2df-5b7c-41da-88ab-e2264d9f75d1',
  })
  id: string;

  /** ID пользователя, которому принадлежит операция. */
  @ApiProperty({
    description: 'ID пользователя, которому принадлежит операция.',
    example: '2a2d0f7f-c1df-4b8b-a6cc-80101895b405',
  })
  userId: string;

  /** Тип денежной операции. */
  @ApiProperty({
    description: 'Тип денежной операции.',
    enum: paymentOperationTypes,
    example: 'deposit',
  })
  type: PaymentOperationType;

  /** Текущий статус обработки операции. */
  @ApiProperty({
    description:
      'Текущий статус обработки операции: pending - создана, done - обработана, rejected - отклонена.',
    enum: paymentOperationStatuses,
    example: 'pending',
  })
  status: PaymentOperationStatus;

  /** Валюта операции. */
  @ApiProperty({ description: 'Валюта операции.', example: 'USD' })
  currency: string;

  /** Сумма операции в десятичном строковом формате. */
  @ApiProperty({
    description: 'Сумма операции в десятичном строковом формате.',
    example: '25.50',
  })
  amount: string;

  /** Причина или комментарий к операции, если он был передан при создании. */
  @ApiPropertyOptional({
    description: 'Причина или комментарий к операции, если он был передан при создании.',
    example: 'Manual test top-up',
  })
  reason?: string;

  /** Дата создания операции в ISO формате. */
  @ApiProperty({
    description: 'Дата создания операции в ISO формате.',
    example: '2026-05-10T10:00:00.000Z',
  })
  createdAt: string;

  /** Дата последнего изменения операции в ISO формате. */
  @ApiProperty({
    description: 'Дата последнего изменения операции в ISO формате.',
    example: '2026-05-10T10:00:01.000Z',
  })
  updatedAt: string;
}

export class ListPaymentOperationsResponseDto {
  /** Список операций пользователя, отсортированный от новых к старым. */
  @ApiProperty({
    description: 'Список операций пользователя, отсортированный от новых к старым.',
    type: [PaymentOperationDto],
  })
  operations: PaymentOperationDto[];
}

export class GetPaymentOperationParamsDto {
  /** ID операции, которую нужно получить. */
  @ApiProperty({
    description: 'ID операции, которую нужно получить.',
    example: '9f11c2df-5b7c-41da-88ab-e2264d9f75d1',
  })
  @IsUUID()
  operationId: string;
}

export class ListPaymentOperationsParamsDto {
  /** ID пользователя, для которого нужно вернуть историю денежных операций. */
  @ApiProperty({
    description: 'ID пользователя, для которого нужно вернуть историю денежных операций.',
    example: '2a2d0f7f-c1df-4b8b-a6cc-80101895b405',
  })
  @IsUUID()
  userId: string;
}

export class ListPaymentOperationsQueryDto {
  /** Необязательный лимит выдачи. Payment-service дополнительно ограничивает значение диапазоном 1..100. */
  @ApiPropertyOptional({
    description:
      'Необязательный лимит выдачи. Payment-service дополнительно ограничивает значение диапазоном 1..100.',
    example: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
