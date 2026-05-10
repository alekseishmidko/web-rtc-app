import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { grpcTargets, protoRoot } from '../config/grpc.config';

export const AUTH_GRPC_CLIENT = 'AUTH_GRPC_CLIENT';
export const ROOMS_GRPC_CLIENT = 'ROOMS_GRPC_CLIENT';
export const NOTIFICATIONS_GRPC_CLIENT = 'NOTIFICATIONS_GRPC_CLIENT';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: AUTH_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'auth',
          protoPath: join(protoRoot, 'auth.proto'),
          url: grpcTargets.auth,
        },
      },
      {
        name: ROOMS_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'rooms',
          protoPath: join(protoRoot, 'rooms.proto'),
          url: grpcTargets.rooms,
        },
      },
      {
        name: NOTIFICATIONS_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'notifications',
          protoPath: join(protoRoot, 'notifications.proto'),
          url: grpcTargets.notifications,
        },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class GrpcClientsModule {}
