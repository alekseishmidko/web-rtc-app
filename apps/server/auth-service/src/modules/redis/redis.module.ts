import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    RedisService,
    {
      provide: REDIS_CLIENT,
      inject: [RedisService],
      useFactory: (redisService: RedisService) => redisService.getClient(),
    },
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
