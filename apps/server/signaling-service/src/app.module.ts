import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SignalingModule } from './signaling/signaling.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SignalingModule],
})
export class AppModule {}
