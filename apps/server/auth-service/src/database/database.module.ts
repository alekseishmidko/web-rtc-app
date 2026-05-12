import type { OnApplicationShutdown } from '@nestjs/common';
import { Global, Inject, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as postgres from 'postgres';
import * as schema from './user.schema';

export const DATABASE = Symbol('DATABASE');
export const POSTGRES_CLIENT = Symbol('POSTGRES_CLIENT');

export type AuthDatabase = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        postgres(configService.getOrThrow<string>('DATABASE_URL'), {
          max: 10,
        }),
    },
    {
      provide: DATABASE,
      inject: [POSTGRES_CLIENT],
      useFactory: (client: postgres.Sql) => drizzle(client, { schema }),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(POSTGRES_CLIENT)
    private readonly client: postgres.Sql,
  ) {}

  async onApplicationShutdown() {
    await this.client.end();
  }
}
