import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const paymentOperationStatusEnum = pgEnum('payment_operation_status', [
  'pending',
  'done',
  'rejected',
]);

export const paymentOperationTypeEnum = pgEnum('payment_operation_type', [
  'deposit',
  'withdrawal',
  'refund',
  'adjustment',
]);

export const paymentOutboxStatusEnum = pgEnum('payment_outbox_status', [
  'pending',
  'published',
  'failed',
]);

export const paymentOperations = pgTable(
  'payment_operations',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    type: paymentOperationTypeEnum('type').notNull(),
    status: paymentOperationStatusEnum('status').notNull().default('pending'),
    currency: text('currency').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('payment_operations_user_created_idx').on(table.userId, table.createdAt),
    index('payment_operations_status_idx').on(table.status),
  ],
);

export const paymentOutbox = pgTable(
  'payment_outbox',
  {
    id: uuid('id').primaryKey(),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => paymentOperations.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: paymentOutboxStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    index('payment_outbox_status_created_idx').on(table.status, table.createdAt),
    index('payment_outbox_operation_idx').on(table.operationId),
  ],
);

export type PaymentOperationRecord = typeof paymentOperations.$inferSelect;
export type PaymentOutboxRecord = typeof paymentOutbox.$inferSelect;
