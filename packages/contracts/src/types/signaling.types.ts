export type JoinRoomPayload = {
  roomId: string;
  userName?: string;
};

export type SignalPayload = {
  roomId: string;
  targetId: string;
  signal: unknown;
};

export type RoomPeer = {
  id: string;
  userName: string;
};
