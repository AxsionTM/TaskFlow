'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, MailCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CODE_LEN = 6;
const RESEND_COOLDOWN = 45;

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verifyEmail, resendCode, pendingVerificationEmail } = useAuthStore();

  const initialEmail = searchParams.get('email') || pendingVerificationEmail || '';
  const [email] = useState(initialEmail);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const setDigit = useCallback((index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      setDigit(index, '');
      return;
    }
    // Вставка целого кода — раскладываем по полям
    if (clean.length > 1) {
      const chars = clean.slice(0, CODE_LEN).split('');
      setDigits((prev) => {
        const next = [...prev];
        chars.forEach((ch, i) => {
          if (index + i < CODE_LEN) next[index + i] = ch;
        });
        return next;
      });
      const last = Math.min(index + chars.length, CODE_LEN - 1);
      inputsRef.current[last]?.focus();
      return;
    }
    setDigit(index, clean);
    if (index < CODE_LEN - 1) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigit(index, '');
      } else if (index > 0) {
        setDigit(index - 1, '');
        inputsRef.current[index - 1]?.focus();
      }
    }
    if (e.key === 'ArrowLeft' && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < CODE_LEN - 1) inputsRef.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LEN);
    if (!text) return;
    e.preventDefault();
    setDigits(text.split('').concat(Array(CODE_LEN).fill('')).slice(0, CODE_LEN));
    inputsRef.current[Math.min(text.length, CODE_LEN - 1)]?.focus();
  };

  const code = digits.join('');
  const complete = code.length === CODE_LEN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complete || isLoading || !email) return;
    setError('');
    setInfo('');
    setIsLoading(true);
    try {
      await verifyEmail(email, code);
      router.push('/app');
    } catch (err: any) {
      setError(err.message || 'Не удалось подтвердить почту');
      setDigits(Array(CODE_LEN).fill(''));
      inputsRef.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;
    setError('');
    setInfo('');
    try {
      const res = await resendCode(email, 'verify');
      setInfo(res.message);
      if (res.devCode) setInfo(`Dev-режим: ваш код ${res.devCode}`);
      setCooldown(RESEND_COOLDOWN);
    } catch (err: any) {
      const m = err.message || 'Не удалось отправить код';
      setError(m);
      const wait = /через (\d+) сек/.exec(m)?.[1];
      if (wait) setCooldown(Number(wait));
    }
  };

  return (
    <main className="min-h-screen bg-[#070a12] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <section className="relative hidden w-1/2 overflow-hidden border-r border-white/[0.07] lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,.18),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,.14),transparent_40%)]" />
          <Link href="/" className="relative z-10 flex items-center gap-2.5 text-lg font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Check className="h-5 w-5" strokeWidth={3} /></span>
            TaskFlow
          </Link>
          <div className="relative z-10 max-w-lg">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Почти готово</p>
            <h1 className="text-5xl font-black tracking-tight">Подтвердите вашу почту.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-400">Мы отправили 6-значный код. Введите его, чтобы активировать аккаунт.</p>
          </div>
          <p className="relative z-10 text-xs text-slate-600">TaskFlow · продуктивность без лишнего шума</p>
        </section>

        <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <Link href="/register" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Изменить email
            </Link>

            <div className="mb-8">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <MailCheck className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">Подтверждение почты</h2>
              <p className="mt-2 text-sm text-slate-500">
                Мы отправили код на<br />
                <span className="font-medium text-slate-300">{email || 'вашу почту'}</span>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-3 text-sm text-red-300">{error}</div>}
              {info && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-300">{info}</div>}

              <div className="flex justify-between gap-2" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el;
                    }}
                    value={d}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={6}
                    aria-label={`Цифра ${i + 1}`}
                    className={cn(
                      'h-12 w-full rounded-xl border bg-white/[0.03] text-center text-xl font-bold tabular-nums outline-none transition',
                      'border-white/10 focus:border-primary focus:ring-2 focus:ring-primary/30'
                    )}
                  />
                ))}
              </div>

              <Button type="submit" className="h-11 w-full rounded-xl font-semibold" disabled={!complete || isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Проверка...</> : 'Подтвердить'}
              </Button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-500">
              Не получили код?{' '}
              {cooldown > 0 ? (
                <span className="text-slate-400">Отправить повторно через {cooldown} сек.</span>
              ) : (
                <button type="button" onClick={handleResend} className="font-medium text-primary transition hover:text-primary/80">
                  Отправить повторно
                </button>
              )}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#070a12]" />}><VerifyContent /></Suspense>;
}
