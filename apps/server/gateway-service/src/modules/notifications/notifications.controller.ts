import type { OnModuleInit } from '@nestjs/common';
import { Controller, Inject } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { NotificationsGrpcService } from '@web-rtc-nest/contracts';
import { NOTIFICATIONS_GRPC_CLIENT } from '../../grpc/grpc-clients.module';

@Controller('notifications')
export class NotificationsController implements OnModuleInit {
  private notificationsService!: NotificationsGrpcService;

  constructor(@Inject(NOTIFICATIONS_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.notificationsService =
      this.client.getService<NotificationsGrpcService>('NotificationService');
  }

  // @Post()
  // sendNotification(@Body() body: SendNotificationRequest) {
  //   return firstValueFrom(this.notificationsService.sendNotification(body));
  // }

  // @Get()
  // listNotifications(
  //   @Query('userId') userId: string,
  //   @Query('unreadOnly') unreadOnly?: string,
  // ) {
  //   return firstValueFrom(
  //     this.notificationsService.listNotifications({
  //       userId,
  //       unreadOnly: unreadOnly === 'true',
  //     }),
  //   );
  // }
  //
  // @Patch(':notificationId/read')
  // markAsRead(
  //   @Param('notificationId') notificationId: string,
  //   @Body() body: Omit<MarkAsReadRequest, 'notificationId'>,
  // ) {
  //   return firstValueFrom(
  //     this.notificationsService.markAsRead({
  //       notificationId,
  //       userId: body.userId,
  //     }),
  //   );
  // }
}
