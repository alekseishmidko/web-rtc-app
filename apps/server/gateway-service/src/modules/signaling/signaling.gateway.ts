import type {
  OnGatewayConnection,
  OnGatewayDisconnect} from '@nestjs/websockets';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JoinRoomPayload, SignalPayload } from '@web-rtc-nest/contracts';
import { SignalingService } from './signaling.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  constructor(private readonly signalingService: SignalingService) {}

  handleConnection(socket: Socket) {
    socket.emit('connected', { socketId: socket.id });
  }

  handleDisconnect(socket: Socket) {
    const leftRoom = this.signalingService.leaveRoom(socket.id);

    if (!leftRoom) {
      return;
    }

    socket.to(leftRoom.roomId).emit('peer-left', { peerId: leftRoom.peerId });
  }

  @SubscribeMessage('join-room')
  async joinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    const result = this.signalingService.joinRoom(socket.id, payload);

    if ('error' in result) {
      socket.emit('room-error', { message: result.error });
      return;
    }

    if (result.previousRoom) {
      await socket.leave(result.previousRoom.roomId);
      socket.to(result.previousRoom.roomId).emit('peer-left', {
        peerId: result.previousRoom.peerId,
      });
    }

    await socket.join(result.roomId);

    socket.emit('room-joined', {
      roomId: result.roomId,
      selfId: socket.id,
      peers: result.existingPeers,
    });

    socket.to(result.roomId).emit('peer-joined', {
      peer: result.peer,
    });
  }

  @SubscribeMessage('signal')
  forwardSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SignalPayload,
  ) {
    if (!this.signalingService.canForwardSignal(socket.id, payload)) {
      socket.emit('room-error', { message: 'Join the room before sending signals.' });
      return;
    }

    this.server.to(payload.targetId).emit('signal', {
      fromId: socket.id,
      signal: payload.signal,
    });
  }

  @SubscribeMessage('leave-room')
  async leaveRoom(@ConnectedSocket() socket: Socket) {
    const leftRoom = this.signalingService.leaveRoom(socket.id);

    if (!leftRoom) {
      return;
    }

    await socket.leave(leftRoom.roomId);
    socket.to(leftRoom.roomId).emit('peer-left', { peerId: leftRoom.peerId });
  }
}
