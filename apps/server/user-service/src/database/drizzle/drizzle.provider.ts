import type { Provider } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Client } from 'pg';

import * as usersSchema from '../user.schema';
import { PG_CONNECTION } from './connection.provider';

export const DRIZZLE_DB = Symbol('DRIZZLE_DB');
export type UserDatabase = NodePgDatabase<typeof usersSchema>;

export const drizzleProvider: Provider<UserDatabase> = {
  provide: DRIZZLE_DB,
  useFactory: (client: Client): UserDatabase => {
    return drizzle(client, { schema: usersSchema });
  },
  inject: [PG_CONNECTION],
};
