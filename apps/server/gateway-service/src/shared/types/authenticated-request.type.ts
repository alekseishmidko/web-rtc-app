import type { AuthUser } from '@web-rtc-nest/contracts';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};
