import { date, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id').notNull(),
    name: text('name').notNull(),
    birthDay: date('birth_day'),
    currency: text('currency'),
    country: text('country'),
    locale: text('locale'),
    timezone: text('timezone'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    phoneNumber: text('phone_number'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('users_account_id_unique').on(table.accountId)],
);

export type UserRecord = typeof users.$inferSelect;
