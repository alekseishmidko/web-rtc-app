import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  RegisterRequest,
  LoginRequest,
  ValidateSessionRequest,
  RefreshSessionRequest,
  ValidateSessionResponse,
  AuthUser,
} from '@web-rtc-nest/contracts';

export class RegisterRequestDto implements RegisterRequest {
  @ApiProperty({ example: 'alex@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'strong-password-123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Alex' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}

export class LoginRequestDto implements LoginRequest {
  @ApiProperty({ example: 'alex@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'strong-password-123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class ValidateSessionRequestDto implements ValidateSessionRequest {
  @ApiPropertyOptional({
    description:
      'Access session id to validate. Usually omitted by browser clients because gateway first reads the HttpOnly accessSessionId cookie. Body value is a fallback for non-browser clients and Swagger testing.',
    example: '8db86529-0b24-4d0d-a35b-b31628a1135c',
  })
  @IsOptional()
  @IsUUID()
  accessSessionId: string;
}

export class RefreshSessionRequestDto implements RefreshSessionRequest {
  @ApiPropertyOptional({
    description:
      'Refresh session id used to rotate the session pair. Usually omitted by browser clients because gateway first reads the HttpOnly refreshSessionId cookie. Body value is a fallback for non-browser clients and Swagger testing. If both cookie and body are present, cookie wins.',
    example: '4c9a2b9f-c4f6-4d43-88a5-b2f56f142f04',
  })
  @IsOptional()
  @IsUUID()
  refreshSessionId: string;
}

export class AuthUserDto implements AuthUser {
  @ApiProperty({ example: '2a2d0f7f-c1df-4b8b-a6cc-80101895b405' })
  @IsUUID()
  id: string;

  @ApiProperty({ example: 'Alex' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ['admin', 'user'], example: 'user' })
  @IsIn(['admin', 'user'])
  role: 'admin' | 'user';

  @ApiProperty({ example: '2026-05-10T10:00:00.000Z' })
  @IsString()
  createdAt: string;

  @ApiProperty({ example: '2026-05-10T10:00:00.000Z' })
  @IsString()
  updatedAt: string;
}

export class AuthUserResponseDto {
  @ApiProperty({
    description:
      'Authenticated user. The session ids are not returned in the JSON response; gateway stores them in HttpOnly cookies.',
    type: AuthUserDto,
  })
  user: AuthUserDto;
}

export class ValidateSessionResponseDto implements ValidateSessionResponse {
  @ApiProperty({ example: true })
  valid: boolean;

  @ApiProperty({ type: AuthUserDto, required: false })
  user?: AuthUserDto;
}
