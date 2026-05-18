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
    const profileFields = this.normalizeProfileFields(request);

    try {
      const [profile] = await this.database
        .insert(users)
        .values({
          id: randomUUID(),
          accountId,
          name,
          ...profileFields,
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
    const profileFields = this.normalizeProfileFields(request);
    const [profile] = await this.database
      .update(users)
      .set({ name, ...profileFields })
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
        birth_day date,
        currency text,
        country text,
        locale text,
        timezone text,
        avatar_url text,
        bio text,
        phone_number text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      );
    `);

    await this.database.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS birth_day date,
        ADD COLUMN IF NOT EXISTS currency text,
        ADD COLUMN IF NOT EXISTS country text,
        ADD COLUMN IF NOT EXISTS locale text,
        ADD COLUMN IF NOT EXISTS timezone text,
        ADD COLUMN IF NOT EXISTS avatar_url text,
        ADD COLUMN IF NOT EXISTS bio text,
        ADD COLUMN IF NOT EXISTS phone_number text,
        ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    `);

    await this.database.execute(sql`
      CREATE INDEX IF NOT EXISTS users_account_id_idx ON users(account_id);
    `);

    await this.database.execute(sql`
      CREATE INDEX IF NOT EXISTS users_country_idx ON users(country);
    `);

    await this.database.execute(sql`
      CREATE INDEX IF NOT EXISTS users_currency_idx ON users(currency);
    `);

    await this.database.execute(sql`
      CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users(deleted_at);
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
      birthDay: profile.birthDay ?? undefined,
      currency: profile.currency ?? undefined,
      country: profile.country ?? undefined,
      locale: profile.locale ?? undefined,
      timezone: profile.timezone ?? undefined,
      avatarUrl: profile.avatarUrl ?? undefined,
      bio: profile.bio ?? undefined,
      phoneNumber: profile.phoneNumber ?? undefined,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      deletedAt: profile.deletedAt?.toISOString(),
    };
  }

  private normalizeProfileFields(
    request: CreateUserProfileRequest | UpdateUserProfileRequest,
  ) {
    const fields: {
      birthDay?: string;
      currency?: string;
      country?: string;
      locale?: string;
      timezone?: string;
      avatarUrl?: string;
      bio?: string;
      phoneNumber?: string;
    } = {};

    const birthDay = this.normalizeBirthDay(request.birthDay);
    const currency = this.normalizeIsoCode(request.currency, 3, 'currency');
    const country = this.normalizeIsoCode(request.country, 2, 'country');
    const locale = this.normalizeOptionalString(request.locale, 35, 'locale');
    const timezone = this.normalizeOptionalString(request.timezone, 80, 'timezone');
    const avatarUrl = this.normalizeOptionalString(request.avatarUrl, 2048, 'avatarUrl');
    const bio = this.normalizeOptionalString(request.bio, 500, 'bio');
    const phoneNumber = this.normalizeOptionalString(request.phoneNumber, 32, 'phoneNumber');

    if (birthDay) {
      fields.birthDay = birthDay;
    }
    if (currency) {
      fields.currency = currency;
    }
    if (country) {
      fields.country = country;
    }
    if (locale) {
      fields.locale = locale;
    }
    if (timezone) {
      fields.timezone = timezone;
    }
    if (avatarUrl) {
      fields.avatarUrl = avatarUrl;
    }
    if (bio) {
      fields.bio = bio;
    }
    if (phoneNumber) {
      fields.phoneNumber = phoneNumber;
    }

    return fields;
  }

  private normalizeBirthDay(value: string | undefined) {
    const birthDay = this.normalizeOptionalString(value, 10, 'birthDay');

    if (!birthDay) {
      return undefined;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDay)) {
      throw this.createRpcException(
        status.INVALID_ARGUMENT,
        'birthDay must use YYYY-MM-DD format.',
      );
    }

    const date = new Date(`${birthDay}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthDay) {
      throw this.createRpcException(status.INVALID_ARGUMENT, 'birthDay must be a valid date.');
    }

    return birthDay;
  }

  private normalizeIsoCode(value: string | undefined, length: number, fieldName: string) {
    const code = this.normalizeOptionalString(value, length, fieldName)?.toUpperCase();

    if (!code) {
      return undefined;
    }

    if (!new RegExp(`^[A-Z]{${length}}$`).test(code)) {
      throw this.createRpcException(
        status.INVALID_ARGUMENT,
        `${fieldName} must be a ${length}-letter ISO code.`,
      );
    }

    return code;
  }

  private normalizeOptionalString(value: string | undefined, maxLength: number, fieldName: string) {
    const normalized = value?.trim();

    if (!normalized) {
      return undefined;
    }

    if (normalized.length > maxLength) {
      throw this.createRpcException(
        status.INVALID_ARGUMENT,
        `${fieldName} must be shorter than ${maxLength + 1} characters.`,
      );
    }

    return normalized;
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
