export type ChatConversationType = 'direct' | 'group' | 'room';
export type ChatMediaStatus = 'pending' | 'uploaded' | 'failed';

export type ChatMediaAttachmentDraft = {
  mediaId?: string;
  uploadId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status?: ChatMediaStatus;
  metadata?: Record<string, unknown>;
};

export type ChatMediaAttachment = ChatMediaAttachmentDraft & {
  id: string;
  messageId: string;
  status: ChatMediaStatus;
  createdAt: string;
};

export type ChatConversation = {
  id: string;
  type: ChatConversationType;
  title?: string;
  roomId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  text?: string;
  editedAt?: string;
  deletedAt?: string;
  createdAt: string;
  attachments: ChatMediaAttachment[];
};

export type ChatJoinPayload = {
  conversationId: string;
  userId: string;
};

export type ChatDirectCreatePayload = {
  initiatorId: string;
  participantId: string;
};

export type ChatGroupCreatePayload = {
  creatorId: string;
  participantIds: string[];
  title?: string;
};

export type ChatRoomSyncPayload = {
  roomId: string;
  userId: string;
  participantIds?: string[];
  title?: string;
};

export type ChatSendMessagePayload = {
  conversationId: string;
  senderId: string;
  text?: string;
  attachments?: ChatMediaAttachmentDraft[];
};

export type ChatEditMessagePayload = {
  messageId: string;
  editorId: string;
  text?: string;
  attachments?: ChatMediaAttachmentDraft[];
};

export type ChatListMessagesPayload = {
  conversationId: string;
  userId: string;
  limit?: number;
  beforeMessageId?: string;
};

export type ChatDeleteMessagesPayload = {
  userId: string;
  messageIds: string[];
};

export type ChatClearHistoryPayload = {
  conversationId: string;
  userId: string;
};

export type ChatDeleteMessagesResponse = {
  deletedMessageIds: string[];
};

export type ChatClearHistoryResponse = {
  conversationId: string;
  deletedCount: number;
};

export type ChatErrorPayload = {
  message: string;
};
