'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, LockKeyhole } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) setError(decodeURIComponent(err));
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      router.push('/app');
    } catch (err: any) {
      if (err?.code === 'EMAIL_NOT_VERIFIED' || err?.status === 403) {
        router.push(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        return;
      }
      setError(err.message || 'Ошибка входа');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070a12] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <section className="relative hidden w-1/2 overflow-hidden border-r border-white/[0.07] lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,.18),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,.12),transparent_40%)]" />
          <Link href="/" className="relative z-10 flex items-center gap-2.5 text-lg font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Check className="h-5 w-5" strokeWidth={3} /></span>
            TaskFlow
          </Link>
          <div className="relative z-10 max-w-lg">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">С возвращением</p>
            <h1 className="text-5xl font-black tracking-tight">Продолжай с того места, где остановился.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-400">Все задачи, планы, привычки и цели уже ждут тебя внутри TaskFlow.</p>
          </div>
          <p className="relative z-10 text-xs text-slate-600">TaskFlow · продуктивность без лишнего шума</p>
        </section>

        <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-white">
              <ArrowLeft className="h-4 w-4" /> На главную
            </Link>

            <div className="mb-8 lg:hidden">
              <Link href="/" className="flex items-center gap-2.5 text-lg font-bold">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Check className="h-5 w-5" strokeWidth={3} /></span>
                TaskFlow
              </Link>
            </div>

            <div className="mb-8">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">Вход</h2>
              <p className="mt-2 text-sm text-slate-500">Войдите в свой аккаунт TaskFlow.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-3 text-sm text-red-300">{error}</div>}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" className="h-11 bg-white/[0.03] border-white/10" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Пароль</label>
                  <Link href="/forgot" className="text-xs text-primary transition hover:text-primary/80">
                    Забыли пароль?
                  </Link>
                </div>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Введите пароль" required autoComplete="current-password" className="h-11 bg-white/[0.03] border-white/10" />
              </div>

              <Button type="submit" className="h-11 w-full rounded-xl font-semibold" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Вход...</> : 'Войти'}
              </Button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-500">
              Нет аккаунта?{' '}
              <Link href="/register" className="font-medium text-primary transition hover:text-primary/80">Зарегистрироваться</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#070a12]" />}><LoginContent /></Suspense>;
}
