import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  // Тип события нужен, чтобы один topic мог безопасно переносить разные виды
  // payment-событий. Сейчас обрабатываем только PaymentOperationRequested.
  type: string;
  payload: {
    // ID операции используется как идемпотентный ключ: повторная доставка Kafka
    // не создаст новую операцию, а попытается обновить ту же запись.
    operationId: string;
  };
};

@Injectable()
export class PaymentQueueService implements OnModuleInit, OnApplicationShutdown {
  /**
   * Kafka client - фабрика подключений KafkaJS.
   *
   * Сам client не отправляет и не читает сообщения. Из него создаются роли:
   * admin, producer и consumer. Все они используют общий clientId и список
   * brokers из конфигурации.
   */
  private readonly kafka: Kafka;

  /**
   * Admin - технический клиент для управления Kafka.
   *
   * В этом сервисе он используется только на старте, чтобы гарантировать
   * существование topic `payment.operation.requested`. Так мы не зависим от
   * auto-create topics и не ловим UNKNOWN_TOPIC_OR_PARTITION при старте consumer.
   */
  private readonly admin: Admin;

  /**
   * Producer - отправитель сообщений в Kafka.
   *
   * Здесь producer публикует события из таблицы payment_outbox в Kafka topic.
   * PaymentService не пишет в Kafka напрямую: он создает outbox-запись в той же
   * транзакции, что и payment operation, а producer позже доставляет эту запись.
   */
  private readonly producer: Producer;

  /**
   * Consumer - читатель сообщений из Kafka.
   *
   * Consumer подписан на topic `payment.operation.requested`. Когда событие
   * приходит из Kafka, consumer вызывает handlePaymentOperationRequested и
   * переводит соответствующую операцию из pending в done.
   */
  private readonly consumer: Consumer;

  /**
   * Таймер outbox polling.
   *
   * Он периодически ищет в БД события со статусом pending и пробует отправить
   * их в Kafka. Если Kafka временно недоступна, запись остается pending и будет
   * повторена на следующем цикле.
   */
  private outboxTimer?: NodeJS.Timeout;

  constructor(
    @Inject(DATABASE) private readonly database: PaymentDatabase,
    private readonly configService: ConfigService,
  ) {
    // KAFKA_BROKERS может содержать несколько адресов через запятую:
    // "host1:9092,host2:9092". Это позволяет переживать недоступность одного
    // broker в multi-broker конфигурации.
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', '127.0.0.1:9092')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    this.kafka = new Kafka({
      // clientId попадает в Kafka logs/metrics и помогает понять, какой сервис
      // открыл подключение или публикует сообщения.
      clientId: this.configService.get<string>('KAFKA_CLIENT_ID', 'payment-service'),
      brokers,
      logLevel: logLevel.WARN,
    });
    this.admin = this.kafka.admin();
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({
      // groupId объединяет несколько инстансов payment-service в одну consumer
      // group. Kafka отдаст каждую partition только одному consumer из группы,
      // поэтому одно событие не будет параллельно обработано всеми replica.
      groupId: this.configService.get<string>('KAFKA_GROUP_ID', 'payment-service'),
    });
  }

  async onModuleInit() {
    // Порядок важен:
    // 1. admin создает topic;
    // 2. producer подключается для публикации outbox;
    // 3. consumer подписывается и начинает читать события.
    await this.admin.connect();
    await this.ensureKafkaTopics();
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: PAYMENT_OPERATION_REQUESTED_TOPIC,
      // fromBeginning: true полезен для локальной разработки и восстановления:
      // если consumer group новая, она прочитает уже существующие события.
      // Уже обработанные события не сломают данные из-за idempotent update ниже.
      fromBeginning: true,
    });
    await this.consumer.run({
      // eachMessage вызывается KafkaJS для каждого сообщения, которое consumer
      // получил из topic. Здесь находится входная точка обработки очереди.
      eachMessage: (payload) => this.handlePaymentOperationRequested(payload),
    });

    // Outbox polling - страховка надежной доставки. gRPC-запрос не зависит от
    // мгновенной доступности Kafka: событие уже сохранено в БД, а этот таймер
    // будет пытаться доставить его до успеха.
    this.outboxTimer = setInterval(() => {
      void this.publishPendingOutbox();
    }, this.configService.get<number>('PAYMENT_OUTBOX_POLL_INTERVAL_MS', 1000));

    // unref() позволяет Node-процессу завершиться, если больше нет активной
    // работы, и не держать event loop только из-за polling timer.
    this.outboxTimer.unref();

    // Пробуем опубликовать pending-события сразу после старта, не ожидая первый
    // интервал таймера.
    await this.publishPendingOutbox();
  }

  async onApplicationShutdown() {
    // На shutdown сначала останавливаем polling, затем закрываем Kafka
    // подключения. Это предотвращает попытку publish во время disconnect.
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
    }

    await this.consumer.disconnect();
    await this.producer.disconnect();
    await this.admin.disconnect();
  }

  async publishPendingOutbox() {
    // Берем небольшую пачку pending событий, чтобы один poll не заблокировал
    // сервис надолго. Следующая пачка будет взята следующим вызовом метода.
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
    // Явное создание topic делает startup предсказуемым. Если topic уже есть,
    // KafkaJS просто вернет успешный результат без повторного создания.
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
        // acks: -1 означает "all": broker подтвердит запись только после того,
        // как сообщение принято всеми in-sync replicas. В локальном single-node
        // Kafka это все равно один broker, но настройка отражает требование
        // надежной доставки.
        acks: -1,
        messages: [
          {
            // key задает routing в partition. Все события одной операции попадут
            // в одну partition и сохранят порядок относительно operationId.
            key: event.operationId,
            value: JSON.stringify({
              id: event.id,
              type: event.eventType,
              payload: event.payload,
            }),
          },
        ],
      });

      // Kafka подтвердила публикацию, поэтому outbox-запись можно пометить как
      // published. Это предотвращает повторную отправку на следующих poll.
      await this.database
        .update(paymentOutbox)
        .set({ status: 'published', publishedAt: new Date(), lastError: null })
        .where(eq(paymentOutbox.id, event.id));
    } catch (error) {
      // Не падаем всем сервисом из-за временной ошибки Kafka. Сохраняем ошибку
      // и увеличиваем attempts; статус остается pending, значит событие будет
      // повторно опубликовано позже.
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
    // Kafka message value хранится как Buffer. Если value пустой, событие
    // пропускается: обрабатывать в нем нечего.
    const value = payload.message.value?.toString();

    if (!value) {
      return;
    }

    const event = JSON.parse(value) as PaymentOperationRequestedEvent;

    // В topic могут появиться другие типы событий. Этот consumer обрабатывает
    // только PaymentOperationRequested, остальные игнорирует.
    if (event.type !== PAYMENT_OPERATION_REQUESTED_EVENT) {
      return;
    }

    // Обработка идемпотентна: обновляем только pending-операцию. Если Kafka
    // доставит событие повторно, операция уже будет done и update ничего не
    // изменит. Это нормальная модель для at-least-once доставки Kafka.
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
