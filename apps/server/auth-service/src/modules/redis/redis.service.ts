import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    // Клиент создается сразу, чтобы его можно было экспортировать через DI token
    // REDIS_CLIENT, но реальное подключение стартует в onModuleInit.
    this.client = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
    });
  }

  getClient() {
    return this.client;
  }

  async onModuleInit() {
    // Вешаем обработчики до connect(), чтобы не потерять первые события
    // подключения и сразу видеть проблемы старта Redis.
    this.bindLifecycleLogs();
    await this.client.connect();
  }

  async onApplicationShutdown() {
    // disconnect() не ждет pending commands. Для auth-сервиса это приемлемо на
    // shutdown, потому что Redis используется только как session store.
    this.logger.log('Closing Redis connection.');
    this.client.disconnect();
  }

  private bindLifecycleLogs() {
    this.client.on('connect', () => {
      // TCP-соединение установлено, но Redis еще может быть не готов принимать
      // команды. Для этого ниже есть отдельное событие ready.
      this.logger.log('Redis connection established.');
    });

    this.client.on('ready', () => {
      // ready означает, что auth-service может безопасно читать и писать
      // access/refresh sessions.
      this.logger.log('Redis connection is ready.');
    });

    this.client.on('reconnecting', (delay: number) => {
      // При reconnect auth-service временно не сможет валидировать сессии.
      // Логируем delay, чтобы видеть backoff и частоту сетевых проблем.
      this.logger.warn(`Redis reconnecting in ${delay}ms.`);
    });

    this.client.on('close', () => {
      // close может быть временным состоянием перед reconnect.
      this.logger.warn('Redis connection closed.');
    });

    this.client.on('end', () => {
      // end означает, что клиент больше не будет переподключаться.
      this.logger.warn('Redis connection ended.');
    });

    this.client.on('error', (error: Error) => {
      // Ошибки Redis не должны теряться: без Redis auth-service не может
      // выпускать/валидировать сессии.
      this.logger.error(`Redis error: ${error.message}`, error.stack);
    });
  }
}
