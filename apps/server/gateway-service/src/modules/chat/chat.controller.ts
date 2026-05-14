import type { OnModuleInit } from '@nestjs/common';
import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Query } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type {
  ChatDeleteMessagesPayload,
  ChatDeleteMessagesResponse,
  ChatGrpcService,
  ChatListMessagesResponse,
} from '@web-rtc-nest/contracts';
import { firstValueFrom } from 'rxjs';
import { CHAT_GRPC_CLIENT } from '../../grpc/grpc-clients.module';

type DeleteOneMessageBody = {
  userId?: string;
};

type DeleteManyMessagesBody = {
  userId?: string;
  messageIds?: string[];
};

type ClearHistoryBody = {
  userId?: string;
};

@Controller('chat')
export class ChatController implements OnModuleInit {
  private chatService!: ChatGrpcService;

  constructor(@Inject(CHAT_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.chatService = this.client.getService<ChatGrpcService>('ChatService');
  }

  @Get('conversations/:conversationId/messages')
  listMessages(
    @Param('conversationId') conversationId: string,
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('beforeMessageId') beforeMessageId?: string,
  ): Promise<ChatListMessagesResponse> {
    // Gateway оставляет REST-интерфейс для внешних клиентов, но вся бизнес-логика
    // истории выполняется в chat-service через gRPC.
    return firstValueFrom(
      this.chatService.listMessages({
        conversationId,
        userId,
        limit: this.parseOptionalLimit(limit),
        beforeMessageId,
      }),
    );
  }

  @Delete('messages/:messageId')
  deleteMessage(
    @Param('messageId') messageId: string,
    @Body() body: DeleteOneMessageBody,
  ): Promise<ChatDeleteMessagesResponse> {
    return firstValueFrom(
      this.chatService.deleteMessages({
        userId: this.requireBodyValue(body.userId, 'userId'),
        messageIds: [messageId],
      }),
    );
  }

  @Delete('messages')
  deleteMessages(
    @Body() body: DeleteManyMessagesBody,
  ): Promise<ChatDeleteMessagesResponse> {
    const payload: ChatDeleteMessagesPayload = {
      userId: this.requireBodyValue(body.userId, 'userId'),
      messageIds: this.requireMessageIds(body.messageIds),
    };

    return firstValueFrom(this.chatService.deleteMessages(payload));
  }

  @Delete('conversations/:conversationId/messages')
  clearHistory(
    @Param('conversationId') conversationId: string,
    @Body() body: ClearHistoryBody,
  ) {
    return firstValueFrom(
      this.chatService.clearHistory({
        conversationId,
        userId: this.requireBodyValue(body.userId, 'userId'),
      }),
    );
  }

  private parseOptionalLimit(limit: string | undefined) {
    if (limit === undefined) {
      return undefined;
    }

    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit)) {
      throw new BadRequestException('limit must be an integer.');
    }

    return parsedLimit;
  }

  private requireBodyValue(value: string | undefined, fieldName: string) {
    if (!value) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return value;
  }

  private requireMessageIds(messageIds: string[] | undefined) {
    if (!messageIds || messageIds.length === 0) {
      throw new BadRequestException('messageIds must contain at least one id.');
    }

    return messageIds;
  }
}
