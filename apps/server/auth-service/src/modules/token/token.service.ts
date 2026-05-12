import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS_CLIENT } from '../redis/redis.module';

type StoredSession = {
  type: 'access' | 'refresh';
  userId: string;
};

@Injectable()
export class TokenService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    configService: ConfigService,
  ) {
    this.accessTtlSeconds = Number(configService.getOrThrow<string>('ACCESS_SESSION_TTL_SECONDS'));
    this.refreshTtlSeconds = Number(configService.getOrThrow<string>('REFRESH_SESSION_TTL_SECONDS'));
  }

  async createPair(userId: string) {
    const [accessSessionId, refreshSessionId] = await Promise.all([
      this.create('access', userId),
      this.create('refresh', userId),
    ]);

    return { accessSessionId, refreshSessionId };
  }

  async rotateRefreshSession(refreshSessionId: string) {
    const userId = await this.getUserId(refreshSessionId, 'refresh');

    if (!userId) {
      return undefined;
    }

    await this.redis.del(this.getSessionKey(refreshSessionId));
    return this.createPair(userId);
  }

  private async create(type: StoredSession['type'], userId: string) {
    // sessionId - opaque token: клиент не может извлечь из него userId/role.
    // Состояние хранится в Redis, поэтому сервер может инвалидировать сессию.
    const sessionId = randomUUID();
    const session: StoredSession = { type, userId };
    const ttlSeconds = type === 'access' ? this.accessTtlSeconds : this.refreshTtlSeconds;

    // Access TTL должен быть коротким, refresh TTL длиннее. Слабое место, которое
    // еще остается: нет logout/revoke all sessions и привязки к device/ip/user-agent.
    await this.redis.set(this.getSessionKey(sessionId), JSON.stringify(session), 'EX', ttlSeconds);

    return sessionId;
  }

  async getUserId(sessionId: string, expectedKind: StoredSession['type']) {
    // Наличие ключа в Redis означает, что сессия еще активна. Если Redis
    // недоступен, auth-service фактически не сможет валидировать пользователей.
    const rawSession = await this.redis.get(this.getSessionKey(sessionId));

    if (!rawSession) {
      return undefined;
    }

    const session = JSON.parse(rawSession) as StoredSession;
    if (session.type !== expectedKind) {
      return undefined;
    }

    return session.userId;
  }

  private getSessionKey(sessionId: string) {
    return `auth:sessions:${sessionId}`;
  }
}
