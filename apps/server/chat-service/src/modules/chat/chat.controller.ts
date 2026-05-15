import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  ChatClearHistoryPayload,
  ChatClearHistoryResponse,
  ChatConversation,
  ChatDeleteMessagesPayload,
  ChatDeleteMessagesResponse,
  ChatDirectCreatePayload,
  ChatEditMessagePayload,
  ChatGroupCreatePayload,
  ChatListMessagesPayload,
  ChatMediaAttachmentDraft,
  ChatMessage,
  ChatRoomSyncPayload,
  ChatSendMessagePayload,
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

type GrpcChatMediaAttachmentDraft = Omit<ChatMediaAttachmentDraft, 'metadata'> & {
  metadataJson?: string;
};

type GrpcChatSendMessagePayload = Omit<ChatSendMessagePayload, 'attachments'> & {
  attachments?: GrpcChatMediaAttachmentDraft[];
};

type GrpcChatEditMessagePayload = Omit<ChatEditMessagePayload, 'attachments'> & {
  attachments?: GrpcChatMediaAttachmentDraft[];
  attachmentsProvided?: boolean;
};

type GetParticipantIdsRequest = {
  conversationId: string;
};

type GetParticipantIdsResponse = {
  participantIds: string[];
};

@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @GrpcMethod('ChatService', 'CreateDirectChat')
  createDirectChat(request: ChatDirectCreatePayload): Promise<ChatConversation> {
    return this.chatService.createDirectChat(request);
  }

  @GrpcMethod('ChatService', 'CreateGroupChat')
  createGroupChat(request: ChatGroupCreatePayload): Promise<ChatConversation> {
    return this.chatService.createGroupChat(request);
  }

  @GrpcMethod('ChatService', 'SyncRoomChat')
  syncRoomChat(request: ChatRoomSyncPayload): Promise<ChatConversation> {
    return this.chatService.syncRoomChat(request);
  }

  @GrpcMethod('ChatService', 'SendMessage')
  async sendMessage(request: GrpcChatSendMessagePayload): Promise<GrpcChatMessage> {
    const message = await this.chatService.sendMessage({
      ...request,
      attachments: this.toAttachmentDrafts(request.attachments),
    });

    return this.toGrpcMessage(message);
  }

  @GrpcMethod('ChatService', 'EditMessage')
  async editMessage(request: GrpcChatEditMessagePayload): Promise<GrpcChatMessage> {
    const payload: ChatEditMessagePayload = {
      messageId: request.messageId,
      editorId: request.editorId,
      text: request.text,
    };

    if (request.attachmentsProvided) {
      payload.attachments = this.toAttachmentDrafts(request.attachments);
    }

    const message = await this.chatService.editMessage(payload);

    return this.toGrpcMessage(message);
  }

  @GrpcMethod('ChatService', 'ListMessages')
  async listMessages(request: ChatListMessagesPayload): Promise<ListMessagesResponse> {
    // gRPC используется для запросов истории и команд управления сообщениями.
    // Realtime-доставка новых сообщений остается в gateway-service через Socket.IO.
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

  @GrpcMethod('ChatService', 'GetParticipantIds')
  async getParticipantIds(request: GetParticipantIdsRequest): Promise<GetParticipantIdsResponse> {
    return {
      participantIds: await this.chatService.getParticipantIds(request.conversationId),
    };
  }

  private toAttachmentDrafts(
    attachments: GrpcChatMediaAttachmentDraft[] | undefined,
  ): ChatMediaAttachmentDraft[] {
    return (attachments ?? []).map((attachment) => ({
      ...attachment,
      status: attachment.status || undefined,
      metadata: attachment.metadataJson ? JSON.parse(attachment.metadataJson) : undefined,
    }));
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
