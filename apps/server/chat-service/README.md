# Chat Service

NestJS-сервис для пользовательских чатов. Сервис хранит историю в Postgres через
Drizzle ORM и отдает online-события через Socket.IO.

## Возможности

- direct chat: чат 1-1 между двумя пользователями;
- group chat: групповой чат с несколькими участниками;
- room chat: чат, привязанный к комнате видеозвонка через `roomId`;
- отправка текстовых сообщений;
- редактирование сообщений отправителем;
- история сообщений с пагинацией назад;
- placeholder-интерфейс для медиа-вложений до появления отдельного media-service.

Чат сделан через серверный WebSocket, а не через WebRTC DataChannel. Для
сообщений нужен серверный источник истины: хранение, редактирование, история,
групповые чаты и повторная синхронизация после reconnect. WebRTC остается для
видеозвонка, а связь чата с видеокомнатой задается полем `roomId`.

## Запуск

Из корня монорепозитория:

```bash
pnpm dev:chat
```

Сборка:

```bash
pnpm build:chat
```

Запуск собранного сервиса:

```bash
pnpm start:chat
```

По умолчанию сервис слушает HTTP/Socket.IO на `127.0.0.1:5022`, а gRPC на
`127.0.0.1:50054`.

## Переменные окружения

Локальный пример находится в `.env`:

```env
HOST=127.0.0.1
PORT=5022
GRPC_URL=127.0.0.1:50054
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5438
DATABASE_USERNAME=web_rtc
DATABASE_PASSWORD=web_rtc
DATABASE_NAME=web_rtc
DATABASE_SSL=false
```

В Docker Compose сервис подключается к Postgres по внутреннему host `postgres`
и порту `5432`.

## База данных

Схема описана в `src/database/chat.schema.ts`.

Основные таблицы:

- `chat_conversations` - чат как сущность: `direct`, `group` или `room`;
- `chat_participants` - участники чата;
- `chat_messages` - сообщения, включая `edited_at` и `deleted_at`;
- `chat_media_attachments` - метаданные будущих медиа-вложений.

На старте сервис создает минимальную схему через `CREATE TABLE IF NOT EXISTS`.
Для production это нужно заменить на управляемые миграции Drizzle.

## Socket.IO События

Все события используют JSON payload. Ошибки возвращаются событием:

```ts
chat:error -> { message: string }
```

### Подключение К Чату

```ts
client.emit('chat:join', {
  conversationId: 'uuid',
  userId: 'uuid',
});
```

Ответ:

```ts
chat:joined -> { conversationId: string }
```

Покинуть чат:

```ts
client.emit('chat:leave', {
  conversationId: 'uuid',
});
```

Ответ:

```ts
chat:left -> { conversationId: string }
```

### Создать Direct Chat

```ts
client.emit('chat:direct:create', {
  initiatorId: 'uuid',
  participantId: 'uuid',
});
```

Ответ:

```ts
chat:conversation -> ChatConversation
```

Для пары пользователей создается стабильный `directKey`, поэтому повторный вызов
вернет уже существующий direct chat.

### Создать Group Chat

```ts
client.emit('chat:group:create', {
  creatorId: 'uuid',
  participantIds: ['uuid', 'uuid'],
  title: 'Team chat',
});
```

Ответ:

```ts
chat:conversation -> ChatConversation
```

### Синхронизировать Чат С WebRTC-Комнатой

```ts
client.emit('chat:room:sync', {
  roomId: 'video-room-id',
  userId: 'uuid',
  participantIds: ['uuid'],
  title: 'Daily call',
});
```

Ответ:

```ts
chat:conversation -> ChatConversation
```

`roomId` уникален: одна видеокомната соответствует одному room chat. Это место
для будущей интеграции с сервисом комнат или signaling-service.

### Отправить Сообщение

```ts
client.emit('chat:message:send', {
  conversationId: 'uuid',
  senderId: 'uuid',
  text: 'Hello',
});
```

Ответ отправителю:

```ts
chat:message:sent -> ChatMessage
```

Broadcast всем socket-клиентам, которые сделали `chat:join`:

```ts
chat:message -> ChatMessage
```

### Отправить Сообщение С Media Placeholder

Файл пока не загружается в этот сервис. Клиент может передать только описание
будущего upload/media объекта:

```ts
client.emit('chat:message:send', {
  conversationId: 'uuid',
  senderId: 'uuid',
  text: 'See attachment',
  attachments: [
    {
      uploadId: 'local-upload-id',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 184928,
      status: 'pending',
      metadata: {
        width: 1280,
        height: 720,
      },
    },
  ],
});
```

После появления media-service поля `mediaId` и `status` можно будет обновлять
через отдельный flow.

### Редактировать Сообщение

```ts
client.emit('chat:message:edit', {
  messageId: 'uuid',
  editorId: 'uuid',
  text: 'Updated text',
});
```

Редактировать может только отправитель сообщения.

Broadcast:

```ts
chat:message:edited -> ChatMessage
```

Если в payload передать `attachments`, текущий список вложений сообщения будет
заменен на новый.

## gRPC API

gRPC controller находится в `src/chat/chat.controller.ts`. Он предназначен для
операций, где нужен надежный server-to-server контракт: загрузка истории,
удаление сообщений и очистка истории.

Proto-файл: `packages/contracts/proto/chat.proto`.

### ListMessages

```ts
{
  conversationId: 'uuid',
  userId: 'uuid',
  limit: 50,
  beforeMessageId: 'uuid',
}
```

Поля:

- `userId` - обязательный id участника чата;
- `limit` - необязательный лимит, диапазон `1..100`;
- `beforeMessageId` - необязательный cursor для загрузки более старых сообщений.

Ответ:

```ts
{
  messages: ChatMessage[];
}
```

### DeleteMessages

Один message удаляется тем же методом: передайте массив из одного id.

```ts
{
  userId: 'uuid',
  messageIds: ['uuid', 'uuid'],
}
```

Ответ:

```ts
{
  deletedMessageIds: string[];
}
```

Пока нет ролей модераторов, пользователь может удалить только свои сообщения.

### ClearHistory

```ts
{
  conversationId: 'uuid',
  userId: 'uuid',
}
```

Ответ:

```ts
{
  conversationId: string;
  deletedCount: number;
}
```

Текущая очистка действует на весь conversation и помечает сообщения удаленными
через `deletedAt`. Персональная очистка "только для себя" потребует отдельной
таблицы видимости сообщений по пользователю.

## Gateway REST Facade

Внешние HTTP-клиенты могут работать с этими gRPC методами через
`gateway-service`. Gateway не содержит chat business logic, он только валидирует
форму HTTP-запроса и проксирует его в `chat-service` по gRPC.

```http
GET /chat/conversations/:conversationId/messages?userId=:userId&limit=50&beforeMessageId=:messageId
```

Вызывает `ChatService.ListMessages`.

```http
DELETE /chat/messages/:messageId
Content-Type: application/json

{
  "userId": "uuid"
}
```

Вызывает `ChatService.DeleteMessages` с одним `messageId`.

```http
DELETE /chat/messages
Content-Type: application/json

{
  "userId": "uuid",
  "messageIds": ["uuid", "uuid"]
}
```

Вызывает `ChatService.DeleteMessages` для нескольких сообщений.

```http
DELETE /chat/conversations/:conversationId/messages
Content-Type: application/json

{
  "userId": "uuid"
}
```

Вызывает `ChatService.ClearHistory`.

## Контрактные Типы

Общие типы экспортируются из `@web-rtc-nest/contracts`:

```ts
import type {
  ChatConversation,
  ChatMessage,
  ChatSendMessagePayload,
} from '@web-rtc-nest/contracts';
```

Источник типов: `packages/contracts/src/types/chat.types.ts`.

## Ограничения Текущей Версии

- авторизация в Socket.IO пока не подключена, `userId` приходит в payload;
- нет реальной загрузки файлов, только метаданные вложений;
- bootstrap схемы находится в коде сервиса, миграции Drizzle еще не добавлены;
- горизонтальное масштабирование Socket.IO потребует adapter, например Redis adapter.
