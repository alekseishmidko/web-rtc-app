import { status } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type {
  CreateUserProfileRequest,
  GetUserProfileByAccountIdRequest,
  UpdateUserProfileRequest,
  UserProfile,
} from '@web-rtc-nest/contracts';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { DATABASE } from '../../database/database.module';
import type { UserDatabase } from '../../database/database.module';
import { users } from '../../database/user.schema';
import type { UserRecord } from '../../database/user.schema';

@Injectable()
export class UserService implements OnModuleInit {
  constructor(@Inject(DATABASE) private readonly database: UserDatabase) {}

  async onModuleInit() {
    await this.bootstrapSchema();
  }

  async createProfile(request: CreateUserProfileRequest): Promise<UserProfile> {
    const accountId = this.requireUuid(request.accountId, 'accountId');
    const name = this.requireName(request.name);

    try {
      const [profile] = await this.database
        .insert(users)
        .values({
          id: randomUUID(),
          accountId,
          name,
        })
        .returning();

      if (!profile) {
        throw this.createRpcException(status.INTERNAL, 'Failed to create user profile.');
      }

      return this.toUserProfile(profile);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw this.createRpcException(
          status.ALREADY_EXISTS,
          'User profile for this account already exists.',
        );
      }

      throw error;
    }
  }

  async getProfileByAccountId(
    request: GetUserProfileByAccountIdRequest,
  ): Promise<UserProfile> {
    const accountId = this.requireUuid(request.accountId, 'accountId');
    const profile = await this.database.query.users.findFirst({
      where: eq(users.accountId, accountId),
    });

    if (!profile) {
      throw this.createRpcException(status.NOT_FOUND, 'User profile not found.');
    }

    return this.toUserProfile(profile);
  }

  async updateProfile(request: UpdateUserProfileRequest): Promise<UserProfile> {
    const accountId = this.requireUuid(request.accountId, 'accountId');
    const name = this.requireName(request.name);
    const [profile] = await this.database
      .update(users)
      .set({ name })
      .where(eq(users.accountId, accountId))
      .returning();

    if (!profile) {
      throw this.createRpcException(status.NOT_FOUND, 'User profile not found.');
    }

    return this.toUserProfile(profile);
  }

  private async bootstrapSchema() {
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
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL UNIQUE,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await this.database.execute(sql`
      CREATE INDEX IF NOT EXISTS users_account_id_idx ON users(account_id);
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

  private toUserProfile(profile: UserRecord): UserProfile {
    return {
      id: profile.id,
      accountId: profile.accountId,
      name: profile.name,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private requireName(value: string | undefined) {
    const name = value?.trim();

    if (!name) {
      throw this.createRpcException(status.INVALID_ARGUMENT, 'Name is required.');
    }

    if (name.length > 120) {
      throw this.createRpcException(
        status.INVALID_ARGUMENT,
        'Name must be shorter than 120 characters.',
      );
    }

    return name;
  }

  private requireUuid(value: string | undefined, fieldName: string) {
    if (!value) {
      throw this.createRpcException(status.INVALID_ARGUMENT, `${fieldName} is required.`);
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw this.createRpcException(status.INVALID_ARGUMENT, `${fieldName} must be a UUID.`);
    }

    return value;
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private createRpcException(code: status, details: string) {
    return new RpcException({ code, details });
  }
}
