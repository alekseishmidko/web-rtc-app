import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentModule } from './modules/payment/payment.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { SignalingModule } from './modules/signaling/signaling.module';
import { SharedModule } from './modules/shared/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ChatModule,
    HealthModule,
    NotificationsModule,
    PaymentModule,
    RoomsModule,
    SharedModule,
    SignalingModule,
  ],
})
export class AppModule {}
