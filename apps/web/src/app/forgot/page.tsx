'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const CODE_LEN = 6;
const RESEND_COOLDOWN = 45;

type Step = 'email' | 'code' | 'password' | 'done';

function ForgotContent() {
  const router = useRouter();
  const { forgotPassword, verifyResetCode, resetPassword } = useAuthStore();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') inputsRef.current[0]?.focus();
  }, [step]);

  const sendCode = async (targetEmail: string) => {
    setError('');
    setInfo('');
    setIsLoading(true);
    try {
      const res = await forgotPassword(targetEmail);
      setInfo(res.message);
      if (res.devCode) setInfo(`Dev-режим: ваш код ${res.devCode}`);
      setStep('code');
      setCooldown(RESEND_COOLDOWN);
    } catch (err: any) {
      const m = err.message || 'Не удалось отправить код';
      setError(m);
      const wait = /через (\d+) сек/.exec(m)?.[1];
      if (wait) setCooldown(Number(wait));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isLoading) return;
    void sendCode(email.trim());
  };

  const handleDigitChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }
    if (clean.length > 1) {
      const chars = clean.slice(0, CODE_LEN).split('');
      setDigits((prev) => {
        const next = [...prev];
        chars.forEach((ch, i) => {
          if (index + i < CODE_LEN) next[index + i] = ch;
        });
        return next;
      });
      inputsRef.current[Math.min(index + chars.length, CODE_LEN - 1)]?.focus();
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });
    if (index < CODE_LEN - 1) inputsRef.current[index + 1]?.focus();
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigits((prev) => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
      } else if (index > 0) {
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
        inputsRef.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LEN);
    if (!text) return;
    e.preventDefault();
    setDigits(text.split('').concat(Array(CODE_LEN).fill('')).slice(0, CODE_LEN));
    inputsRef.current[Math.min(text.length, CODE_LEN - 1)]?.focus();
  };

  const code = digits.join('');

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== CODE_LEN || isLoading) return;
    setError('');
    setIsLoading(true);
    try {
      const token = await verifyResetCode(email.trim(), code);
      setResetToken(token);
      setStep('password');
    } catch (err: any) {
      setError(err.message || 'Неверный код');
      setDigits(Array(CODE_LEN).fill(''));
      inputsRef.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(resetToken, password);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Не удалось изменить пароль');
    } finally {
      setIsLoading(false);
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
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Восстановление доступа</p>
            <h1 className="text-5xl font-black tracking-tight">Вернём вас в работу.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-400">Код на почту, новый пароль — и вы снова внутри TaskFlow.</p>
          </div>
          <p className="relative z-10 text-xs text-slate-600">TaskFlow · продуктивность без лишнего шума</p>
        </section>

        <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <Link href="/login" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Назад ко входу
            </Link>

            <div className="mb-8">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                {step === 'done' ? <ShieldCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
              </div>
              <h2 className="text-3xl font-bold tracking-tight">
                {step === 'email' && 'Восстановление пароля'}
                {step === 'code' && 'Введите код'}
                {step === 'password' && 'Новый пароль'}
                {step === 'done' && 'Пароль изменён'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {step === 'email' && 'Укажите почту аккаунта — отправим код.'}
                {step === 'code' && (
                  <>Мы отправили код на <span className="font-medium text-slate-300">{email}</span></>
                )}
                {step === 'password' && 'Придумайте новый пароль для входа.'}
                {step === 'done' && 'Пароль успешно изменён. Можно входить.'}
              </p>
            </div>

            {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-3 text-sm text-red-300">{error}</div>}
            {info && <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-300">{info}</div>}

            {step === 'email' && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Email</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" className="h-11 bg-white/[0.03] border-white/10" />
                </div>
                <Button type="submit" className="h-11 w-full rounded-xl font-semibold" disabled={isLoading || !email.trim()}>
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Отправка...</> : 'Отправить код'}
                </Button>
              </form>
            )}

            {step === 'code' && (
              <form onSubmit={handleCodeSubmit} className="space-y-5">
                <div className="flex justify-between gap-2" onPaste={handlePaste}>
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        inputsRef.current[i] = el;
                      }}
                      value={d}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(i, e)}
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
                <Button type="submit" className="h-11 w-full rounded-xl font-semibold" disabled={code.length !== CODE_LEN || isLoading}>
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Проверка...</> : 'Проверить код'}
                </Button>
                <p className="text-center text-sm text-slate-500">
                  {cooldown > 0 ? (
                    <span>Отправить повторно через {cooldown} сек.</span>
                  ) : (
                    <button type="button" onClick={() => void sendCode(email.trim())} className="font-medium text-primary transition hover:text-primary/80">
                      Отправить код повторно
                    </button>
                  )}
                </p>
              </form>
            )}

            {step === 'password' && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Новый пароль</label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 6 символов" required minLength={6} autoComplete="new-password" className="h-11 bg-white/[0.03] border-white/10" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Повторите пароль</label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Повторите пароль" required minLength={6} autoComplete="new-password" className="h-11 bg-white/[0.03] border-white/10" />
                </div>
                <Button type="submit" className="h-11 w-full rounded-xl font-semibold" disabled={isLoading}>
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Сохранение...</> : 'Изменить пароль'}
                </Button>
              </form>
            )}

            {step === 'done' && (
              <div className="space-y-4">
                <Button className="h-11 w-full rounded-xl font-semibold" onClick={() => router.push('/app')}>
                  Перейти в TaskFlow
                </Button>
                <p className="text-center text-sm text-slate-500">
                  или <Link href="/login" className="font-medium text-primary">войти под другим аккаунтом</Link>
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function ForgotPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#070a12]" />}><ForgotContent /></Suspense>;
}
