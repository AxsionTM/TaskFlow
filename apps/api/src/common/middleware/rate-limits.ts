import rateLimit from 'express-rate-limit';

/**
 * Per-route лимиты поверх глобального (500/15мин).
 * Используется стандартный IP-ключ лимитера (корректен для IPv6 из коробки).
 * На Vercel (serverless) MemoryStore работает в пределах инстанса —
 * это базовая защита, а не распределённый лимит (документировано).
 */
function tooMany(req: unknown, res: any) {
  void req;
  res.status(429).json({
    error: { message: 'Слишком много запросов. Попробуйте позже.', code: 'RATE_LIMITED' },
  });
}

/** Логин/регистрация: жёстко против брутфорса и спама. Успешные не считаются. */
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

/** AI: дорого и нагружает внешний сервис. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});

/** Массовые записи (задачи/проекты/заметки/привычки/цели/теги). */
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});

/** Экспорт: тяжёлые выборки. */
export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});

/** Импорт: тяжёлый парсинг + массовая запись. */
export const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});

/** Админка: редкие, но пачками (таблицы с пагинацией). */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,

  handler: tooMany,
});
