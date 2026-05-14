import type { Provider } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Client } from 'pg';

import * as schema from '../chat.schema';
import { PG_CONNECTION } from './connection.provider';

export const DRIZZLE_DB = Symbol('DRIZZLE_DB');
export type ChatDatabase = NodePgDatabase<typeof schema>;

export const drizzleProvider: Provider<ChatDatabase> = {
  provide: DRIZZLE_DB,
  useFactory: (client: Client): ChatDatabase => {
    return drizzle(client, { schema });
  },
  inject: [PG_CONNECTION],
};
