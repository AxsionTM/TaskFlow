import crypto from 'crypto';
import { prisma } from './prisma';
import { AppError } from '../middleware/error-handler';

/**
 * Anti-abuse для регистрации: временные ограничения по IP/частоте,
 * без вечных банов (один IP могут делить легитимные пользователи).
 * Храним только хеши (sha256 + секрет как перец), TTL 24 часа.
 * Всё настраивается через env без переписывания логики.
 */

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  // 0 — валидное значение (например, отключить задержку в тестах).
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export const abuseConfig = {
  /** максимум регистраций с одного IP в час */
  get maxPerHourIp() {
    return num('REG_MAX_PER_HOUR_IP', 10);
  },
  /** максимум разных email с одного IP в час */
  get maxEmailsPerHourIp() {
    return num('REG_MAX_EMAILS_PER_HOUR_IP', 10);
  },
  /** минимальная пауза между попытками с одного IP, сек */
  get minIntervalSec() {
    return num('REG_MIN_INTERVAL_SEC', 20);
  },
  /** время жизни pending-регистрации, минут */
  get pendingTtlMin() {
    return num('REG_PENDING_TTL_MIN', 30);
  },
  /** минимальное время от создания pending до подтверждения, сек (anti-bot) */
  get minVerifyDelaySec() {
    return num('REG_MIN_VERIFY_DELAY_SEC', 3);
  },
  /** окно хранения abuse-сигналов, часов */
  get retentionHours() {
    return num('REG_SIGNAL_RETENTION_HOURS', 24);
  },
};

function pepper(): string {
  return process.env.JWT_SECRET || 'abuse-pepper-dev-only';
}

export function hashSignal(value: string): string {
  return crypto.createHash('sha256').update(`${pepper()}|${value}`).digest('hex');
}

export function clientIpHash(req: { headers: any; ip?: string }): string {
  const xff = req.headers?.['x-forwarded-for'];
  const ip = (typeof xff === 'string' && xff.length ? xff.split(',')[0].trim() : req.ip || '').slice(0, 64);
  return hashSignal(`ip:${ip}`);
}

/** Записать попытку + почистить протухшие сигналы (bounded cleanup). */
export async function recordAttempt(ipHash: string, email?: string): Promise<void> {
  const cutoff = new Date(Date.now() - abuseConfig.retentionHours * 60 * 60 * 1000);
  await prisma.registrationAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
  await prisma.registrationAttempt.create({
    data: { ipHash, emailHash: email ? hashSignal(`email:${email.toLowerCase()}`) : null },
  });
}

/** Проверки перед созданием pending. Бросает 429 при превышении. */
export async function checkRegistrationAbuse(ipHash: string, email: string): Promise<void> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.registrationAttempt.findMany({
    where: { ipHash, createdAt: { gte: hourAgo } },
    select: { emailHash: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  if (recent.length >= abuseConfig.maxPerHourIp) {
    throw new AppError(429, 'Слишком много регистраций. Попробуйте позже.', 'RATE_LIMITED');
  }
  const distinctEmails = new Set(recent.map((r) => r.emailHash).filter(Boolean));
  distinctEmails.add(hashSignal(`email:${email.toLowerCase()}`));
  if (distinctEmails.size > abuseConfig.maxEmailsPerHourIp) {
    throw new AppError(429, 'Слишком много регистраций. Попробуйте позже.', 'RATE_LIMITED');
  }
  const last = recent[0];
  if (last && Date.now() - last.createdAt.getTime() < abuseConfig.minIntervalSec * 1000) {
    throw new AppError(429, 'Подождите немного перед следующей попыткой.', 'RATE_LIMITED');
  }

  // Протухшие pending не копятся: чистим при каждом обращении.
  await prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
}
