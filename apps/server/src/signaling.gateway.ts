import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

type JoinRoomPayload = {
  roomId: string;
  userName?: string;
};

type SignalPayload = {
  roomId: string;
  targetId: string;
  signal: unknown;
};

type RoomPeer = {
  id: string;
  userName: string;
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  // peersByRoom хранит участников каждой комнаты. Этого достаточно для signaling:
  // медиа-потоки WebRTC через сервер не проходят.
  private readonly peersByRoom = new Map<string, Map<string, RoomPeer>>();

  // Быстрая обратная связь socket -> room нужна, чтобы корректно удалить
  // участника при disconnect и не доверять roomId из произвольного payload.
  private readonly roomBySocket = new Map<string, string>();

  handleConnection(socket: Socket) {
    socket.emit('connected', { socketId: socket.id });
  }

  handleDisconnect(socket: Socket) {
    const roomId = this.roomBySocket.get(socket.id);

    if (!roomId) {
      return;
    }

    const room = this.peersByRoom.get(roomId);
    room?.delete(socket.id);
    this.roomBySocket.delete(socket.id);

    // Оставшимся участникам нужно закрыть RTCPeerConnection с ушедшим peer.
    socket.to(roomId).emit('peer-left', { peerId: socket.id });

    if (room?.size === 0) {
      this.peersByRoom.delete(roomId);
    }
  }

  @SubscribeMessage('join-room')
  async joinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    const roomId = payload.roomId?.trim();

    if (!roomId) {
      socket.emit('room-error', { message: 'Room id is required.' });
      return;
    }

    const userName = payload.userName?.trim() || `User ${socket.id.slice(0, 4)}`;
    const room = this.getOrCreateRoom(roomId);

    // Список уже подключенных участников отправляется только новому клиенту.
    // Он сам инициирует offer для каждого существующего peer.
    const existingPeers = Array.from(room.values());

    room.set(socket.id, { id: socket.id, userName });
    this.roomBySocket.set(socket.id, roomId);
    await socket.join(roomId);

    socket.emit('room-joined', {
      roomId,
      selfId: socket.id,
      peers: existingPeers,
    });

    socket.to(roomId).emit('peer-joined', {
      peer: { id: socket.id, userName },
    });
  }

  @SubscribeMessage('signal')
  forwardSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignalPayload,
  ) {
    const roomId = this.roomBySocket.get(socket.id);

    if (!roomId || roomId !== payload.roomId) {
      socket.emit('room-error', { message: 'Join the room before sending signals.' });
      return;
    }

    // Сервер не анализирует SDP/ICE. Он только пересылает signaling-сообщение
    // конкретному peer, а браузеры сами устанавливают WebRTC-соединение.
    this.server.to(payload.targetId).emit('signal', {
      fromId: socket.id,
      signal: payload.signal,
    });
  }

  @SubscribeMessage('leave-room')
  async leaveRoom(@ConnectedSocket() socket: Socket) {
    const roomId = this.roomBySocket.get(socket.id);

    if (!roomId) {
      return;
    }

    await socket.leave(roomId);

    // Переиспользуем общую логику очистки, чтобы leave-room и disconnect
    // приводили к одинаковому состоянию комнаты.
    this.handleDisconnect(socket);
  }

  private getOrCreateRoom(roomId: string) {
    const existingRoom = this.peersByRoom.get(roomId);

    if (existingRoom) {
      return existingRoom;
    }

    const room = new Map<string, RoomPeer>();
    this.peersByRoom.set(roomId, room);
    return room;
  }
}
