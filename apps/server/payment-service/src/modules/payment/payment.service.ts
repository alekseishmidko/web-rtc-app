import { status } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type {
  CreatePaymentOperationPayload,
  GetPaymentOperationPayload,
  ListPaymentOperationsPayload,
  PaymentOperation,
  PaymentOperationType,
} from '@web-rtc-nest/contracts';
import { desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { DATABASE } from '../../database/database.module';
import type { PaymentDatabase } from '../../database/database.module';
import {
  paymentOperations,
  paymentOutbox,
} from '../../database/payment.schema';
import type { PaymentOperationRecord } from '../../database/payment.schema';
import {
  PAYMENT_OPERATION_REQUESTED_EVENT,
  PAYMENT_OPERATION_REQUESTED_TOPIC,
} from '../queue/payment-queue.constants';
import { PaymentQueueService } from '../queue/payment-queue.service';

@Injectable()
export class PaymentService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly database: PaymentDatabase,
    private readonly queueService: PaymentQueueService,
  ) {}

  async onModuleInit() {
    await this.bootstrapSchema();
  }

  async createOperation(payload: CreatePaymentOperationPayload) {
    const userId = this.requireUuid(payload.userId, 'userId');
    const type = this.requireOperationType(payload.type);
    const currency = this.requireCurrency(payload.currency);
    const amount = this.requireAmount(payload.amount);
    const operationId = randomUUID();
    const nowPayload = {
      operationId,
      userId,
      type,
      currency,
      amount,
      reason: payload.reason?.trim() || undefined,
    };

    const operation = await this.database.transaction(async (tx) => {
      const [createdOperation] = await tx
        .insert(paymentOperations)
        .values({
          id: operationId,
          userId,
          type,
          status: 'pending',
          currency,
          amount,
          reason: payload.reason?.trim() || null,
        })
        .returning();

      if (!createdOperation) {
        throw this.createRpcException(status.INTERNAL, 'Failed to create payment operation.');
      }

      await tx.insert(paymentOutbox).values({
        id: randomUUID(),
        operationId,
        topic: PAYMENT_OPERATION_REQUESTED_TOPIC,
        eventType: PAYMENT_OPERATION_REQUESTED_EVENT,
        payload: nowPayload,
      });

      return createdOperation;
    });

    // Публикация не блокирует HTTP/gRPC ответ. Если Kafka временно недоступна,
    // outbox-запись останется pending и будет отправлена следующим poll.
    void this.queueService.publishPendingOutbox();

    return this.toOperation(operation);
  }

  async getOperation(payload: GetPaymentOperationPayload) {
    const operationId = this.requireUuid(payload.operationId, 'operationId');
    const operation = await this.database.query.paymentOperations.findFirst({
      where: eq(paymentOperations.id, operationId),
    });

    if (!operation) {
      throw this.createRpcException(status.NOT_FOUND, 'Payment operation not found.');
    }

    return this.toOperation(operation);
  }

  async listOperations(payload: ListPaymentOperationsPayload) {
    const userId = this.requireUuid(payload.userId, 'userId');
    const requestedLimit = payload.limit && payload.limit > 0 ? payload.limit : 50;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const operations = await this.database
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.userId, userId))
      .orderBy(desc(paymentOperations.createdAt))
      .limit(limit);

    return {
      operations: operations.map((operation) => this.toOperation(operation)),
    };
  }

  private async bootstrapSchema() {
    await this.database.execute(sql`
      DO $$ BEGIN
        CREATE TYPE payment_operation_status AS ENUM ('pending', 'done', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.database.execute(sql`
      DO $$ BEGIN
        CREATE TYPE payment_operation_type AS ENUM ('deposit', 'withdrawal', 'refund', 'adjustment');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.database.execute(sql`
      DO $$ BEGIN
        CREATE TYPE payment_outbox_status AS ENUM ('pending', 'published', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.database.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_operations (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        type payment_operation_type NOT NULL,
        status payment_operation_status NOT NULL DEFAULT 'pending',
        currency text NOT NULL,
        amount numeric(18, 2) NOT NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await this.database.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_outbox (
        id uuid PRIMARY KEY,
        operation_id uuid NOT NULL REFERENCES payment_operations(id) ON DELETE CASCADE,
        topic text NOT NULL,
        event_type text NOT NULL,
        payload jsonb NOT NULL,
        status payment_outbox_status NOT NULL DEFAULT 'pending',
        attempts integer NOT NULL DEFAULT 0,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz
      );
    `);

    await this.database.execute(sql`
      CREATE INDEX IF NOT EXISTS payment_operations_user_created_idx
        ON payment_operations(user_id, created_at);
      CREATE INDEX IF NOT EXISTS payment_operations_status_idx ON payment_operations(status);
      CREATE INDEX IF NOT EXISTS payment_outbox_status_created_idx
        ON payment_outbox(status, created_at);
      CREATE INDEX IF NOT EXISTS payment_outbox_operation_idx ON payment_outbox(operation_id);
    `);
  }

  private toOperation(operation: PaymentOperationRecord): PaymentOperation {
    return {
      id: operation.id,
      userId: operation.userId,
      type: operation.type,
      status: operation.status,
      currency: operation.currency,
      amount: operation.amount,
      reason: operation.reason ?? undefined,
      createdAt: operation.createdAt.toISOString(),
      updatedAt: operation.updatedAt.toISOString(),
    };
  }

  private requireUuid(value: string | undefined, fieldName: string) {
    if (
      !value ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) {
      throw this.createRpcException(status.INVALID_ARGUMENT, `${fieldName} must be a valid uuid.`);
    }

    return value;
  }

  private requireOperationType(value: string | undefined): PaymentOperationType {
    if (!['deposit', 'withdrawal', 'refund', 'adjustment'].includes(value ?? '')) {
      throw this.createRpcException(status.INVALID_ARGUMENT, 'type must be a valid operation type.');
    }

    return value as PaymentOperationType;
  }

  private requireCurrency(value: string | undefined) {
    const currency = value?.trim().toUpperCase();

    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
      throw this.createRpcException(
        status.INVALID_ARGUMENT,
        'currency must be a valid ISO 4217 code.',
      );
    }

    return currency;
  }

  private requireAmount(value: string | undefined) {
    const amount = value?.trim();

    if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      throw this.createRpcException(
        status.INVALID_ARGUMENT,
        'amount must be a positive decimal with up to 2 fractional digits.',
      );
    }

    return amount;
  }

  private createRpcException(code: status, details: string) {
    return new RpcException({ code, details });
  }
}
