import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import type { UserRole } from '@web-rtc-nest/contracts';
import { ACCESS_SESSION_ID } from '../constants';
import { AuthGuard } from '../guards';
import { RolesGuard } from '../guards';
import { Roles } from './roles.decorator';

export const Auth = (...roles: UserRole[]) => {
  const decorators = [ApiCookieAuth(ACCESS_SESSION_ID), UseGuards(AuthGuard, RolesGuard)];

  if (roles.length > 0) {
    decorators.push(Roles(...roles));
  }

  return applyDecorators(...decorators);
};
