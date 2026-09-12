import crypto from 'crypto';
import { prisma } from './prisma';
import { AppError } from '../middleware/error-handler';


function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export const abuseConfig = {
  get maxPerHourIp() {
    return num('REG_MAX_PER_HOUR_IP', 10);
  },
  get maxEmailsPerHourIp() {
    return num('REG_MAX_EMAILS_PER_HOUR_IP', 10);
  },
  get minIntervalSec() {
    return num('REG_MIN_INTERVAL_SEC', 20);
  },
  get pendingTtlMin() {
    return num('REG_PENDING_TTL_MIN', 30);
  },
  get minVerifyDelaySec() {
    return num('REG_MIN_VERIFY_DELAY_SEC', 3);
  },
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

export async function recordAttempt(ipHash: string, email?: string): Promise<void> {
  const cutoff = new Date(Date.now() - abuseConfig.retentionHours * 60 * 60 * 1000);
  await prisma.registrationAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
  await prisma.registrationAttempt.create({
    data: { ipHash, emailHash: email ? hashSignal(`email:${email.toLowerCase()}`) : null },
  });
}

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

  await prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
}
