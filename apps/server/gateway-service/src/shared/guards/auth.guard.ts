import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { AuthGrpcService } from '@web-rtc-nest/contracts';
import { firstValueFrom } from 'rxjs';
import { AUTH_GRPC_CLIENT } from '../../grpc/grpc-clients.module';
import { ACCESS_SESSION_ID } from '../constants';
import type { AuthenticatedRequest } from '../types/authenticated-request.type';

@Injectable()
export class AuthGuard implements CanActivate, OnModuleInit {
  private authService: AuthGrpcService;

  constructor(
    @Inject(AUTH_GRPC_CLIENT)
    private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.authService = this.client.getService<AuthGrpcService>('AuthService');
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessSessionId = this.getAccessSessionId(request);

    if (!accessSessionId) {
      throw new UnauthorizedException('Access session is missing.');
    }

    const session = await firstValueFrom(this.authService.validateSession({ accessSessionId }));

    if (!session.valid || !session.user) {
      throw new UnauthorizedException('Access session is invalid.');
    }

    request.user = session.user;

    return true;
  }

  private getAccessSessionId(request: AuthenticatedRequest) {
    return this.getBearerSessionId(request) ?? this.getCookieValue(request, ACCESS_SESSION_ID);
  }

  private getBearerSessionId(request: AuthenticatedRequest) {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return undefined;
    }

    const [scheme, value] = authorization.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !value) {
      return undefined;
    }

    return value;
  }

  private getCookieValue(request: AuthenticatedRequest, name: string) {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return undefined;
    }

    const rawCookie = Array.isArray(cookieHeader) ? cookieHeader.join(';') : cookieHeader;
    const cookies = rawCookie.split(';');

    for (const cookie of cookies) {
      const [rawName, ...rawValue] = cookie.trim().split('=');

      if (rawName === name) {
        return decodeURIComponent(rawValue.join('='));
      }
    }

    return undefined;
  }
}
