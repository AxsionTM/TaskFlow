import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { recordError } from '../utils/error-log';
import type { AuthRequest } from './auth';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if ((err as any)?.type === 'entity.too.large') {
    return res.status(413).json({
      error: { message: 'Запрос слишком большой', code: 'PAYLOAD_TOO_LARGE' },
    });
  }
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      recordError({
        endpoint: req.originalUrl || req.url,
        method: req.method,
        statusCode: err.statusCode,
        message: err.message,
        userId: (req as AuthRequest).userId,
      });
    }
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Ошибка валидации',
        details: err.errors,
      },
    });
  }

  console.error(err);
  recordError({
    endpoint: req.originalUrl || req.url,
    method: req.method,
    statusCode: 500,
    message: err.message || 'Internal error',
    stack: err.stack,
    userId: (req as AuthRequest).userId,
  });
  return res.status(500).json({
    error: {
      message: 'Внутренняя ошибка сервера',
    },
  });
}
