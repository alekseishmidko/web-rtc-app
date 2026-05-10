import { Injectable } from '@nestjs/common';
import { hash, verify } from 'argon2';

@Injectable()
export class PasswordService {
  async hash(password: string) {
    // Пароль никогда не сохраняется в Postgres в открытом виде. Argon2 сам
    // генерирует salt и сохраняет параметры алгоритма внутри hash-строки.
    return hash(password);
  }

  async verify(password: string, passwordHash: string) {
    if (!passwordHash.startsWith('$argon2')) {
      return false;
    }

    return verify(passwordHash, password);
  }
}
