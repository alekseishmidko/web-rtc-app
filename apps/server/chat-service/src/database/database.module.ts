import { Global, Module } from '@nestjs/common';

import {
  connectionProvider,
  DatabaseShutdown,
} from './drizzle/connection.provider';
import { DRIZZLE_DB, drizzleProvider } from './drizzle/drizzle.provider';
import type { ChatDatabase } from './drizzle/drizzle.provider';

export const DATABASE = DRIZZLE_DB;
export type { ChatDatabase };

@Global()
@Module({
  providers: [connectionProvider, drizzleProvider, DatabaseShutdown],
  exports: [DRIZZLE_DB],
})
export class DatabaseModule {}
