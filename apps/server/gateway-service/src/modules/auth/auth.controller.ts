import type { OnModuleInit } from '@nestjs/common';
import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthGrpcService } from '@web-rtc-nest/contracts';
import { firstValueFrom } from 'rxjs';
import { AUTH_GRPC_CLIENT } from '../../grpc/grpc-clients.module';
import { ACCESS_SESSION_ID, REFRESH_SESSION_ID } from '../../shared/constants';
import { AuthCookieService } from './auth-cookie.service';
import type { CookieRequest, CookieResponse } from './auth-cookie.service';
import {
  AuthUserResponseDto,
  LoginRequestDto,
  RefreshSessionRequestDto,
  RegisterRequestDto,
  ValidateSessionRequestDto,
  ValidateSessionResponseDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController implements OnModuleInit {
  private authService: AuthGrpcService;

  constructor(
    @Inject(AUTH_GRPC_CLIENT)
    private readonly client: ClientGrpc,
    private readonly authCookieService: AuthCookieService,
  ) {}

  onModuleInit() {
    this.authService = this.client.getService<AuthGrpcService>('AuthService');
  }

  @Post('register')
  @ApiOperation({
    summary: 'Register a user and create a Redis-backed session',
    description:
      'Creates a user, creates access/refresh sessions in auth-service, and writes both ids to HttpOnly cookies. The response body contains only the user.',
  })
  @ApiBody({ type: RegisterRequestDto })
  @ApiResponse({ status: 201, type: AuthUserResponseDto })
  async register(
    @Body() body: RegisterRequestDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const authResponse = await firstValueFrom(this.authService.register(body));

    this.authCookieService.setAuthCookies(response, authResponse);

    return { user: authResponse.user };
  }

  @Post('login')
  @ApiOperation({
    summary: 'Login a user and create a Redis-backed session',
    description:
      'Authenticates by email/password, creates a new access/refresh session pair, and writes both ids to HttpOnly cookies. The response body contains only the user.',
  })
  @ApiBody({ type: LoginRequestDto })
  @ApiResponse({ status: 201, type: AuthUserResponseDto })
  async login(@Body() body: LoginRequestDto, @Res({ passthrough: true }) response: CookieResponse) {
    const authResponse = await firstValueFrom(this.authService.login(body));
    this.authCookieService.setAuthCookies(response, authResponse);

    return { user: authResponse.user };
  }

  @Post('sessions/refresh')
  @ApiOperation({
    summary: 'Rotate a refresh session and issue a new session pair',
    description:
      'Uses refreshSessionId from the HttpOnly cookie first, or from request body as a fallback. Auth-service deletes the old refresh session, creates a new access/refresh pair, and gateway overwrites both HttpOnly cookies. Browser clients should call this endpoint with credentials enabled and an empty body. Body input is mainly for non-browser clients and Swagger testing.',
  })
  @ApiBody({ type: RefreshSessionRequestDto })
  @ApiCookieAuth(REFRESH_SESSION_ID)
  @ApiResponse({
    status: 201,
    description:
      'Session pair was rotated. New accessSessionId and refreshSessionId are sent as Set-Cookie headers; JSON body contains the authenticated user.',
    type: AuthUserResponseDto,
  })
  async refreshSession(
    @Body() body: Partial<RefreshSessionRequestDto>,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const refreshSessionId =
      this.authCookieService.getRefreshSessionId(request) ?? body.refreshSessionId;
    const authResponse = await firstValueFrom(
      this.authService.refreshSession({ refreshSessionId: refreshSessionId ?? '' }),
    );
    this.authCookieService.setAuthCookies(response, authResponse);

    return { user: authResponse.user };
  }

  @Post('sessions/validate')
  @ApiOperation({
    summary: 'Validate an existing access session',
    description:
      'Checks accessSessionId from the HttpOnly cookie first, or from request body as a fallback. This endpoint does not refresh or extend sessions; it only returns whether the current access session is valid and includes the user when valid.',
  })
  @ApiBody({ type: ValidateSessionRequestDto })
  @ApiCookieAuth(ACCESS_SESSION_ID)
  @ApiResponse({
    status: 201,
    description:
      'Validation result. Returns { valid: false } when the access session is missing, expired, or points to a missing user.',
    type: ValidateSessionResponseDto,
  })
  validateSession(@Body() body: Partial<ValidateSessionRequestDto>, @Req() request: CookieRequest) {
    const accessSessionId =
      this.authCookieService.getAccessSessionId(request) ?? body.accessSessionId;

    return firstValueFrom(
      this.authService.validateSession({ accessSessionId: accessSessionId ?? '' }),
    );
  }
}
