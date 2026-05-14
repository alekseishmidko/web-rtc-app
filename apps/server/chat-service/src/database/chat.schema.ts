import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const conversationTypeEnum = pgEnum('chat_conversation_type', ['direct', 'group', 'room']);
export const mediaStatusEnum = pgEnum('chat_media_status', ['pending', 'uploaded', 'failed']);

// Conversation is the stable aggregate root for all chat modes. The optional
// directKey and roomId fields keep 1-1 chats and video-room chats idempotent.
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey(),
    type: conversationTypeEnum('type').notNull(),
    title: text('title'),
    roomId: text('room_id'),
    directKey: text('direct_key'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('chat_conversations_direct_key_unique').on(table.directKey),
    uniqueIndex('chat_conversations_room_id_unique').on(table.roomId),
    index('chat_conversations_type_idx').on(table.type),
  ],
);

export const chatParticipants = pgTable(
  'chat_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('chat_participants_conversation_user_unique').on(
      table.conversationId,
      table.userId,
    ),
    index('chat_participants_user_idx').on(table.userId),
  ],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').notNull(),
    text: text('text'),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chat_messages_conversation_created_idx').on(table.conversationId, table.createdAt),
    index('chat_messages_sender_idx').on(table.senderId),
  ],
);

export const chatMediaAttachments = pgTable(
  'chat_media_attachments',
  {
    id: uuid('id').primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    mediaId: text('media_id'),
    uploadId: text('upload_id'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    status: mediaStatusEnum('status').notNull().default('pending'),
    // Metadata is intentionally loose until media-service owns validation.
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chat_media_attachments_message_idx').on(table.messageId),
    index('chat_media_attachments_media_idx').on(table.mediaId),
    index('chat_media_attachments_upload_idx').on(table.uploadId),
  ],
);

export type ChatConversationRecord = typeof chatConversations.$inferSelect;
export type ChatMessageRecord = typeof chatMessages.$inferSelect;
export type ChatMediaAttachmentRecord = typeof chatMediaAttachments.$inferSelect;
