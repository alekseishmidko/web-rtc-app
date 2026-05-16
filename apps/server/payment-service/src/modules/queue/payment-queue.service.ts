import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  Kafka,
  logLevel,
  type Admin,
  type Consumer,
  type EachMessagePayload,
  type Producer,
} from 'kafkajs';

import { DATABASE } from '../../database/database.module';
import type { PaymentDatabase } from '../../database/database.module';
import {
  paymentOperations,
  paymentOutbox,
} from '../../database/payment.schema';
import type { PaymentOutboxRecord } from '../../database/payment.schema';
import {
  PAYMENT_OPERATION_REQUESTED_EVENT,
  PAYMENT_OPERATION_REQUESTED_TOPIC,
} from './payment-queue.constants';

type PaymentOperationRequestedEvent = {
  type: string;
  payload: {
    operationId: string;
  };
};

@Injectable()
export class PaymentQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly kafka: Kafka;
  private readonly admin: Admin;
  private readonly producer: Producer;
  private readonly consumer: Consumer;
  private outboxTimer?: NodeJS.Timeout;

  constructor(@Inject(DATABASE) private readonly database: PaymentDatabase) {
    const brokers = (process.env.KAFKA_BROKERS ?? '127.0.0.1:9092')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID ?? 'payment-service',
      brokers,
      logLevel: logLevel.WARN,
    });
    this.admin = this.kafka.admin();
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({
      groupId: process.env.KAFKA_GROUP_ID ?? 'payment-service',
    });
  }

  async onModuleInit() {
    await this.admin.connect();
    await this.ensureKafkaTopics();
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: PAYMENT_OPERATION_REQUESTED_TOPIC,
      fromBeginning: true,
    });
    await this.consumer.run({
      eachMessage: (payload) => this.handlePaymentOperationRequested(payload),
    });

    this.outboxTimer = setInterval(() => {
      void this.publishPendingOutbox();
    }, Number(process.env.PAYMENT_OUTBOX_POLL_INTERVAL_MS ?? 1000));
    this.outboxTimer.unref();
    await this.publishPendingOutbox();
  }

  async onApplicationShutdown() {
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
    }

    await this.consumer.disconnect();
    await this.producer.disconnect();
    await this.admin.disconnect();
  }

  async publishPendingOutbox() {
    const events = await this.database
      .select()
      .from(paymentOutbox)
      .where(eq(paymentOutbox.status, 'pending'))
      .orderBy(paymentOutbox.createdAt)
      .limit(25);

    for (const event of events) {
      await this.publishOutboxEvent(event);
    }
  }

  private async ensureKafkaTopics() {
    await this.admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: PAYMENT_OPERATION_REQUESTED_TOPIC,
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    });
  }

  private async publishOutboxEvent(event: PaymentOutboxRecord) {
    try {
      await this.producer.send({
        topic: event.topic,
        acks: -1,
        messages: [
          {
            key: event.operationId,
            value: JSON.stringify({
              id: event.id,
              type: event.eventType,
              payload: event.payload,
            }),
          },
        ],
      });

      await this.database
        .update(paymentOutbox)
        .set({ status: 'published', publishedAt: new Date(), lastError: null })
        .where(eq(paymentOutbox.id, event.id));
    } catch (error) {
      await this.database
        .update(paymentOutbox)
        .set({
          attempts: event.attempts + 1,
          lastError: error instanceof Error ? error.message : 'Unknown Kafka publish error.',
        })
        .where(eq(paymentOutbox.id, event.id));
    }
  }

  private async handlePaymentOperationRequested(payload: EachMessagePayload) {
    const value = payload.message.value?.toString();

    if (!value) {
      return;
    }

    const event = JSON.parse(value) as PaymentOperationRequestedEvent;

    if (event.type !== PAYMENT_OPERATION_REQUESTED_EVENT) {
      return;
    }

    await this.database
      .update(paymentOperations)
      .set({ status: 'done', updatedAt: new Date() })
      .where(
        and(
          eq(paymentOperations.id, event.payload.operationId),
          eq(paymentOperations.status, 'pending'),
        ),
      );
  }
}
