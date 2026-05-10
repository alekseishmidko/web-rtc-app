import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthResponse } from '@web-rtc-nest/contracts';

type SameSite = 'lax' | 'strict' | 'none';

type CookieOptions = {
  httpOnly: boolean;
  maxAge: number;
  path: string;
  sameSite: SameSite;
  secure: boolean;
};

export type CookieResponse = {
  cookie(name: string, value: string, options: CookieOptions): void;
};

export type CookieRequest = {
  headers: {
    cookie?: string | string[];
  };
};

@Injectable()
export class AuthCookieService {
  private readonly accessCookieMaxAgeMs: number;
  private readonly refreshCookieMaxAgeMs: number;
  private readonly secure: boolean;

  constructor(configService: ConfigService) {
    // Cookie TTL должен совпадать с Redis TTL в auth-service. Если cookie живет
    // дольше Redis-ключа, браузер будет отправлять уже невалидную сессию.
    this.accessCookieMaxAgeMs =
      Number(configService.getOrThrow<string>('ACCESS_SESSION_COOKIE_MAX_AGE_SECONDS')) * 1000;
    this.refreshCookieMaxAgeMs =
      Number(configService.getOrThrow<string>('REFRESH_SESSION_COOKIE_MAX_AGE_SECONDS')) * 1000;

    // В production COOKIE_SECURE должен быть true, иначе браузер будет отправлять
    // session cookies по HTTP. Для localhost/dev оставляем false.
    this.secure = configService.get<string>('COOKIE_SECURE') === 'true';
  }

  setAuthCookies(response: CookieResponse, authResponse: AuthResponse) {
    // Gateway ставит cookies сам, чтобы session ids не попадали в browser JS.
    // Это снижает риск кражи сессии при XSS: HttpOnly cookie нельзя прочитать
    // через document.cookie.
    response.cookie('accessSessionId', authResponse.accessSessionId, {
      httpOnly: true,
      maxAge: this.accessCookieMaxAgeMs,

      // Access session нужна разным API endpoints, поэтому path широкий.
      path: '/',
      sameSite: 'lax',
      secure: this.secure,
    });

    response.cookie('refreshSessionId', authResponse.refreshSessionId, {
      httpOnly: true,
      maxAge: this.refreshCookieMaxAgeMs,

      // Refresh session сильнее access session: ограничиваем отправку cookie
      // только endpoint'ом ротации, чтобы она не уходила на каждый API request.
      path: '/api/auth/sessions/refresh',
      sameSite: 'lax',
      secure: this.secure,
    });
  }

  getAccessSessionId(request: CookieRequest) {
    return this.getCookieValue(request, 'accessSessionId');
  }

  getRefreshSessionId(request: CookieRequest) {
    return this.getCookieValue(request, 'refreshSessionId');
  }

  private getCookieValue(request: CookieRequest, name: string) {
    // Не подключаем cookie-parser глобально: auth module читает только две
    // нужные cookie вручную и не добавляет middleware на весь gateway.
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return undefined;
    }

    const rawCookie = Array.isArray(cookieHeader) ? cookieHeader.join(';') : cookieHeader;
    const cookies = rawCookie.split(';');

    for (const cookie of cookies) {
      const [rawName, ...rawValue] = cookie.trim().split('=');

      if (rawName === name) {
        // Значение cookie может быть percent-encoded браузером/клиентом.
        return decodeURIComponent(rawValue.join('='));
      }
    }

    return undefined;
  }
}
