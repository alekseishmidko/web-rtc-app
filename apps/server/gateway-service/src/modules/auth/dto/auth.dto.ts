import { ApiProperty } from '@nestjs/swagger';
import { RegisterRequest, LoginRequest, ValidateSessionRequest, RefreshSessionRequest, ValidateSessionResponse ,AuthUser } from "@web-rtc-nest/contracts";


export class RegisterRequestDto implements RegisterRequest {
  @ApiProperty({ example: 'alex@example.com' })
  email!: string;

  @ApiProperty({ example: 'strong-password-123' })
  password!: string;

  @ApiProperty({ example: 'Alex' })
  name!: string;
}

export class LoginRequestDto implements LoginRequest {
  @ApiProperty({ example: 'alex@example.com' })
  email!: string;

  @ApiProperty({ example: 'strong-password-123' })
  password!: string;
}

export class ValidateSessionRequestDto implements ValidateSessionRequest {
  @ApiProperty({ example: '8db86529-0b24-4d0d-a35b-b31628a1135c', required: false })
  accessSessionId!: string;
}

export class RefreshSessionRequestDto implements RefreshSessionRequest {
  @ApiProperty({ example: '4c9a2b9f-c4f6-4d43-88a5-b2f56f142f04', required: false })
  refreshSessionId!: string;
}

export class AuthUserDto implements AuthUser {
  @ApiProperty({ example: '2a2d0f7f-c1df-4b8b-a6cc-80101895b405' })
  id!: string;

  @ApiProperty({ example: 'Alex' })
  name!: string;

  @ApiProperty({ enum: ['admin', 'user'], example: 'user' })
  role!: 'admin' | 'user';

  @ApiProperty({ example: '2026-05-10T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-10T10:00:00.000Z' })
  updatedAt!: string;
}

export class AuthUserResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class ValidateSessionResponseDto implements ValidateSessionResponse {
  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiProperty({ type: AuthUserDto, required: false })
  user?: AuthUserDto;
}
