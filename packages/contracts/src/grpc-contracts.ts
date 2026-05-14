import type { Observable } from 'rxjs';
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RefreshSessionRequest,
  RegisterRequest,
  ValidateSessionRequest,
  ValidateSessionResponse,
} from './types/auth.types';
import type {
  ChatClearHistoryPayload,
  ChatClearHistoryResponse,
  ChatDeleteMessagesPayload,
  ChatDeleteMessagesResponse,
  ChatMessage,
} from './types/chat.types';

export interface AuthGrpcService {
  register(request: RegisterRequest): Observable<AuthResponse>;
  login(request: LoginRequest): Observable<AuthResponse>;
  refreshSession(request: RefreshSessionRequest): Observable<AuthResponse>;
  validateSession(request: ValidateSessionRequest): Observable<ValidateSessionResponse>;
}

export type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RefreshSessionRequest,
  RegisterRequest,
  ValidateSessionRequest,
  ValidateSessionResponse,
};

export type CreateRoomRequest = {
  ownerId: string;
  title: string;
  isPrivate?: boolean;
  startsAt?: string;
};

export type GetRoomRequest = {
  roomId: string;
};

export type ListRoomsRequest = {
  ownerId: string;
};

export type CreateInviteRequest = {
  roomId: string;
  createdBy: string;
  recipientEmails: string[];
};

export type RoomResponse = {
  id: string;
  ownerId: string;
  title: string;
  isPrivate: boolean;
  startsAt: string;
  createdAt: string;
};

export type ListRoomsResponse = {
  rooms: RoomResponse[];
};

export type InviteResponse = {
  inviteId: string;
  roomId: string;
  inviteUrl: string;
};

export interface RoomsGrpcService {
  createRoom(request: CreateRoomRequest): Observable<RoomResponse>;
  getRoom(request: GetRoomRequest): Observable<RoomResponse>;
  listRooms(request: ListRoomsRequest): Observable<ListRoomsResponse>;
  createInvite(request: CreateInviteRequest): Observable<InviteResponse>;
}

export type SendNotificationRequest = {
  userId: string;
  type: string;
  channels: string[];
  title: string;
  body: string;
};

export type ListNotificationsRequest = {
  userId: string;
  unreadOnly?: boolean;
};

export type MarkAsReadRequest = {
  notificationId: string;
  userId: string;
};

export type NotificationResponse = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type ListNotificationsResponse = {
  notifications: NotificationResponse[];
};

export interface NotificationsGrpcService {
  sendNotification(request: SendNotificationRequest): Observable<NotificationResponse>;
  listNotifications(request: ListNotificationsRequest): Observable<ListNotificationsResponse>;
  markAsRead(request: MarkAsReadRequest): Observable<NotificationResponse>;
}

export type ChatListMessagesRequest = {
  conversationId: string;
  userId: string;
  limit?: number;
  beforeMessageId?: string;
};

export type ChatListMessagesResponse = {
  messages: ChatMessage[];
};

export interface ChatGrpcService {
  listMessages(request: ChatListMessagesRequest): Observable<ChatListMessagesResponse>;
  deleteMessages(request: ChatDeleteMessagesPayload): Observable<ChatDeleteMessagesResponse>;
  clearHistory(request: ChatClearHistoryPayload): Observable<ChatClearHistoryResponse>;
}
