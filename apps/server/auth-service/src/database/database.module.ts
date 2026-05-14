import { Global, Module } from '@nestjs/common';

import { connectionProvider } from './drizzle/connection.provider';
import { DRIZZLE_DB, drizzleProvider } from './drizzle/drizzle.provider';
import type { AuthDatabase } from './drizzle/drizzle.provider';

export const DATABASE = DRIZZLE_DB;
export type { AuthDatabase };

@Global()
@Module({
  providers: [connectionProvider, drizzleProvider],
  exports: [DRIZZLE_DB],
})
export class DatabaseModule {}
