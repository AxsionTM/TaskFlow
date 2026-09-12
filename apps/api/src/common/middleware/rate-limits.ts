import rateLimit from 'express-rate-limit';

function tooMany(req: unknown, res: any) {
  void req;
  res.status(429).json({
    error: { message: 'Слишком много запросов. Попробуйте позже.', code: 'RATE_LIMITED' },
  });
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,

  skipSuccessfulRequests: true,
  handler: tooMany,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});

export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});

export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});

export const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});
