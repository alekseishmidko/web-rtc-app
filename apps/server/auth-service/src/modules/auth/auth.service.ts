import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuthDatabase, DATABASE } from '../../database/database.module';
import { UserRecord, users } from '../../database/user.schema';
import {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RefreshSessionRequest,
  RegisterRequest,
  ValidateSessionResponse,
} from './auth.types';
import { PasswordService } from './password.service';
import { TokenService } from '../token/token.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @Inject(DATABASE)
    private readonly database: AuthDatabase,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async onModuleInit() {
    // Для dev-сценария сервис сам поднимает минимальную схему.
    // В production это лучше заменить на управляемые миграции Drizzle, чтобы
    // изменение схемы было версионируемым и атомарным.
    await this.database.execute(sql`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin', 'user');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.database.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role user_role NOT NULL DEFAULT 'user',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await this.database.execute(sql`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await this.database.execute(sql`
      DROP TRIGGER IF EXISTS users_set_updated_at ON users;
      CREATE TRIGGER users_set_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  async register(request: RegisterRequest): Promise<AuthResponse> {
    // Регистрация одновременно создает user в Postgres и новую Redis-сессию.
    // Это аутентифицирует клиента сразу после успешного создания аккаунта.
    const email = request.email?.trim().toLowerCase();
    const name = request.name?.trim();

    if (!email || !name || !request.password) {
      throw this.createRpcException(status.INVALID_ARGUMENT, 'Email, name and password are required.');
    }

    const passwordHash = await this.passwordService.hash(request.password);

    try {
      // role всегда задается как user. Выдача admin-ролей должна быть отдельным
      // административным workflow, иначе register станет вектором privilege escalation.
      const [user] = await this.database
        .insert(users)
        .values({
          id: randomUUID(),
          name,
          email,
          passwordHash,
          role: 'user',
        })
        .returning();

      const sessions = await this.tokenService.createPair(user.id);

      return {
        ...sessions,
        user: this.toAuthUser(user),
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw this.createRpcException(status.ALREADY_EXISTS, 'User with this email already exists.');
      }

      throw error;
    }
  }

  async login(request: LoginRequest): Promise<AuthResponse> {
    // Login - это аутентификация: проверяем, что пользователь владеет секретом
    // password, и только после этого выдаем новый opaque sessionId.
    const email = request.email?.trim().toLowerCase();

    if (!email || !request.password) {
      throw this.createRpcException(status.INVALID_ARGUMENT, 'Email and password are required.');
    }

    const user = await this.findUserByEmail(email);

    // Не раскрываем, существует ли email. Одинаковая ошибка для неизвестного
    // email и неверного пароля снижает риск user enumeration.
    if (!user) {
      throw this.createRpcException(status.UNAUTHENTICATED, 'Invalid email or password.');
    }

    const passwordMatches = await this.passwordService.verify(request.password, user.passwordHash);

    if (!passwordMatches) {
      throw this.createRpcException(status.UNAUTHENTICATED, 'Invalid email or password.');
    }

    const sessions = await this.tokenService.createPair(user.id);

    return {
      ...sessions,
      user: this.toAuthUser(user),
    };
  }

  async refreshSession(request: RefreshSessionRequest): Promise<AuthResponse> {
    // Refresh flow продлевает авторизацию без повторного ввода пароля.
    // Refresh-сессия ротируется: старый refreshSessionId удаляется из Redis,
    // поэтому повторное использование украденного refresh id не должно сработать.
    if (!request.refreshSessionId) {
      throw this.createRpcException(status.INVALID_ARGUMENT, 'Refresh session id is required.');
    }

    const sessions = await this.tokenService.rotateRefreshSession(request.refreshSessionId);

    if (!sessions) {
      throw this.createRpcException(status.UNAUTHENTICATED, 'Invalid refresh session.');
    }

    const userId = await this.tokenService.getUserId(sessions.accessSessionId, 'access');
    const user = userId ? await this.findUserById(userId) : undefined;

    if (!user) {
      throw this.createRpcException(status.UNAUTHENTICATED, 'Invalid refresh session.');
    }

    return {
      ...sessions,
      user: this.toAuthUser(user),
    };
  }

  async validateSession(accessSessionId: string): Promise<ValidateSessionResponse> {
    // ValidateSession - это база для авторизации в других сервисах.
    // Он не принимает password/JWT, а проверяет короткую access-сессию и возвращает user+role.
    if (!accessSessionId) {
      return { valid: false };
    }

    const userId = await this.tokenService.getUserId(accessSessionId, 'access');

    if (!userId) {
      return { valid: false };
    }

    const user = await this.findUserById(userId);

    // Слабое место текущей модели: если user удален/заблокирован, Redis-сессия
    // сама не знает об этом. Поэтому мы всегда дочитываем user из Postgres.
    if (!user) {
      return { valid: false };
    }

    return {
      valid: true,
      user: this.toAuthUser(user),
    };
  }

  private async findUserByEmail(email: string) {
    const [user] = await this.database.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  private async findUserById(userId: string) {
    const [user] = await this.database.select().from(users).where(eq(users.id, userId)).limit(1);
    return user;
  }

  private toAuthUser(user: UserRecord): AuthUser {
    // Наружу не отдаем email и passwordHash. Для авторизации достаточно id+role,
    // а лишние поля расширяют поверхность утечек.
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }

  private createRpcException(code: status, details: string) {
    // gRPC клиенты ожидают canonical status code + details. Plain string в
    // RpcException теряет машинно-читаемый код ошибки.
    return new RpcException({ code, details });
  }
}
