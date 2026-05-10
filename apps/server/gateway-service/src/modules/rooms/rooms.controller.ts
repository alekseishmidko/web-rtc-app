import { Body, Controller, Get, Inject, OnModuleInit, Param, Post, Query } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ROOMS_GRPC_CLIENT } from '../../grpc/grpc-clients.module';
import { CreateInviteRequest, CreateRoomRequest, RoomsGrpcService } from '../../grpc/grpc-contracts';

@Controller('rooms')
export class RoomsController implements OnModuleInit {
  private roomsService!: RoomsGrpcService;

  constructor(@Inject(ROOMS_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.roomsService = this.client.getService<RoomsGrpcService>('RoomService');
  }

  @Post()
  createRoom(@Body() body: CreateRoomRequest) {
    return firstValueFrom(this.roomsService.createRoom(body));
  }

  @Get()
  listRooms(@Query('ownerId') ownerId: string) {
    return firstValueFrom(this.roomsService.listRooms({ ownerId }));
  }

  @Get(':roomId')
  getRoom(@Param('roomId') roomId: string) {
    return firstValueFrom(this.roomsService.getRoom({ roomId }));
  }

  @Post(':roomId/invites')
  createInvite(
    @Param('roomId') roomId: string,
    @Body() body: Omit<CreateInviteRequest, 'roomId'>,
  ) {
    return firstValueFrom(
      this.roomsService.createInvite({
        roomId,
        createdBy: body.createdBy,
        recipientEmails: body.recipientEmails,
      }),
    );
  }
}
