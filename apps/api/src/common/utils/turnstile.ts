/**
 * Cloudflare Turnstile: ТОЛЬКО server-side verification.
 * Secret key живёт только в env backend и никогда не уходит во frontend
 * (туда отдаётся лишь NEXT_PUBLIC_TURNSTILE_SITE_KEY).
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 8000;

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

function secret(): string {
  return process.env.TURNSTILE_SECRET_KEY || '';
}

export type TurnstileResult = { ok: true } | { ok: false; error: string };

export async function verifyTurnstileToken(token: string | undefined, ip?: string): Promise<TurnstileResult> {
  // Ключи не настроены: локальная разработка без капчи (с предупреждением
  // при старте). В production ключи обязательны — см. env-валидацию.
  if (!isTurnstileConfigured()) {
    return { ok: true };
  }
  if (!token) {
    return { ok: false, error: 'Подтвердите, что вы не робот' };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const body = new URLSearchParams({ secret: secret(), response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: 'Проверка временно недоступна. Попробуйте позже.' };
    const data = (await res.json()) as { success?: boolean; ['error-codes']?: string[] };
    if (data.success) return { ok: true };
    return { ok: false, error: 'Подтвердите, что вы не робот' };
  } catch {
    // Cloudflare недоступен: безопасно отклоняем (fail-closed при настроенных ключах).
    return { ok: false, error: 'Проверка временно недоступна. Попробуйте позже.' };
  }
}
