import { Module } from '@nestjs/common';
import { SignalingGateway } from './signaling.gateway';

@Module({
  imports: [],
  providers: [SignalingGateway],
})
export class AppModule {}
