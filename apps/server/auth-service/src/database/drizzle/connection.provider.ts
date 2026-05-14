import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

export const PG_CONNECTION = Symbol('PG_CONNECTION');

export const connectionProvider: Provider = {
  provide: PG_CONNECTION,
  useFactory: async (configService: ConfigService) => {
    const client = new Client({
      host: configService.getOrThrow<string>('DATABASE_HOST'),
      port: configService.getOrThrow<number>('DATABASE_PORT'),
      user: configService.getOrThrow<string>('DATABASE_USERNAME'),
      password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
      database: configService.getOrThrow<string>('DATABASE_NAME'),
      ssl: configService.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
    });

    await client.connect();

    return client;
  },
  inject: [ConfigService],
};
