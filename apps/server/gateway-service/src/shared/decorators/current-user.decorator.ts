import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@web-rtc-nest/contracts';
import type { AuthenticatedRequest } from '../types';

export const CurrentUser = createParamDecorator<keyof AuthUser | undefined>(
  (keys, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!keys) {
      return user;
    }

    return user?.[keys];
  },
);
