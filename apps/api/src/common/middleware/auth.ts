import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { verifyToken } from '../utils/jwt';
import { AppError } from './error-handler';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

// Кэш maintenance-флага, чтобы не ходить в БД на каждый запрос.
// TTL короткий: включение в админке видно пользователям за секунды.
let maintenanceCache: { value: boolean; message: string; at: number } | null = null;
const MAINTENANCE_CACHE_TTL = 5000;

export async function isMaintenanceOn(): Promise<{ enabled: boolean; message: string }> {
  const now = Date.now();
  if (maintenanceCache && now - maintenanceCache.at < MAINTENANCE_CACHE_TTL) {
    return { enabled: maintenanceCache.value, message: maintenanceCache.message };
  }
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'MAINTENANCE_MODE' } });
    const parsed = row ? (JSON.parse(row.value) as { enabled?: boolean; message?: string }) : null;
    maintenanceCache = {
      value: Boolean(parsed?.enabled),
      message: parsed?.message || 'TaskFlow временно находится на техническом обслуживании.',
      at: now,
    };
  } catch {
    maintenanceCache = { value: false, message: '', at: now };
  }
  return { enabled: maintenanceCache.value, message: maintenanceCache.message };
}

export function invalidateMaintenanceCache() {
  maintenanceCache = null;
}

export async function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError(401, 'Требуется авторизация'));
  }

  const token = header.slice(7);

  try {
    const payload = verifyToken(token);

    // Проверяем существование, роль и блокировку на каждый запрос:
    // заблокированный пользователь мгновенно теряет доступ к API,
    // даже если JWT ещё не истёк.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isBlocked: true, passwordChangedAt: true },
    });

    if (!user) {
      return next(new AppError(401, 'Недействительный токен'));
    }

    if (user.isBlocked) {
      return next(new AppError(403, 'Аккаунт заблокирован', 'ACCOUNT_BLOCKED'));
    }

    // Токены, выпущенные до смены пароля, больше недействительны.
    if (
      user.passwordChangedAt &&
      typeof payload.iat === 'number' &&
      payload.iat * 1000 < user.passwordChangedAt.getTime()
    ) {
      return next(new AppError(401, 'Пароль был изменён. Войдите снова.', 'PASSWORD_CHANGED'));
    }

    // Maintenance mode: администраторы продолжают работать, остальные — нет.
    // Реализовано на backend-уровне, а не скрытием интерфейса.
    if (user.role !== 'ADMIN') {
      const maintenance = await isMaintenanceOn();
      if (maintenance.enabled) {
        return next(new AppError(503, maintenance.message, 'MAINTENANCE'));
      }
    }

    req.userId = user.id;
    req.userRole = user.role;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, 'Недействительный токен'));
  }
}
