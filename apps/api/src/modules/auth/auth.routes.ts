import 'dotenv/config';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { authMiddleware, AuthRequest } from '../../common/middleware/auth';
import { sendVerificationCode, isEmailConfigured } from '../../common/utils/mailer';
import { issueCode, consumeCode, invalidateCodes } from '../../common/utils/verification';
import { loginLimiter, registerLimiter } from '../../common/middleware/rate-limits';
import { signToken, verifyToken } from '../../common/utils/jwt';
import { verifyTurnstileToken } from '../../common/utils/turnstile';
import { abuseConfig, checkRegistrationAbuse, clientIpHash, recordAttempt } from '../../common/utils/abuse';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';

const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
  confirmPassword: z.string().min(1, 'Повторите пароль'),
  name: z.string().min(1).max(100).optional(),
  turnstileToken: z.string().max(4096).optional(),
});

// Строгий лимит для кодовых эндпоинтов: защита от перебора и спама письмами.
const codeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Слишком много запросов. Попробуйте позже.', code: 'RATE_LIMITED' } },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, 'Дата должна быть в формате YYYY-MM-DD');
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, 'Некорректная дата');
  }

  return date;
}

function generateToken(userId: string): string {
  return signToken({ userId }, '30d');
}

async function ensureInbox(userId: string) {
  const existing = await prisma.projectMember.findFirst({
    where: { userId, project: { isInbox: true } },
  });
  if (existing) return existing.projectId;

  const inbox = await prisma.project.create({
    data: {
      name: 'Входящие',
      isInbox: true,
      color: '#4A90D9',
      members: { create: { userId, role: 'OWNER' } },
    },
  });
  return inbox.id;
}

async function findOrCreateOAuthUser(params: {
  provider: string;
  providerAccountId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}) {
  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: params.provider,
        providerAccountId: params.providerAccountId,
      },
    },
    include: { user: true },
  });

  if (account) {
    return account.user;
  }

  let user = await prisma.user.findUnique({
    where: { email: params.email.toLowerCase() },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: params.email.toLowerCase(),
        name: params.name || params.email.split('@')[0],
        avatarUrl: params.avatarUrl,
        emailVerified: true, // email уже подтверждён провайдером (Google/GitHub)
      },
    });
    await ensureInbox(user.id);
  } else if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    user = { ...user, emailVerified: true };
  }

  await prisma.account.create({
    data: {
      userId: user.id,
      provider: params.provider,
      providerAccountId: params.providerAccountId,
    },
  });

  return user;
}

// Публичный статус обслуживания: нужен пользовательской части,
// чтобы показать maintenance-экран до/без авторизации.
// no-store: CDN/браузер не должны отдавать stale-статус после переключения.
router.get('/system/status', async (_req, res, next) => {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'MAINTENANCE_MODE' } });
    const parsed = row ? (JSON.parse(row.value) as { enabled?: boolean; message?: string }) : null;
    res.set('Cache-Control', 'no-store');
    res.json({
      maintenance: {
        enabled: Boolean(parsed?.enabled),
        message: parsed?.message || 'TaskFlow временно находится на техническом обслуживании.',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/providers', (_req, res) => {
  res.json({
    providers: {
      google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
  });
});

router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    if (data.password !== data.confirmPassword) {
      throw new AppError(400, 'Пароли не совпадают');
    }

    const email = data.email.toLowerCase();

    // 1. Turnstile: только server-side проверка, секрет не покидает backend.
    // Без пройденной капчи (при настроенных ключах) регистрация отклоняется.
    const xff = req.headers['x-forwarded-for'];
    const clientIp = (typeof xff === 'string' && xff.length ? xff.split(',')[0].trim() : req.ip) || undefined;
    const ts = await verifyTurnstileToken(data.turnstileToken, clientIp);
    if (!ts.ok) {
      throw new AppError(400, ts.error, 'TURNSTILE_FAILED');
    }

    // 2. Anti-abuse: временные лимиты по IP/частоте (без вечных банов).
    const ipHash = clientIpHash(req);
    await checkRegistrationAbuse(ipHash, email);

    // В production без настроенного SMTP регистрация бессмысленна
    // (код подтверждения не дойдёт) — отказываем до создания записей.
    if (process.env.NODE_ENV === 'production' && !isEmailConfigured()) {
      throw new AppError(503, 'Регистрация временно недоступна. Попробуйте позже.');
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'Пользователь с таким email уже существует');
    }

    // 3. Полноценный User НЕ создаём: только временная pending-запись с TTL.
    // PostgreSQL не забивается мусорными аккаунтами ботов.
    const passwordHash = await bcrypt.hash(data.password, 12);
    const now = new Date();
    await prisma.pendingRegistration.upsert({
      where: { email },
      update: {
        name: data.name || email.split('@')[0],
        passwordHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + abuseConfig.pendingTtlMin * 60 * 1000),
      },
      create: {
        email,
        name: data.name || email.split('@')[0],
        passwordHash,
        expiresAt: new Date(now.getTime() + abuseConfig.pendingTtlMin * 60 * 1000),
      },
    });

    await recordAttempt(ipHash, email);

    // Код подтверждения: пользователь активируется только после verify-email.
    // Токен сессии НЕ выдаём до подтверждения почты.
    const code = await issueCode(email, 'VERIFY_EMAIL');
    const mail = await sendVerificationCode({ to: email, code, kind: 'verify' });

    res.status(201).json({
      requiresVerification: true,
      email,
      emailSent: mail.sent,
      ...(mail.devCode ? { devCode: mail.devCode } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// --- Email verification ---

router.post('/verify-email', codeLimiter, async (req, res, next) => {
  try {
    const data = z
      .object({
        email: z.string().email('Некорректный email'),
        code: z.string().min(1, 'Введите код'),
      })
      .parse(req.body);

    const email = data.email.toLowerCase();

    // Новый flow: pending-регистрация превращается в полноценного User
    // ТОЛЬКО после успешного кода. До этого в users ничего нет.
    const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
    if (pending) {
      if (pending.expiresAt.getTime() <= Date.now()) {
        await prisma.pendingRegistration.delete({ where: { id: pending.id } }).catch(() => {});
        throw new AppError(400, 'Срок действия кода истёк. Зарегистрируйтесь снова.', 'CODE_EXPIRED');
      }
      // Anti-bot: слишком быстрое подтверждение после создания pending.
      if (Date.now() - pending.createdAt.getTime() < abuseConfig.minVerifyDelaySec * 1000) {
        throw new AppError(429, 'Подождите немного и попробуйте снова.', 'RATE_LIMITED');
      }
      await consumeCode(email, 'VERIFY_EMAIL', data.code);
      const now = new Date();
      const created = await prisma.user.create({
        data: {
          email,
          passwordHash: pending.passwordHash,
          name: pending.name || email.split('@')[0],
          emailVerified: true,
          emailVerifiedAt: now,
          lastActiveAt: now,
        },
      });
      await prisma.pendingRegistration.delete({ where: { id: pending.id } }).catch(() => {});
      const inboxId = await ensureInbox(created.id);
      const token = generateToken(created.id);
      return res.json({
        user: {
          id: created.id,
          email: created.email,
          name: created.name,
          theme: created.theme,
          locale: created.locale,
          emailVerified: true,
          role: created.role,
        },
        token,
        inboxId,
      });
    }

    // Legacy-путь: пользователи, созданные до pending-flow (уже в users,
    // но emailVerified=false). Новых таких больше не появляется.
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(400, 'Неверный код. Проверьте и попробуйте снова.', 'INVALID_CODE');
    }

    await consumeCode(user.email, 'VERIFY_EMAIL', data.code);
    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifiedAt: user.emailVerifiedAt || now, lastActiveAt: now },
    });

    const inboxId = await ensureInbox(user.id);
    const token = generateToken(user.id);

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        theme: updated.theme,
        locale: updated.locale,
        emailVerified: true,
        role: updated.role,
      },
      token,
      inboxId,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-code', codeLimiter, async (req, res, next) => {
  try {
    const data = z
      .object({
        email: z.string().email('Некорректный email'),
        purpose: z.enum(['verify', 'reset']).optional().default('verify'),
      })
      .parse(req.body);

    const email = data.email.toLowerCase();
    const target: 'VERIFY_EMAIL' | 'RESET_PASSWORD' =
      data.purpose === 'reset' ? 'RESET_PASSWORD' : 'VERIFY_EMAIL';

    const user = await prisma.user.findUnique({ where: { email } });

    // Pending-регистрация: продлеваем жизнь и шлём код заново.
    if (!user && target === 'VERIFY_EMAIL') {
      const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
      if (pending) {
        await prisma.pendingRegistration
          .update({
            where: { id: pending.id },
            data: { expiresAt: new Date(Date.now() + abuseConfig.pendingTtlMin * 60 * 1000) },
          })
          .catch(() => {});
        const code = await issueCode(email, target);
        const mail = await sendVerificationCode({ to: email, code, kind: 'verify' });
        return res.json({
          ok: true,
          emailSent: mail.sent,
          message: mail.sent
            ? 'Мы отправили код на вашу почту.'
            : 'Почтовый сервер не настроен. Используйте код из ответа (dev-режим).',
          ...(mail.devCode ? { devCode: mail.devCode } : {}),
        });
      }
    }

    // Не раскрываем существование аккаунта для reset; для verify тоже отвечаем
    // нейтрально, если пользователя нет.
    if (!user) {
      return res.json({ ok: true, message: 'Если аккаунт с таким email существует, мы отправили код.' });
    }

    if (target === 'VERIFY_EMAIL' && user.emailVerified) {
      return res.json({ ok: true, message: 'Почта уже подтверждена. Войдите в аккаунт.' });
    }

    const code = await issueCode(email, target);
    const mail = await sendVerificationCode({
      to: email,
      code,
      kind: target === 'VERIFY_EMAIL' ? 'verify' : 'reset',
    });

    res.json({
      ok: true,
      emailSent: mail.sent,
      message: mail.sent
        ? 'Мы отправили код на вашу почту.'
        : 'Почтовый сервер не настроен. Используйте код из ответа (dev-режим).',
      ...(mail.devCode ? { devCode: mail.devCode } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// --- Password recovery ---

const GENERIC_FORGOT_MESSAGE = 'Если аккаунт с таким email существует, мы отправили код.';

router.post('/forgot-password', codeLimiter, async (req, res, next) => {
  try {
    const data = z.object({ email: z.string().email('Некорректный email') }).parse(req.body);
    const email = data.email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });

    let devCode: string | undefined;
    if (user) {
      try {
        const code = await issueCode(email, 'RESET_PASSWORD');
        const mail = await sendVerificationCode({ to: email, code, kind: 'reset' });
        devCode = mail.devCode;
      } catch (err) {
        // Cooldown/rate-limit: не раскрываем детали сверх необходимого.
        if (err instanceof AppError && (err.statusCode === 429)) throw err;
      }
    }

    res.json({
      ok: true,
      message: GENERIC_FORGOT_MESSAGE,
      ...(devCode ? { devCode } : {}),
    });
  } catch (err) {
    next(err);
  }
});

function generateResetToken(userId: string, version: number): string {
  return signToken({ userId, purpose: 'password-reset', v: version }, '15m');
}

router.post('/verify-reset-code', codeLimiter, async (req, res, next) => {
  try {
    const data = z
      .object({
        email: z.string().email('Некорректный email'),
        code: z.string().min(1, 'Введите код'),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (!user) {
      throw new AppError(400, 'Неверный код. Проверьте и попробуйте снова.', 'INVALID_CODE');
    }

    await consumeCode(user.email, 'RESET_PASSWORD', data.code);
    const resetToken = generateResetToken(user.id, user.updatedAt.getTime());

    res.json({ ok: true, resetToken });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', codeLimiter, async (req, res, next) => {
  try {
    const data = z
      .object({
        resetToken: z.string().min(1, 'Отсутствует токен восстановления'),
        password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
        confirmPassword: z.string().min(1, 'Повторите пароль'),
      })
      .parse(req.body);

    if (data.password !== data.confirmPassword) {
      throw new AppError(400, 'Пароли не совпадают');
    }

    let payload: { userId: string; purpose?: string; v?: number };
    try {
      payload = verifyToken(data.resetToken);
    } catch {
      throw new AppError(400, 'Ссылка восстановления недействительна или истекла. Запросите новый код.', 'RESET_EXPIRED');
    }

    if (payload.purpose !== 'password-reset' || typeof payload.v !== 'number') {
      throw new AppError(400, 'Недействительный токен восстановления.', 'RESET_INVALID');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.updatedAt.getTime() !== payload.v) {
      throw new AppError(400, 'Токен восстановления уже использован или устарел. Запросите новый код.', 'RESET_EXPIRED');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: user.id },
      // Смена пароля доказывает владение почтой → подтверждаем её заодно.
      // passwordChangedAt инвалидирует все ранее выпущенные токены.
      data: { passwordHash, emailVerified: true, emailVerifiedAt: user.emailVerifiedAt || now, lastActiveAt: now, passwordChangedAt: now },
    });
    await invalidateCodes(updated.email, 'RESET_PASSWORD');

    const token = generateToken(user.id);
    res.json({
      ok: true,
      message: 'Пароль успешно изменён.',
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        theme: updated.theme,
        locale: updated.locale,
        emailVerified: true,
        role: updated.role,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (!user || !user.passwordHash) {
      throw new AppError(401, 'Неверный email или пароль');
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);

    if (!valid) {
      throw new AppError(401, 'Неверный email или пароль');
    }

    if (user.isBlocked) {
      throw new AppError(403, 'Аккаунт заблокирован. Обратитесь в поддержку.', 'ACCOUNT_BLOCKED');
    }

    if (!user.emailVerified) {
      throw new AppError(403, 'Почта не подтверждена. Введите код из письма.', 'EMAIL_NOT_VERIFIED');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

    // Вход администратора — в audit log (fire-and-forget).
    if (user.role === 'ADMIN') {
      const xff = req.headers['x-forwarded-for'];
      const ip = (typeof xff === 'string' && xff.length ? xff.split(',')[0].trim() : req.ip)?.slice(0, 64);
      void prisma.adminLog
        .create({
          data: {
            adminId: user.id,
            adminEmail: user.email,
            action: 'ADMIN_LOGIN',
            description: 'Вход администратора',
            ip,
          },
        })
        .catch(() => {});
    }

    const token = generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        theme: user.theme,
        locale: user.locale,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        theme: true,
        locale: true,
        birthday: true,
        emailVerified: true,
        role: true,
        plan: true,
        balance: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError(404, 'Пользователь не найден');
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/me', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      theme: z.string().optional(),
      locale: z.string().optional(),
      birthday: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
    });
    const data = schema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.theme !== undefined ? { theme: data.theme } : {}),
        ...(data.locale !== undefined ? { locale: data.locale } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.birthday !== undefined
          ? { birthday: data.birthday ? parseDateOnly(data.birthday) : null }
          : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        theme: true,
        locale: true,
        birthday: true,
        emailVerified: true,
        role: true,
        plan: true,
        balance: true,
        createdAt: true,
      },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// --- Google OAuth ---

router.get('/google', (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.redirect(
      `${FRONTEND_URL}/login?error=${encodeURIComponent('Google OAuth не настроен. Добавьте GOOGLE_CLIENT_ID в .env')}`
    );
  }

  const redirectUri = `${API_URL}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_denied`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${API_URL}/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_token_failed`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_profile_failed`);
    }

    const profile = (await profileRes.json()) as {
      id: string;
      email: string;
      name?: string;
      picture?: string;
    };

    if (!profile.email) {
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_no_email`);
    }

    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerAccountId: profile.id,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    });

    const token = generateToken(user.id);
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=oauth_error`);
  }
});

// --- GitHub OAuth ---

router.get('/github', (_req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.redirect(
      `${FRONTEND_URL}/login?error=${encodeURIComponent('GitHub OAuth не настроен. Добавьте GITHUB_CLIENT_ID в .env')}`
    );
  }

  const redirectUri = `${API_URL}/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'user:email',
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get('/github/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_denied`);
    }

    const clientId = process.env.GITHUB_CLIENT_ID!;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET!;

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_token_failed`);
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_token_failed`);
    }

    const profileRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!profileRes.ok) {
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_profile_failed`);
    }

    const profile = (await profileRes.json()) as {
      id: number;
      login: string;
      name?: string;
      email?: string;
      avatar_url?: string;
    };

    let email = profile.email;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
        const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
        email = primary?.email;
      }
    }

    if (!email) {
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_no_email`);
    }

    const user = await findOrCreateOAuthUser({
      provider: 'github',
      providerAccountId: String(profile.id),
      email,
      name: profile.name || profile.login,
      avatarUrl: profile.avatar_url,
    });

    const token = generateToken(user.id);
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=oauth_error`);
  }
});

export { router as authRouter };
