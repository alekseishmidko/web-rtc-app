import { join } from 'node:path';

export const protoRoot = join(process.cwd(), '../../../packages/contracts/proto');

export const grpcTargets = {
  auth: process.env.AUTH_GRPC_URL ?? '127.0.0.1:50051',
  user: process.env.USER_GRPC_URL ?? '127.0.0.1:50056',
  rooms: process.env.ROOMS_GRPC_URL ?? '127.0.0.1:50052',
  notifications: process.env.NOTIFICATIONS_GRPC_URL ?? '127.0.0.1:50053',
  chat: process.env.CHAT_GRPC_URL ?? '127.0.0.1:50054',
  payment: process.env.PAYMENT_GRPC_URL ?? '127.0.0.1:50055',
};
