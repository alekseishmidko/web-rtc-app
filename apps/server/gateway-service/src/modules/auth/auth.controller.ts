import { Body, Controller, Inject, OnModuleInit, Post, Req, Res } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { AUTH_GRPC_CLIENT } from '../../grpc/grpc-clients.module';
import {
  AuthGrpcService,
} from '../../grpc/grpc-contracts';
import { AuthCookieService, CookieRequest, CookieResponse } from './auth-cookie.service';
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
  @ApiOperation({ summary: 'Register a user and create a Redis-backed session' })
  @ApiBody({ type: RegisterRequestDto })
  @ApiResponse({ status: 201, type: AuthUserResponseDto })
  async register(
    @Body() body: RegisterRequestDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    console.log('12')
    const authResponse = await firstValueFrom(this.authService.register(body));
    console.log(authResponse);
    this.authCookieService.setAuthCookies(response, authResponse);

    return { user: authResponse.user };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login a user and create a Redis-backed session' })
  @ApiBody({ type: LoginRequestDto })
  @ApiResponse({ status: 201, type: AuthUserResponseDto })
  async login(
    @Body() body: LoginRequestDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const authResponse = await firstValueFrom(this.authService.login(body));
    this.authCookieService.setAuthCookies(response, authResponse);

    return { user: authResponse.user };
  }

  @Post('sessions/refresh')
  @ApiOperation({ summary: 'Rotate a refresh session and issue a new session pair' })
  @ApiBody({ type: RefreshSessionRequestDto })
  @ApiCookieAuth('refreshSessionId')
  @ApiResponse({ status: 201, type: AuthUserResponseDto })
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
  @ApiOperation({ summary: 'Validate an existing Redis session' })
  @ApiBody({ type: ValidateSessionRequestDto })
  @ApiCookieAuth('accessSessionId')
  @ApiResponse({ status: 201, type: ValidateSessionResponseDto })
  validateSession(@Body() body: Partial<ValidateSessionRequestDto>, @Req() request: CookieRequest) {
    const accessSessionId =
      this.authCookieService.getAccessSessionId(request) ?? body.accessSessionId;

    return firstValueFrom(
      this.authService.validateSession({ accessSessionId: accessSessionId ?? '' }),
    );
  }
}
