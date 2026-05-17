import type { OnModuleInit } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { ClientGrpc, RpcException } from '@nestjs/microservices';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { lastValueFrom } from 'rxjs';

import type { AccountRecord } from '../../database/account.schema';
import { accounts } from '../../database/account.schema';
import type { AuthDatabase } from '../../database/database.module';
import { DATABASE } from '../../database/database.module';
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RefreshSessionRequest,
  RegisterRequest,
  UserGrpcService,
  UserProfile,
  ValidateSessionResponse,
} from '@web-rtc-nest/contracts';
import { TokenService } from '../token/token.service';
import { USER_GRPC_CLIENT } from './auth.constants';
import { PasswordService } from './password.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private userService: UserGrpcService;

  constructor(
    @Inject(DATABASE)
    private readonly database: AuthDatabase,
    @Inject(USER_GRPC_CLIENT)
    private readonly userClient: ClientGrpc,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async onModuleInit() {
    this.userService = this.userClient.getService<UserGrpcService>('UserService');

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
      DO $$
      BEGIN
        IF to_regclass('public.users') IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'users'
              AND column_name = 'email'
          )
        THEN
          DROP TABLE users;
        END IF;
      END $$;
    `);

    await this.database.execute(sql`
      CREATE TABLE IF NOT EXISTS accounts (
        id uuid PRIMARY KEY,
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
      DROP TRIGGER IF EXISTS accounts_set_updated_at ON accounts;
      CREATE TRIGGER accounts_set_updated_at
      BEFORE UPDATE ON accounts
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  async register(request: RegisterRequest): Promise<AuthResponse> {
    const email = request.email;
    const name = request.name;
    const password = request.password;

    if (!email || !name || !password) {
      throw this.createRpcException(
        status.INVALID_ARGUMENT,
        'Email, name and password are required.',
      );
    }

    const existingAccount = await this.database.query.accounts.findFirst({
      where: eq(accounts.email, email),
      columns: {
        id: true,
      },
    });

    if (existingAccount) {
      throw this.createRpcException(
        status.ALREADY_EXISTS,
        'Account with this email already exists.',
      );
    }

    const passwordHash = await this.passwordService.hash(password);
    const accountId = randomUUID();

    try {
      const [account] = await this.database
        .insert(accounts)
        .values({
          id: accountId,
          email,
          passwordHash,
          role: 'user',
        })
        .returning();

      if (!account) {
        throw this.createRpcException(status.INTERNAL, 'Failed to create account.');
      }

      const profile = await this.createUserProfile(account.id, name);
      const sessions = await this.tokenService.createPair(account.id);

      return {
        ...sessions,
        user: this.toAuthUser(account, profile),
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw this.createRpcException(
          status.ALREADY_EXISTS,
          'Account with this email already exists.',
        );
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

    const account = await this.findAccountByEmail(email);

    // Не раскрываем, существует ли email. Одинаковая ошибка для неизвестного
    // email и неверного пароля снижает риск user enumeration.
    if (!account) {
      throw this.createRpcException(status.UNAUTHENTICATED, 'Invalid email or password.');
    }

    const passwordMatches = await this.passwordService.verify(
      request.password,
      account.passwordHash,
    );

    if (!passwordMatches) {
      throw this.createRpcException(status.UNAUTHENTICATED, 'Invalid email or password.');
    }

    const [sessions, profile] = await Promise.all([
      this.tokenService.createPair(account.id),
      this.getUserProfile(account.id),
    ]);

    return {
      ...sessions,
      user: this.toAuthUser(account, profile),
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

    const accountId = await this.tokenService.getUserId(sessions.accessSessionId, 'access');
    const account = accountId ? await this.findAccountById(accountId) : undefined;

    if (!account) {
      throw this.createRpcException(status.UNAUTHENTICATED, 'Invalid refresh session.');
    }

    const profile = await this.getUserProfile(account.id);

    return {
      ...sessions,
      user: this.toAuthUser(account, profile),
    };
  }

  async validateSession(accessSessionId: string): Promise<ValidateSessionResponse> {
    // ValidateSession - это база для авторизации в других сервисах.
    // Он не принимает password/JWT, а проверяет короткую access-сессию и возвращает user+role.
    if (!accessSessionId) {
      return { valid: false };
    }

    const accountId = await this.tokenService.getUserId(accessSessionId, 'access');

    if (!accountId) {
      return { valid: false };
    }

    const account = await this.findAccountById(accountId);

    // Слабое место текущей модели: если account удален/заблокирован, Redis-сессия
    // сама не знает об этом. Поэтому мы всегда дочитываем account из Postgres.
    if (!account) {
      return { valid: false };
    }

    const profile = await this.getUserProfile(account.id);

    return {
      valid: true,
      user: this.toAuthUser(account, profile),
    };
  }

  private async findAccountByEmail(email: string) {
    const [account] = await this.database
      .select()
      .from(accounts)
      .where(eq(accounts.email, email))
      .limit(1);
    return account;
  }

  private async findAccountById(accountId: string) {
    const [account] = await this.database
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    return account;
  }

  private async createUserProfile(accountId: string, name: string) {
    try {
      return await lastValueFrom(this.userService.createProfile({ accountId, name }));
    } catch (error) {
      await this.database.delete(accounts).where(eq(accounts.id, accountId));
      throw error;
    }
  }

  private async getUserProfile(accountId: string) {
    return lastValueFrom(this.userService.getProfileByAccountId({ accountId }));
  }

  private toAuthUser(account: AccountRecord, profile: UserProfile): AuthUser {
    // Наружу не отдаем email и passwordHash. Auth-response содержит account id,
    // роль из auth-service и имя профиля из user-service.
    return {
      id: account.id,
      name: profile.name,
      role: account.role,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private createRpcException(code: status, details: string) {
    // gRPC клиенты ожидают canonical status code + details. Plain string в
    // RpcException теряет машинно-читаемый код ошибки.
    return new RpcException({ code, details });
  }
}
