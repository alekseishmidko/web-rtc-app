import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  ChatClearHistoryPayload,
  ChatClearHistoryResponse,
  ChatDeleteMessagesPayload,
  ChatDeleteMessagesResponse,
  ChatListMessagesPayload,
  ChatMessage,
} from '@web-rtc-nest/contracts';

import { ChatService } from './chat.service';

type ListMessagesResponse = {
  messages: GrpcChatMessage[];
};

type GrpcChatMessage = Omit<ChatMessage, 'attachments'> & {
  attachments: GrpcChatMediaAttachment[];
};

type GrpcChatMediaAttachment = Omit<ChatMessage['attachments'][number], 'metadata'> & {
  metadataJson?: string;
};

@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @GrpcMethod('ChatService', 'ListMessages')
  async listMessages(request: ChatListMessagesPayload): Promise<ListMessagesResponse> {
    // gRPC используется для запросов истории и команд управления сообщениями.
    // Realtime-доставка новых сообщений остается в ChatGateway через Socket.IO.
    const messages = await this.chatService.listMessages(request);

    return {
      messages: messages.map((message) => this.toGrpcMessage(message)),
    };
  }

  @GrpcMethod('ChatService', 'DeleteMessages')
  deleteMessages(request: ChatDeleteMessagesPayload): Promise<ChatDeleteMessagesResponse> {
    // Один message удаляется тем же методом: клиент передает массив из одного id.
    return this.chatService.deleteMessages(request);
  }

  @GrpcMethod('ChatService', 'ClearHistory')
  clearHistory(request: ChatClearHistoryPayload): Promise<ChatClearHistoryResponse> {
    return this.chatService.clearHistory(request);
  }

  private toGrpcMessage(message: ChatMessage): GrpcChatMessage {
    return {
      ...message,
      attachments: message.attachments.map((attachment) => ({
        ...attachment,
        metadataJson: attachment.metadata ? JSON.stringify(attachment.metadata) : undefined,
      })),
    };
  }
}
