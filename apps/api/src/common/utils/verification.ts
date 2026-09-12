import crypto from 'crypto';
import { prisma } from './prisma';
import { AppError } from '../middleware/error-handler';

export const CODE_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 45 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_ACTIVE_CODES = 5;

export type CodePurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

export function generateCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function issueCode(emailRaw: string, purpose: CodePurpose): Promise<string> {
  const email = normalizeEmail(emailRaw);
  const now = new Date();

  const recent = await prisma.verificationCode.findFirst({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });

  if (recent && now.getTime() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now.getTime() - recent.createdAt.getTime())) / 1000);
    throw new AppError(429, `Повторная отправка будет доступна через ${wait} сек.`, 'RESEND_COOLDOWN');
  }

  const activeCount = await prisma.verificationCode.count({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: now } },
  });
  if (activeCount >= MAX_ACTIVE_CODES) {
    throw new AppError(429, 'Слишком много запросов. Попробуйте позже.', 'RATE_LIMITED');
  }

  await prisma.verificationCode.updateMany({
    where: { email, purpose, consumedAt: null },
    data: { consumedAt: now },
  });

  const code = generateCode();
  await prisma.verificationCode.create({
    data: {
      email,
      purpose,
      codeHash: hashCode(code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });

  return code;
}

export async function consumeCode(emailRaw: string, purpose: CodePurpose, codeRaw: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  const code = codeRaw.trim();
  if (!/^\d{6}$/.test(code)) {
    throw new AppError(400, 'Неверный код. Проверьте и попробуйте снова.', 'INVALID_CODE');
  }

  const now = new Date();
  const record = await prisma.verificationCode.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    throw new AppError(400, 'Код не найден или уже использован. Запросите новый.', 'INVALID_CODE');
  }

  if (record.expiresAt.getTime() <= now.getTime()) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: now },
    });
    throw new AppError(400, 'Срок действия кода истёк. Запросите новый.', 'CODE_EXPIRED');
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: now },
    });
    throw new AppError(429, 'Превышено число попыток. Запросите новый код.', 'TOO_MANY_ATTEMPTS');
  }

  const ok = crypto.timingSafeEqual(
    Buffer.from(record.codeHash, 'hex'),
    Buffer.from(hashCode(code), 'hex')
  );

  if (!ok) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(400, 'Неверный код. Проверьте и попробуйте снова.', 'INVALID_CODE');
  }

  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { consumedAt: now },
  });
}

export async function invalidateCodes(emailRaw: string, purpose: CodePurpose): Promise<void> {
  await prisma.verificationCode.updateMany({
    where: { email: normalizeEmail(emailRaw), purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}
