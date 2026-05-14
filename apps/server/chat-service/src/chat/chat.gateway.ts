import type {
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type {
  ChatDirectCreatePayload,
  ChatEditMessagePayload,
  ChatGroupCreatePayload,
  ChatJoinPayload,
  ChatRoomSyncPayload,
  ChatSendMessagePayload,
} from '@web-rtc-nest/contracts';

import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly roomsBySocket = new Map<string, Set<string>>();

  constructor(private readonly chatService: ChatService) {}

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
  async joinChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ChatJoinPayload,
  ) {
    try {
      // Перед подпиской на online-события проверяем, что пользователь уже
      // записан участником разговора в БД.
      const participantIds = await this.chatService.getParticipantIds(payload.conversationId);

      if (!participantIds.includes(payload.userId)) {
        socket.emit('chat:error', { message: 'User is not a chat participant.' });
        return;
      }

      // Socket.IO room здесь используется как online-канал доставки сообщений.
      // При нескольких replica нужен Redis adapter, иначе комнаты будут жить
      // только внутри одного процесса.
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
      const conversation = await this.chatService.createDirectChat(payload);
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
      const conversation = await this.chatService.createGroupChat(payload);
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
      // Это точка связи с WebRTC-комнатой: signaling/video-service может
      // передать roomId, а chat-service создаст или вернет связанный чат.
      const conversation = await this.chatService.syncRoomChat(payload);
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
      const message = await this.chatService.sendMessage(payload);
      // Источник истины - Postgres. В WebSocket отправляем уже сохраненное
      // сообщение, чтобы все клиенты получили один и тот же id/timestamps.
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
      const message = await this.chatService.editMessage(payload);
      this.server
        .to(this.getSocketRoom(message.conversationId))
        .emit('chat:message:edited', message);
    } catch (error) {
      this.emitError(socket, error);
    }
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
    socket.emit('chat:error', {
      message: error instanceof Error ? error.message : 'Unexpected chat error.',
    });
  }
}
