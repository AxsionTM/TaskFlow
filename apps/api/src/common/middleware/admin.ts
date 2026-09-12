import { Response, NextFunction } from 'express';
import { AppError } from './error-handler';
import { AuthRequest } from './auth';

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.userId) {
    return next(new AppError(401, 'Требуется авторизация'));
  }
  if (req.userRole !== 'ADMIN') {
    return next(new AppError(403, 'Недостаточно прав'));
  }
  next();
}
