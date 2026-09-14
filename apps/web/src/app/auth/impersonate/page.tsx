'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Loader2 } from 'lucide-react';

// Admin "login as user": opened in a separate tab via
// /auth/impersonate#token=<short-lived JWT from POST /admin/users/:id/impersonate>.
// The token lives in the URL fragment so it never hits server logs.
function ImpersonateInner() {
  const router = useRouter();
  const { checkAuth } = useAuthStore();
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const m = hash.match(/token=([^&]+)/);
      const token = m ? decodeURIComponent(m[1]) : '';
      if (!token) {
        setError('Токен не получен');
        return;
      }
      // Drop the fragment immediately so the token doesn't linger in history.
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {}
      api.setToken(token);
      checkAuth()
        .then(() => {
          try {
            setEmail(useAuthStore.getState().user?.email || '');
          } catch {}
          router.replace('/app');
        })
        .catch(() => {
          setError('Не удалось войти (токен истёк — запросите вход заново)');
          api.setToken(null);
        });
    } catch {
      setError('Не удалось войти');
    }
  }, [checkAuth, router]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <a href="/login" className="text-primary hover:underline text-sm">
          Вернуться ко входу
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        {email ? `Вход в аккаунт ${email}…` : 'Вход в аккаунт пользователя…'}
      </p>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ImpersonateInner />
    </Suspense>
  );
}
