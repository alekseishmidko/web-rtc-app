import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  LoginRequest,
  RefreshSessionRequest,
  RegisterRequest,
  ValidateSessionRequest,
} from '@web-rtc-nest/contracts';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // gRPC controller является транспортным слоем: он принимает protobuf payload
  // и делегирует все правила аутентификации/сессий в AuthService.
  @GrpcMethod('AuthService', 'Register')
  register(request: RegisterRequest) {
    return this.authService.register(request);
  }

  @GrpcMethod('AuthService', 'Login')
  login(request: LoginRequest) {
    return this.authService.login(request);
  }

  @GrpcMethod('AuthService', 'RefreshSession')
  refreshSession(request: RefreshSessionRequest) {
    return this.authService.refreshSession(request);
  }

  @GrpcMethod('AuthService', 'ValidateSession')
  validateSession(request: ValidateSessionRequest) {
    return this.authService.validateSession(request.accessSessionId);
  }
}
