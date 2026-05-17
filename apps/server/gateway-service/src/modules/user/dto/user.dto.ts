import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { UpdateUserProfileRequest, UserProfile } from '@web-rtc-nest/contracts';

export class UpdateUserProfileRequestDto implements Pick<UpdateUserProfileRequest, 'name'> {
  /** Отображаемое имя пользователя в профиле. */
  @ApiProperty({
    description: 'Отображаемое имя пользователя в профиле.',
    example: 'Alex',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

export class UserProfileDto implements UserProfile {
  /** ID профиля пользователя. */
  @ApiProperty({
    description: 'ID профиля пользователя.',
    example: 'd9b33c26-b37b-4438-ad09-7c9a29f73e68',
  })
  id: string;

  /** ID account из auth-service, к которому привязан профиль. */
  @ApiProperty({
    description: 'ID account из auth-service, к которому привязан профиль.',
    example: 'e63ad47b-caf4-49b0-89f6-bc9b43f2f354',
  })
  accountId: string;

  /** Отображаемое имя пользователя. */
  @ApiProperty({
    description: 'Отображаемое имя пользователя.',
    example: 'Alex',
  })
  name: string;

  /** Дата создания профиля в ISO формате. */
  @ApiProperty({
    description: 'Дата создания профиля в ISO формате.',
    example: '2026-05-18T10:00:00.000Z',
  })
  createdAt: string;

  /** Дата последнего обновления профиля в ISO формате. */
  @ApiProperty({
    description: 'Дата последнего обновления профиля в ISO формате.',
    example: '2026-05-18T10:00:00.000Z',
  })
  updatedAt: string;
}
