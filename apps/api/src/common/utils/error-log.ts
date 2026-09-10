import { prisma } from './prisma';

/** Вычищаем секреты из сообщений/стеков перед записью в БД. */
export function sanitizeErrorText(input: string): string {
  return input
    .replace(/(password["'\s:=]+)([^\s"',}]+)/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/=]+/g, '$1[redacted]')
    .replace(/((?:DATABASE_URL|JWT_SECRET|EMAIL_PASSWORD|API_KEY)[^=\n]*=)([^\s]+)/gi, '$1[redacted]')
    .replace(/(Cookie:\s*)([^\n]+)/gi, '$1[redacted]')
    .slice(0, 2000);
}

/**
 * Группирующая запись ошибки (fire-and-forget, никогда не бросает).
 * Вызывается только для 5xx из глобального errorHandler.
 */
export function recordError(input: {
  endpoint: string;
  method: string;
  statusCode: number;
  message: string;
  stack?: string;
  userId?: string;
}): void {
  const message = sanitizeErrorText(input.message || 'Unknown error').slice(0, 500);
  const endpoint = input.endpoint.slice(0, 200);
  void (async () => {
    try {
      const now = new Date();
      // Дедуплика за последние 24ч: наращиваем счётчик вместо новой строки.
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const existing = await prisma.errorLog.findFirst({
        where: {
          endpoint,
          method: input.method,
          statusCode: input.statusCode,
          message,
          lastSeen: { gte: since },
        },
        orderBy: { lastSeen: 'desc' },
      });
      if (existing) {
        await prisma.errorLog.update({
          where: { id: existing.id },
          data: { count: { increment: 1 }, lastSeen: now },
        });
        return;
      }
      await prisma.errorLog.create({
        data: {
          endpoint,
          method: input.method,
          statusCode: input.statusCode,
          message,
          stack: input.stack ? sanitizeErrorText(input.stack) : undefined,
          userId: input.userId,
        },
      });
    } catch {
      // Логирование ошибок не должно ломать ответы API.
    }
  })();
}
