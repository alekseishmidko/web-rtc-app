import type { OnModuleInit } from '@nestjs/common';
import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { UserGrpcService, UserProfile } from '@web-rtc-nest/contracts';
import { firstValueFrom } from 'rxjs';
import { USER_GRPC_CLIENT } from '../../grpc/grpc-clients.module';
import { Auth, CurrentUser } from '../../shared';
import { UpdateUserProfileRequestDto, UserProfileDto } from './dto/user.dto';

@ApiTags('users')
@Controller('users')
export class UserController implements OnModuleInit {
  private userService!: UserGrpcService;

  constructor(@Inject(USER_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  /**
   * Получает gRPC-клиент user-service после инициализации Nest-модуля.
   *
   * Gateway не хранит пользовательский профиль и не ходит в БД напрямую:
   * он берет account id из auth-сессии и проксирует профильные операции
   * во внутренний user-service.
   */
  onModuleInit() {
    this.userService = this.client.getService<UserGrpcService>('UserService');
  }

  /**
   * Возвращает профиль текущего авторизованного пользователя.
   *
   * AuthGuard заранее валидирует access-session через auth-service и кладет
   * account id в request.user.id. По этому id user-service ищет запись users.
   */
  @Get('me/profile')
  @Auth()
  @ApiOperation({
    summary: 'Получить профиль текущего пользователя',
    description:
      'Возвращает профиль из user-service для account, который определен по текущей access-session cookie.',
  })
  @ApiResponse({ status: 200, type: UserProfileDto })
  getMyProfile(@CurrentUser('id') accountId: string): Promise<UserProfile> {
    return firstValueFrom(this.userService.getProfileByAccountId({ accountId }));
  }

  /**
   * Обновляет профиль текущего авторизованного пользователя.
   *
   * Пока профиль содержит только name, но этот endpoint остается местом для
   * будущих пользовательских настроек: аватар, язык, timezone и т.п.
   */
  @Patch('me/profile')
  @Auth()
  @ApiOperation({
    summary: 'Обновить профиль текущего пользователя',
    description:
      'Обновляет профиль в user-service для account, который определен по текущей access-session cookie.',
  })
  @ApiBody({ type: UpdateUserProfileRequestDto })
  @ApiResponse({ status: 200, type: UserProfileDto })
  updateMyProfile(
    @CurrentUser('id') accountId: string,
    @Body() body: UpdateUserProfileRequestDto,
  ): Promise<UserProfile> {
    return firstValueFrom(this.userService.updateProfile({ accountId, name: body.name }));
  }
}
