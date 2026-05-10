import { Injectable } from '@nestjs/common';
import type { JoinRoomPayload, RoomPeer, SignalPayload } from '@web-rtc-nest/contracts';

@Injectable()
export class SignalingService {
  private readonly peersByRoom = new Map<string, Map<string, RoomPeer>>();
  private readonly roomBySocket = new Map<string, string>();

  joinRoom(socketId: string, payload: JoinRoomPayload) {
    const roomId = payload.roomId?.trim();

    if (!roomId) {
      return { error: 'Room id is required.' };
    }

    const previousRoom = this.leaveRoom(socketId);
    const userName = payload.userName?.trim() || `User ${socketId.slice(0, 4)}`;
    const room = this.getOrCreateRoom(roomId);
    const existingPeers = Array.from(room.values());
    const peer = { id: socketId, userName };

    room.set(socketId, peer);
    this.roomBySocket.set(socketId, roomId);

    return { roomId, peer, existingPeers, previousRoom };
  }

  leaveRoom(socketId: string) {
    const roomId = this.roomBySocket.get(socketId);

    if (!roomId) {
      return undefined;
    }

    const room = this.peersByRoom.get(roomId);
    room?.delete(socketId);
    this.roomBySocket.delete(socketId);

    if (room?.size === 0) {
      this.peersByRoom.delete(roomId);
    }

    return { roomId, peerId: socketId };
  }

  canForwardSignal(socketId: string, payload: SignalPayload) {
    const roomId = this.roomBySocket.get(socketId);

    return Boolean(roomId && roomId === payload.roomId);
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
