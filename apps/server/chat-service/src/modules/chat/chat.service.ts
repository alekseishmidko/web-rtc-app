import { status } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
  ChatConversation,
  ChatClearHistoryPayload,
  ChatClearHistoryResponse,
  ChatDeleteMessagesPayload,
  ChatDeleteMessagesResponse,
  ChatDirectCreatePayload,
  ChatEditMessagePayload,
  ChatGroupCreatePayload,
  ChatListMessagesPayload,
  ChatMediaAttachment,
  ChatMediaAttachmentDraft,
  ChatMessage,
  ChatRoomSyncPayload,
  ChatSendMessagePayload,
} from '@web-rtc-nest/contracts';

import { DATABASE } from '../../database/database.module';
import type { ChatDatabase } from '../../database/database.module';
import {
  chatConversations,
  chatMediaAttachments,
  chatMessages,
  chatParticipants,
} from '../../database/chat.schema';
import type {
  ChatConversationRecord,
  ChatMediaAttachmentRecord,
  ChatMessageRecord,
} from '../../database/chat.schema';

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(@Inject(DATABASE) private readonly database: ChatDatabase) {}

  /**
   * Поднимает минимальную chat-схему при старте сервиса.
   *
   * Это dev-friendly bootstrap: сервис сам создает enum-типы, таблицы и индексы,
   * чтобы локально можно было стартовать без отдельного шага миграций. В
   * production эту ответственность лучше вынести в Drizzle migrations, иначе
   * изменение схемы будет сложнее контролировать и откатывать.
   */
  async onModuleInit() {
    // В dev-режиме сервис сам поднимает минимальную схему, как auth-service.
    // Для production это лучше заменить на версионируемые миграции Drizzle.
    await this.database.execute(sql`
      DO $$ BEGIN
        CREATE TYPE chat_conversation_type AS ENUM ('direct', 'group', 'room');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.database.execute(sql`
      DO $$ BEGIN
        CREATE TYPE chat_media_status AS ENUM ('pending', 'uploaded', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.database.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id uuid PRIMARY KEY,
        type chat_conversation_type NOT NULL,
        title text,
        room_id text,
        direct_key text,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await this.database.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_participants (
        conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        last_read_at timestamptz,
        CONSTRAINT chat_participants_conversation_user_unique UNIQUE (conversation_id, user_id)
      );
    `);

    await this.database.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id uuid PRIMARY KEY,
        conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        sender_id uuid NOT NULL,
        text text,
        edited_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await this.database.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_media_attachments (
        id uuid PRIMARY KEY,
        message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
        media_id text,
        upload_id text,
        file_name text NOT NULL,
        mime_type text NOT NULL,
        size_bytes bigint NOT NULL,
        status chat_media_status NOT NULL DEFAULT 'pending',
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await this.database.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_direct_key_unique
        ON chat_conversations(direct_key)
        WHERE direct_key IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_room_id_unique
        ON chat_conversations(room_id)
        WHERE room_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS chat_conversations_type_idx ON chat_conversations(type);
      CREATE INDEX IF NOT EXISTS chat_participants_user_idx ON chat_participants(user_id);
      CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
        ON chat_messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS chat_messages_sender_idx ON chat_messages(sender_id);
      CREATE INDEX IF NOT EXISTS chat_media_attachments_message_idx
        ON chat_media_attachments(message_id);
      CREATE INDEX IF NOT EXISTS chat_media_attachments_media_idx
        ON chat_media_attachments(media_id);
      CREATE INDEX IF NOT EXISTS chat_media_attachments_upload_idx
        ON chat_media_attachments(upload_id);
    `);
  }

  /**
   * Создает direct conversation для пары пользователей или возвращает уже
   * существующий.
   *
   * Важное правило: direct chat должен быть идемпотентным. Поэтому ключ строится
   * из двух UUID в отсортированном порядке. Вызовы A->B и B->A попадут в один
   * `directKey` и не создадут два разных чата для одной пары.
   */
  async createDirectChat(payload: ChatDirectCreatePayload) {
    const initiatorId = this.requireUuid(payload.initiatorId, 'initiatorId');
    const participantId = this.requireUuid(payload.participantId, 'participantId');
    // Сортированный ключ делает создание 1-1 чата идемпотентным: не важно,
    // кто из двух пользователей первым инициировал разговор.
    const directKey = [initiatorId, participantId].sort().join(':');
    const existing = await this.database.query.chatConversations.findFirst({
      where: eq(chatConversations.directKey, directKey),
    });

    if (existing) {
      return this.toConversation(existing);
    }

    const [conversation] = await this.database
      .insert(chatConversations)
      .values({
        id: randomUUID(),
        type: 'direct',
        directKey,
        createdBy: initiatorId,
      })
      .returning();

    if (!conversation) {
      throw new Error('Failed to create direct chat.');
    }

    await this.addParticipants(conversation.id, [initiatorId, participantId]);

    return this.toConversation(conversation);
  }

  /**
   * Создает group conversation и записывает участников.
   *
   * Создатель всегда включается в список участников независимо от того, передал
   * ли его клиент в `participantIds`. Группа из одного человека не создается:
   * для личного разговора есть `createDirectChat`.
   */
  async createGroupChat(payload: ChatGroupCreatePayload) {
    const creatorId = this.requireUuid(payload.creatorId, 'creatorId');
    // Создатель всегда становится участником, даже если клиент не передал его
    // в participantIds.
    const participantIds = this.uniqueIds([creatorId, ...payload.participantIds]);

    if (participantIds.length < 2) {
      throw new Error('Group chat requires at least two participants.');
    }

    const [conversation] = await this.database
      .insert(chatConversations)
      .values({
        id: randomUUID(),
        type: 'group',
        title: payload.title?.trim() || null,
        createdBy: creatorId,
      })
      .returning();

    if (!conversation) {
      throw new Error('Failed to create group chat.');
    }

    await this.addParticipants(conversation.id, participantIds);

    return this.toConversation(conversation);
  }

  /**
   * Синхронизирует chat conversation с WebRTC-комнатой.
   *
   * `roomId` является стабильной связкой между video room и chat room. Если чат
   * для комнаты уже есть, метод только добавляет новых участников и не удаляет
   * старых: так пользователи не теряют доступ к уже созданной истории из-за
   * изменений состава звонка.
   */
  async syncRoomChat(payload: ChatRoomSyncPayload) {
    const userId = this.requireUuid(payload.userId, 'userId');
    const roomId = payload.roomId?.trim();

    if (!roomId) {
      throw new Error('roomId is required.');
    }

    const existing = await this.database.query.chatConversations.findFirst({
      where: eq(chatConversations.roomId, roomId),
    });

    if (existing) {
      // Состав видеокомнаты может меняться. Sync только добавляет недостающих
      // участников и не удаляет старых, чтобы не потерять историю доступа.
      await this.addParticipants(
        existing.id,
        this.uniqueIds([userId, ...(payload.participantIds ?? [])]),
      );
      return this.toConversation(existing);
    }

    const [conversation] = await this.database
      .insert(chatConversations)
      .values({
        id: randomUUID(),
        type: 'room',
        title: payload.title?.trim() || null,
        roomId,
        createdBy: userId,
      })
      .returning();

    if (!conversation) {
      throw new Error('Failed to create room chat.');
    }

    await this.addParticipants(
      conversation.id,
      this.uniqueIds([userId, ...(payload.participantIds ?? [])]),
    );

    return this.toConversation(conversation);
  }

  /**
   * Сохраняет новое сообщение и возвращает server-side представление.
   *
   * Метод сначала проверяет, что отправитель является участником conversation,
   * затем пишет сообщение в Postgres и только после этого вызывающая сторона
   * может рассылать его через Socket.IO. Благодаря этому все клиенты получают
   * один и тот же `id`, `createdAt` и список вложений из источника истины.
   */
  async sendMessage(payload: ChatSendMessagePayload) {
    const conversationId = this.requireUuid(payload.conversationId, 'conversationId');
    const senderId = this.requireUuid(payload.senderId, 'senderId');
    const attachments = payload.attachments ?? [];
    const text = payload.text?.trim();

    if (!text && attachments.length === 0) {
      throw new Error('Message text or attachment is required.');
    }

    await this.ensureParticipant(conversationId, senderId);

    // Байты медиа здесь не хранятся. Attachments - это только метаданные,
    // которые будущий media-service сможет связать через uploadId/mediaId.
    const [message] = await this.database
      .insert(chatMessages)
      .values({
        id: randomUUID(),
        conversationId,
        senderId,
        text: text || null,
      })
      .returning();

    if (!message) {
      throw new Error('Failed to create message.');
    }

    const savedAttachments = await this.insertAttachments(message.id, attachments);
    await this.touchConversation(conversationId);

    return this.toMessage(message, savedAttachments);
  }

  /**
   * Редактирует существующее сообщение.
   *
   * Редактировать может только отправитель (`editorId === senderId`). Если в
   * payload есть поле `attachments`, текущий список вложений заменяется целиком.
   * Если поля `attachments` нет, старые вложения сохраняются без изменений.
   */
  async editMessage(payload: ChatEditMessagePayload) {
    const messageId = this.requireUuid(payload.messageId, 'messageId');
    const editorId = this.requireUuid(payload.editorId, 'editorId');
    const attachments = payload.attachments ?? [];
    const text = payload.text?.trim();

    if (!text && attachments.length === 0) {
      throw new Error('Message text or attachment is required.');
    }

    const existing = await this.database.query.chatMessages.findFirst({
      where: eq(chatMessages.id, messageId),
    });

    if (!existing) {
      throw new Error('Message not found.');
    }

    if (existing.senderId !== editorId) {
      throw new Error('Only sender can edit message.');
    }

    const [message] = await this.database
      .update(chatMessages)
      .set({ text: text || null, editedAt: new Date() })
      .where(eq(chatMessages.id, messageId))
      .returning();

    if (!message) {
      throw new Error('Failed to edit message.');
    }

    if (payload.attachments) {
      // При редактировании attachments заменяются целиком. Это упрощает
      // клиентский протокол до появления patch-семантики в media-service.
      await this.database
        .delete(chatMediaAttachments)
        .where(eq(chatMediaAttachments.messageId, messageId));
      await this.insertAttachments(messageId, attachments);
    }

    const savedAttachments = await this.getAttachmentsByMessageIds([messageId]);
    await this.touchConversation(message.conversationId);

    return this.toMessage(message, savedAttachments.get(messageId) ?? []);
  }

  /**
   * Возвращает страницу истории сообщений в хронологическом порядке.
   *
   * Пагинация работает назад от `beforeMessageId`: сначала из БД берутся более
   * старые сообщения в порядке "новые -> старые", затем массив разворачивается,
   * чтобы клиент получил привычный порядок "старые -> новые". Soft-deleted
   * сообщения (`deletedAt != null`) в историю не попадают.
   */
  async listMessages(payload: ChatListMessagesPayload) {
    const conversationId = this.requireGrpcUuid(payload.conversationId, 'conversationId');
    const userId = this.requireGrpcUuid(payload.userId, 'userId');
    const requestedLimit = payload.limit && payload.limit > 0 ? payload.limit : 50;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    await this.ensureParticipant(conversationId, userId);

    const beforeMessage = payload.beforeMessageId
      ? await this.database.query.chatMessages.findFirst({
          where: eq(
            chatMessages.id,
            this.requireGrpcUuid(payload.beforeMessageId, 'beforeMessageId'),
          ),
        })
      : undefined;

    const rows = await this.database
      .select()
      .from(chatMessages)
      .where(
        beforeMessage
          ? and(
              eq(chatMessages.conversationId, conversationId),
              lt(chatMessages.createdAt, beforeMessage.createdAt),
              isNull(chatMessages.deletedAt),
            )
          : and(eq(chatMessages.conversationId, conversationId), isNull(chatMessages.deletedAt)),
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    // Из БД читаем новые сообщения первыми для эффективной пагинации назад,
    // а клиенту возвращаем в хронологическом порядке.
    const orderedRows = rows.reverse();
    const attachments = await this.getAttachmentsByMessageIds(
      orderedRows.map((message) => message.id),
    );

    return orderedRows.map((message) => this.toMessage(message, attachments.get(message.id) ?? []));
  }

  /**
   * Помечает сообщения удаленными без физического удаления строк.
   *
   * Сейчас нет ролей модераторов, поэтому пользователь может удалить только свои
   * сообщения. Чужие `messageIds` не приводят к ошибке, а просто не попадают в
   * `deletedMessageIds`. Такой soft-delete сохраняет историю аудита и связи с
   * вложениями, но скрывает сообщения из `listMessages`.
   */
  async deleteMessages(payload: ChatDeleteMessagesPayload): Promise<ChatDeleteMessagesResponse> {
    const userId = this.requireGrpcUuid(payload.userId, 'userId');
    const messageIds = this.uniqueGrpcMessageIds(payload.messageIds);

    if (messageIds.length === 0) {
      return { deletedMessageIds: [] };
    }

    const messages = await this.database
      .select()
      .from(chatMessages)
      .where(and(inArray(chatMessages.id, messageIds), isNull(chatMessages.deletedAt)));

    if (messages.length === 0) {
      return { deletedMessageIds: [] };
    }

    const conversationIds = Array.from(new Set(messages.map((message) => message.conversationId)));

    for (const conversationId of conversationIds) {
      await this.ensureParticipant(conversationId, userId);
    }

    const now = new Date();

    // Пока нет ролей модераторов в чате, пользователь может удалять только
    // собственные сообщения. Очистка всей истории вынесена в отдельный метод.
    const ownMessageIds = messages
      .filter((message) => message.senderId === userId)
      .map((message) => message.id);

    if (ownMessageIds.length === 0) {
      return { deletedMessageIds: [] };
    }

    const deletedMessages = await this.database
      .update(chatMessages)
      .set({ deletedAt: now })
      .where(inArray(chatMessages.id, ownMessageIds))
      .returning({ id: chatMessages.id, conversationId: chatMessages.conversationId });

    for (const conversationId of new Set(
      deletedMessages.map((message) => message.conversationId),
    )) {
      await this.touchConversation(conversationId);
    }

    return { deletedMessageIds: deletedMessages.map((message) => message.id) };
  }

  /**
   * Очищает историю conversation для всех участников.
   *
   * Это не персональная очистка "только для меня": метод выставляет `deletedAt`
   * всем сообщениям conversation. Если понадобится user-specific очистка,
   * нужна отдельная таблица видимости сообщений по пользователю.
   */
  async clearHistory(payload: ChatClearHistoryPayload): Promise<ChatClearHistoryResponse> {
    const conversationId = this.requireGrpcUuid(payload.conversationId, 'conversationId');
    const userId = this.requireGrpcUuid(payload.userId, 'userId');

    await this.ensureParticipant(conversationId, userId);

    // Сейчас очистка истории действует на весь conversation. Если понадобится
    // "очистить только для себя", нужна отдельная таблица per-user visibility.
    const deletedMessages = await this.database
      .update(chatMessages)
      .set({ deletedAt: new Date() })
      .where(and(eq(chatMessages.conversationId, conversationId), isNull(chatMessages.deletedAt)))
      .returning({ id: chatMessages.id });

    await this.touchConversation(conversationId);

    return {
      conversationId,
      deletedCount: deletedMessages.length,
    };
  }

  /**
   * Возвращает участников conversation.
   *
   * Gateway использует этот метод перед `chat:join`, чтобы socket не мог
   * подписаться на realtime-события чужого чата.
   */
  async getParticipantIds(conversationId: string) {
    const rows = await this.database
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(eq(chatParticipants.conversationId, conversationId));

    return rows.map((row) => row.userId);
  }

  /**
   * Добавляет участников без ошибки на уже существующих парах
   * `(conversationId, userId)`.
   *
   * Используется в create/sync методах. `onConflictDoNothing()` нужен для
   * повторных sync-запросов и для случаев, когда создатель уже есть в списке
   * участников.
   */
  private async addParticipants(conversationId: string, userIds: string[]) {
    // onConflictDoNothing позволяет безопасно вызывать sync несколько раз:
    // существующие участники не создадут ошибку уникального индекса.
    const values = this.uniqueIds(userIds).map((userId) => ({
      conversationId,
      userId,
    }));

    if (values.length === 0) {
      return;
    }

    await this.database.insert(chatParticipants).values(values).onConflictDoNothing();
  }

  /**
   * Единая проверка доступа к conversation.
   *
   * Пока Socket.IO payload сам приносит `userId`, поэтому все операции чтения и
   * изменения сообщений обязаны дополнительно сверяться с `chat_participants`.
   */
  private async ensureParticipant(conversationId: string, userId: string) {
    // Все операции с сообщениями проходят через проверку участника. Позже эту
    // проверку можно заменить на auth context из gateway/session.
    const participant = await this.database.query.chatParticipants.findFirst({
      where: and(
        eq(chatParticipants.conversationId, conversationId),
        eq(chatParticipants.userId, userId),
      ),
    });

    if (!participant) {
      throw this.createRpcException(status.PERMISSION_DENIED, 'User is not a chat participant.');
    }
  }

  /**
   * Сохраняет metadata вложений для сообщения.
   *
   * Сервис не принимает и не хранит байты файлов. Здесь фиксируются только
   * идентификаторы upload/media и свойства файла, чтобы будущий media-service
   * мог связать их с реальным объектом хранения.
   */
  private async insertAttachments(messageId: string, attachments: ChatMediaAttachmentDraft[]) {
    if (attachments.length === 0) {
      return [];
    }

    const rows = await this.database
      .insert(chatMediaAttachments)
      .values(
        attachments.map((attachment) => ({
          id: randomUUID(),
          messageId,
          mediaId: attachment.mediaId,
          uploadId: attachment.uploadId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          status: attachment.status ?? 'pending',
          metadata: attachment.metadata,
        })),
      )
      .returning();

    return rows;
  }

  /**
   * Загружает вложения пачкой и группирует их по messageId.
   *
   * Это защищает `listMessages` от N+1 запросов: история сообщений делает один
   * запрос за сообщениями и один запрос за всеми их вложениями.
   */
  private async getAttachmentsByMessageIds(messageIds: string[]) {
    // Загружаем вложения пачкой, чтобы список сообщений не делал отдельный
    // запрос для каждого message.
    const result = new Map<string, ChatMediaAttachmentRecord[]>();

    if (messageIds.length === 0) {
      return result;
    }

    const rows = await this.database
      .select()
      .from(chatMediaAttachments)
      .where(inArray(chatMediaAttachments.messageId, messageIds))
      .orderBy(asc(chatMediaAttachments.createdAt));

    for (const row of rows) {
      const existing = result.get(row.messageId) ?? [];
      existing.push(row);
      result.set(row.messageId, existing);
    }

    return result;
  }

  /**
   * Обновляет `updatedAt` conversation после изменения сообщений.
   *
   * По этому полю можно сортировать список чатов по последней активности без
   * отдельного запроса к `chat_messages`.
   */
  private async touchConversation(conversationId: string) {
    await this.database
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, conversationId));
  }

  /**
   * Преобразует Drizzle row conversation в публичный контракт.
   *
   * В API не отдаём nullable-поля как `null`: опциональные значения становятся
   * `undefined`, а даты приводятся к ISO-строкам.
   */
  private toConversation(conversation: ChatConversationRecord): ChatConversation {
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title ?? undefined,
      roomId: conversation.roomId ?? undefined,
      createdBy: conversation.createdBy,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  /**
   * Преобразует Drizzle row message и уже загруженные вложения в ChatMessage.
   */
  private toMessage(
    message: ChatMessageRecord,
    attachments: ChatMediaAttachmentRecord[],
  ): ChatMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      text: message.text ?? undefined,
      editedAt: message.editedAt?.toISOString(),
      deletedAt: message.deletedAt?.toISOString(),
      createdAt: message.createdAt.toISOString(),
      attachments: attachments.map((attachment) => this.toAttachment(attachment)),
    };
  }

  /**
   * Преобразует Drizzle row attachment в контрактный объект вложения.
   */
  private toAttachment(attachment: ChatMediaAttachmentRecord): ChatMediaAttachment {
    return {
      id: attachment.id,
      messageId: attachment.messageId,
      mediaId: attachment.mediaId ?? undefined,
      uploadId: attachment.uploadId ?? undefined,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      status: attachment.status,
      metadata: attachment.metadata ?? undefined,
      createdAt: attachment.createdAt.toISOString(),
    };
  }

  /**
   * Валидирует список user id и удаляет дубли с сохранением первого появления.
   */
  private uniqueIds(ids: string[]) {
    return Array.from(new Set(ids.map((id) => this.requireUuid(id, 'userId'))));
  }

  /**
   * Валидирует список message id и удаляет дубли с сохранением первого появления.
   */
  private uniqueMessageIds(ids: string[]) {
    return Array.from(new Set(ids.map((id) => this.requireUuid(id, 'messageId'))));
  }

  private uniqueGrpcMessageIds(ids: string[] | undefined) {
    if (!ids || ids.length === 0) {
      return [];
    }

    return Array.from(new Set(ids.map((id) => this.requireGrpcUuid(id, 'messageId'))));
  }

  /**
   * Общая UUID-валидация для payload-полей.
   *
   * Ошибки из этого метода уходят наружу как обычные `Error`: Gateway
   * превращает их в `chat:error`, а gRPC controller возвращает ошибку вызова.
   */
  private requireUuid(value: string | undefined, fieldName: string) {
    if (
      !value ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) {
      throw new Error(`${fieldName} must be a valid uuid.`);
    }

    return value;
  }

  private requireGrpcUuid(value: string | undefined, fieldName: string) {
    if (
      !value ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) {
      throw this.createRpcException(status.INVALID_ARGUMENT, `${fieldName} must be a valid uuid.`);
    }

    return value;
  }

  private createRpcException(code: status, details: string) {
    // gRPC клиенты ожидают canonical status code + details. Plain string в
    // RpcException теряет машинно-читаемый код ошибки.
    return new RpcException({ code, details });
  }
}
