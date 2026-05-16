import type { OnModuleInit } from '@nestjs/common';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Query,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  ChatClearHistoryPayload,
  ChatDeleteMessagesPayload,
  ChatDeleteMessagesResponse,
  ChatGrpcService,
  ChatListMessagesResponse,
} from '@web-rtc-nest/contracts';
import { firstValueFrom } from 'rxjs';
import { CHAT_GRPC_CLIENT } from '../../grpc/grpc-clients.module';
import {
  ChatListMessagesResponseDto,
  ClearHistoryRequestDto,
  ClearHistoryResponseDto,
  DeleteMessagesRequestDto,
  DeleteMessagesResponseDto,
} from './dto/chat.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController implements OnModuleInit {
  private chatService!: ChatGrpcService;

  constructor(@Inject(CHAT_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.chatService = this.client.getService<ChatGrpcService>('ChatService');
  }

  @Get('conversations/:conversationId/messages')
  @ApiOperation({
    summary: 'Load chat message history',
    description:
      'REST facade over ChatService.ListMessages. Gateway parses query parameters and forwards the request to chat-service over gRPC. Chat-service checks that userId is a participant, filters soft-deleted messages, applies backward pagination by beforeMessageId, and returns messages in chronological order.',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Conversation whose history should be loaded.',
    example: 'b7a9c906-16e3-4c2f-91e3-d6823f5c24ac',
  })
  @ApiQuery({
    name: 'userId',
    description: 'Participant requesting the history. Required by chat-service access check.',
    example: '27b976f6-2137-4899-a088-d11775ef3f5c',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description:
      'Optional page size. Gateway only checks that it is an integer; chat-service clamps the effective value to 1..100 and defaults to 50.',
    example: 50,
  })
  @ApiQuery({
    name: 'beforeMessageId',
    required: false,
    description:
      'Optional cursor. When set, chat-service returns messages created before this message.',
    example: 'a95bb795-1a3c-4d73-98dd-534c94f3aa33',
  })
  @ApiResponse({
    status: 200,
    description: 'Message page returned by chat-service.',
    type: ChatListMessagesResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid HTTP shape, for example non-integer limit. gRPC validation errors from chat-service are also mapped by the global filter.',
  })
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

  // @Delete('messages/:messageId')
  // deleteMessage(
  //   @Param('messageId') messageId: string,
  //   @Body() body: DeleteOneMessageBody,
  // ): Promise<ChatDeleteMessagesResponse> {
  //   return firstValueFrom(
  //     this.chatService.deleteMessages({
  //       userId: this.requireBodyValue(body.userId, 'userId'),
  //       messageIds: [messageId],
  //     }),
  //   );
  // }

  @Delete('messages')
  @ApiOperation({
    summary: 'Soft-delete one or more chat messages',
    description:
      'REST facade over ChatService.DeleteMessages. Gateway requires userId and at least one message id, then forwards the command to chat-service over gRPC. Chat-service checks conversation membership and marks only messages sent by this user as deleted. Messages owned by other users or already-deleted messages are ignored and will not appear in deletedMessageIds.',
  })
  @ApiBody({ type: DeleteMessagesRequestDto })
  @ApiResponse({
    status: 200,
    description:
      'Contains ids that chat-service actually marked with deletedAt. The list can be empty.',
    type: DeleteMessagesResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'userId is missing, or messageIds is missing/empty.',
  })
  deleteMessages(@Body() body: ChatDeleteMessagesPayload): Promise<ChatDeleteMessagesResponse> {
    const payload: ChatDeleteMessagesPayload = {
      userId: this.requireBodyValue(body.userId, 'userId'),
      messageIds: this.requireMessageIds(body.messageIds),
    };

    return firstValueFrom(this.chatService.deleteMessages(payload));
  }

  @Delete('conversations/:conversationId/messages')
  @ApiOperation({
    summary: 'Clear all messages in a conversation',
    description:
      'REST facade over ChatService.ClearHistory. Gateway takes conversationId from the URL and userId from the body, then sends a gRPC command to chat-service. Chat-service verifies that userId is a participant and soft-deletes every non-deleted message in the conversation. This is a shared cleanup for the conversation, not a personal "hide only for me" action.',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Conversation whose messages should be soft-deleted.',
    example: 'b7a9c906-16e3-4c2f-91e3-d6823f5c24ac',
  })
  @ApiBody({ type: ClearHistoryRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Number of messages marked as deleted by chat-service.',
    type: ClearHistoryResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'userId is missing, or chat-service rejects the participant check.',
  })
  clearHistory(
    @Param('conversationId') conversationId: string,
    @Body() body: Omit<ChatClearHistoryPayload, 'conversationId'>,
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
