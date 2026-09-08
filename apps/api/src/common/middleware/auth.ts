import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { AppError } from './error-handler';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
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
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret'
    ) as { userId: string };

    // Проверяем существование, роль и блокировку на каждый запрос:
    // заблокированный пользователь мгновенно теряет доступ к API,
    // даже если JWT ещё не истёк.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isBlocked: true },
    });

    if (!user) {
      return next(new AppError(401, 'Недействительный токен'));
    }

    if (user.isBlocked) {
      return next(new AppError(403, 'Аккаунт заблокирован', 'ACCOUNT_BLOCKED'));
    }

    req.userId = user.id;
    req.userRole = user.role;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, 'Недействительный токен'));
  }
}
