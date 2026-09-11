import jwt from 'jsonwebtoken';
import { AppError } from '../middleware/error-handler';

/**
 * Единый доступ к JWT-секрету. В production без JWT_SECRET
 * приложение падает при старте (см. main.ts) — сюда с fallback
 * оно дойти не должно; здесь защита на случай прямого вызова.
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError(500, 'Серверная ошибка конфигурации');
    }
    return 'dev-only-insecure-fallback-secret';
  }
  return secret;
}

export interface TokenPayload {
  userId: string;
  purpose?: string;
  v?: number;
  iat?: number;
}

export function signToken(payload: object, expiresIn: string): string {
  return jwt.sign(payload, jwtSecret(), { algorithm: 'HS256', expiresIn } as any);
}

/** Проверяет подпись, срок и ЯВНО алгоритм (отклоняет alg=none и др.). */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }) as TokenPayload;
}
