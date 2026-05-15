import type { OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  ChatDirectCreatePayload,
  ChatEditMessagePayload,
  ChatGrpcService,
  ChatGroupCreatePayload,
  ChatJoinPayload,
  ChatMediaAttachmentDraft,
  ChatRoomSyncPayload,
  ChatSendMessagePayload,
} from '@web-rtc-nest/contracts';
import { firstValueFrom } from 'rxjs';
import type { Server, Socket } from 'socket.io';
import { CHAT_GRPC_CLIENT } from '../../grpc/grpc-clients.module';

type GrpcChatMediaAttachmentDraft = Omit<ChatMediaAttachmentDraft, 'metadata'> & {
  metadataJson?: string;
};

type GrpcChatSendMessagePayload = Omit<ChatSendMessagePayload, 'attachments'> & {
  attachments?: GrpcChatMediaAttachmentDraft[];
};

type GrpcChatEditMessagePayload = Omit<ChatEditMessagePayload, 'attachments'> & {
  attachments?: GrpcChatMediaAttachmentDraft[];
  attachmentsProvided: boolean;
};

type GrpcError = {
  details?: string;
  message?: string;
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnModuleInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private chatService!: ChatGrpcService;
  private readonly roomsBySocket = new Map<string, Set<string>>();

  constructor(@Inject(CHAT_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.chatService = this.client.getService<ChatGrpcService>('ChatService');
  }

  handleConnection(socket: Socket) {
    // Клиент получает socket id только как технический идентификатор соединения.
    // Пользовательская идентичность пока приходит в payload каждого события.
    socket.emit('chat:connected', { socketId: socket.id });
  }

  async handleDisconnect(socket: Socket) {
    const rooms = this.roomsBySocket.get(socket.id);

    if (!rooms) {
      return;
    }

    for (const room of rooms) {
      await socket.leave(room);
    }

    this.roomsBySocket.delete(socket.id);
  }

  @SubscribeMessage('chat:join')
  async joinChat(@ConnectedSocket() socket: Socket, @MessageBody() payload: ChatJoinPayload) {
    try {
      // Gateway держит публичный Socket.IO transport, а chat-service остается
      // внутренним источником истины для участников, сообщений и истории.
      const { participantIds } = await firstValueFrom(
        this.chatService.getParticipantIds({ conversationId: payload.conversationId }),
      );

      if (!participantIds.includes(payload.userId)) {
        socket.emit('chat:error', { message: 'User is not a chat participant.' });
        return;
      }

      // Socket.IO room здесь используется как online-канал доставки сообщений.
      // При нескольких replica нужен Redis adapter, иначе комнаты будут жить
      // только внутри одного gateway процесса.
      const room = this.getSocketRoom(payload.conversationId);
      await socket.join(room);
      this.trackSocketRoom(socket.id, room);
      socket.emit('chat:joined', { conversationId: payload.conversationId });
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('chat:leave')
  async leaveChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: Pick<ChatJoinPayload, 'conversationId'>,
  ) {
    const room = this.getSocketRoom(payload.conversationId);
    await socket.leave(room);
    this.roomsBySocket.get(socket.id)?.delete(room);
    socket.emit('chat:left', { conversationId: payload.conversationId });
  }

  @SubscribeMessage('chat:direct:create')
  async createDirectChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ChatDirectCreatePayload,
  ) {
    try {
      const conversation = await firstValueFrom(this.chatService.createDirectChat(payload));
      socket.emit('chat:conversation', conversation);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('chat:group:create')
  async createGroupChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ChatGroupCreatePayload,
  ) {
    try {
      const conversation = await firstValueFrom(this.chatService.createGroupChat(payload));
      socket.emit('chat:conversation', conversation);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('chat:room:sync')
  async syncRoomChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ChatRoomSyncPayload,
  ) {
    try {
      const conversation = await firstValueFrom(this.chatService.syncRoomChat(payload));
      socket.emit('chat:conversation', conversation);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('chat:message:send')
  async sendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ChatSendMessagePayload,
  ) {
    try {
      const message = await firstValueFrom(
        this.chatService.sendMessage(this.toGrpcSendMessagePayload(payload)),
      );

      this.server.to(this.getSocketRoom(message.conversationId)).emit('chat:message', message);
      socket.emit('chat:message:sent', message);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('chat:message:edit')
  async editMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ChatEditMessagePayload,
  ) {
    try {
      const message = await firstValueFrom(
        this.chatService.editMessage(this.toGrpcEditMessagePayload(payload)),
      );

      this.server
        .to(this.getSocketRoom(message.conversationId))
        .emit('chat:message:edited', message);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  private toGrpcSendMessagePayload(payload: ChatSendMessagePayload): GrpcChatSendMessagePayload {
    return {
      ...payload,
      attachments: this.toGrpcAttachmentDrafts(payload.attachments),
    };
  }

  private toGrpcEditMessagePayload(payload: ChatEditMessagePayload): GrpcChatEditMessagePayload {
    return {
      ...payload,
      attachments: this.toGrpcAttachmentDrafts(payload.attachments),
      attachmentsProvided: payload.attachments !== undefined,
    };
  }

  private toGrpcAttachmentDrafts(
    attachments: ChatMediaAttachmentDraft[] | undefined,
  ): GrpcChatMediaAttachmentDraft[] | undefined {
    return attachments?.map(({ metadata, ...attachment }) => ({
      ...attachment,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
    }));
  }

  private getSocketRoom(conversationId: string) {
    // Префикс отделяет chat-комнаты от комнат WebRTC signaling и других каналов.
    return `chat:${conversationId}`;
  }

  private trackSocketRoom(socketId: string, room: string) {
    const rooms = this.roomsBySocket.get(socketId) ?? new Set<string>();
    rooms.add(room);
    this.roomsBySocket.set(socketId, rooms);
  }

  private emitError(socket: Socket, error: unknown) {
    const grpcError = this.toGrpcError(error);

    socket.emit('chat:error', {
      message: grpcError?.details ?? grpcError?.message ?? 'Unexpected chat error.',
    });
  }

  private toGrpcError(error: unknown): GrpcError | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    return error as GrpcError;
  }
}
