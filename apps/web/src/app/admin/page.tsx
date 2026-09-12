'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { AdminPanel } from '@/components/admin/AdminPanel';

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="tf-admin flex h-screen items-center justify-center bg-[#070a12]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  // Frontend-гейт — только для UX. Настоящая проверка роли выполняется
  // на backend в каждом /admin/* endpoint (requireAdmin).
  if (user && user.role !== 'ADMIN') {
    return (
      <div className="tf-admin flex min-h-screen flex-col items-center justify-center gap-4 bg-[#070a12] p-6 text-center text-white">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-bold">Нет доступа</h1>
        <p className="max-w-sm text-sm text-slate-400">
          Этот раздел доступен только администраторам TaskFlow.
        </p>
        <Link href="/app" className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold hover:bg-violet-500">
          Вернуться в приложение
        </Link>
      </div>
    );
  }

  return <AdminPanel />;
}
