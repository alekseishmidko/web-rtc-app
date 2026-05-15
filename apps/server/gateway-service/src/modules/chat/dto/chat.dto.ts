import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ChatClearHistoryPayload,
  ChatClearHistoryResponse,
  ChatDeleteMessagesPayload,
  ChatDeleteMessagesResponse,
  ChatMediaAttachment,
  ChatMediaStatus,
  ChatMessage,
} from '@web-rtc-nest/contracts';

export class ChatMediaAttachmentDto implements ChatMediaAttachment {
  @ApiProperty({ example: '5f6f82f5-56d9-4c2b-9c69-6cb57176f29e' })
  id: string;

  @ApiProperty({ example: 'a95bb795-1a3c-4d73-98dd-534c94f3aa33' })
  messageId: string;

  @ApiPropertyOptional({
    description: 'Permanent media id after a future media-service accepts the upload.',
    example: 'media_01HR8R9WN7A4W2',
  })
  mediaId?: string;

  @ApiPropertyOptional({
    description: 'Temporary upload id known by the client before media-service finalizes the file.',
    example: 'local-upload-42',
  })
  uploadId?: string;

  @ApiProperty({ example: 'photo.jpg' })
  fileName: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 184928 })
  sizeBytes: number;

  @ApiProperty({ enum: ['pending', 'uploaded', 'failed'], example: 'pending' })
  status: ChatMediaStatus;

  @ApiPropertyOptional({
    description: 'Loose metadata stored as JSON until media-service owns validation.',
    example: { width: 1280, height: 720 },
  })
  metadata?: Record<string, unknown>;

  @ApiProperty({ example: '2026-05-10T10:00:00.000Z' })
  createdAt: string;
}

export class ChatMessageDto implements ChatMessage {
  @ApiProperty({ example: 'a95bb795-1a3c-4d73-98dd-534c94f3aa33' })
  id: string;

  @ApiProperty({ example: 'b7a9c906-16e3-4c2f-91e3-d6823f5c24ac' })
  conversationId: string;

  @ApiProperty({ example: '2a2d0f7f-c1df-4b8b-a6cc-80101895b405' })
  senderId: string;

  @ApiPropertyOptional({ example: 'Hello from gateway REST facade' })
  text?: string;

  @ApiPropertyOptional({ example: '2026-05-10T10:05:00.000Z' })
  editedAt?: string;

  @ApiPropertyOptional({
    description: 'Present only for soft-deleted messages. List endpoint filters them out.',
    example: '2026-05-10T10:06:00.000Z',
  })
  deletedAt?: string;

  @ApiProperty({ example: '2026-05-10T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ type: [ChatMediaAttachmentDto] })
  attachments: ChatMediaAttachmentDto[];
}

export class ChatListMessagesResponseDto {
  @ApiProperty({
    description:
      'Messages are returned in chronological order. Soft-deleted messages are not included.',
    type: [ChatMessageDto],
  })
  messages: ChatMessageDto[];
}

export class DeleteMessagesRequestDto implements ChatDeleteMessagesPayload {
  @ApiProperty({
    description: 'User requesting deletion. Chat-service deletes only this user messages.',
    example: '2a2d0f7f-c1df-4b8b-a6cc-80101895b405',
  })
  userId: string;

  @ApiProperty({
    description: 'One or more message ids. Passing one id deletes a single message.',
    example: ['a95bb795-1a3c-4d73-98dd-534c94f3aa33'],
    type: [String],
  })
  messageIds: string[];
}

export class DeleteMessagesResponseDto implements ChatDeleteMessagesResponse {
  @ApiProperty({
    description:
      'Ids actually soft-deleted by chat-service. Messages owned by other users or already-deleted messages are not included.',
    example: ['a95bb795-1a3c-4d73-98dd-534c94f3aa33'],
    type: [String],
  })
  deletedMessageIds: string[];
}

export class ClearHistoryRequestDto implements Omit<ChatClearHistoryPayload, 'conversationId'> {
  @ApiProperty({
    description: 'User requesting history cleanup. Must be a participant of the conversation.',
    example: '2a2d0f7f-c1df-4b8b-a6cc-80101895b405',
  })
  userId: string;
}

export class ClearHistoryResponseDto implements ChatClearHistoryResponse {
  @ApiProperty({ example: 'b7a9c906-16e3-4c2f-91e3-d6823f5c24ac' })
  conversationId: string;

  @ApiProperty({
    description: 'Number of messages marked as deleted in the conversation.',
    example: 12,
  })
  deletedCount: number;
}
