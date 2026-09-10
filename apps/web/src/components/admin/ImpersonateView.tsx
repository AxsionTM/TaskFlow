'use client';

import { useEffect, useState } from 'react';
import { Eye, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton } from './ui';

/**
 * Read-only просмотр аккаунта (View as User).
 * Только чтение: никаких кнопок действий, только список задач пользователя.
 * Открытие записывается в Audit Log на backend.
 */
export function ImpersonateView({
  userId,
  userEmail,
  onClose,
}: {
  userId: string;
  userEmail: string;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .adminImpersonate(userId)
      .catch(() => {})
      .finally(() => {});
    api
      .adminTasks({ userId, pageSize: '100' })
      .then((r) => setTasks(r.tasks))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [userId]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = tasks.filter(
    (t: any) => t.status !== 'COMPLETED' && t.dueDate && new Date(t.dueDate).getTime() < today.getTime()
  );
  const done = tasks.filter((t: any) => t.status === 'COMPLETED');

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#070a12]" role="dialog" aria-modal="true" aria-label="Просмотр аккаунта">
      <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">ADMIN MODE — вы просматриваете аккаунт {userEmail} (только чтение)</span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-amber-500/40 px-3 text-xs font-bold text-amber-200 hover:bg-amber-500/20"
        >
          <X className="h-4 w-4" /> Выйти из режима просмотра
        </button>
      </div>
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            У пользователя нет задач
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-2xl border border-border/60 bg-card/60 p-3"><div className="text-lg font-bold tabular-nums">{tasks.length}</div><div className="text-muted-foreground">всего</div></div>
              <div className="rounded-2xl border border-border/60 bg-card/60 p-3"><div className="text-lg font-bold tabular-nums text-red-400">{overdue.length}</div><div className="text-muted-foreground">просрочено</div></div>
              <div className="rounded-2xl border border-border/60 bg-card/60 p-3"><div className="text-lg font-bold tabular-nums text-emerald-400">{done.length}</div><div className="text-muted-foreground">выполнено</div></div>
            </div>
            <div className="space-y-1.5">
              {tasks.map((t: any) => (
                <div key={t.id} className="pointer-events-none flex items-center gap-2.5 rounded-xl border border-border/40 bg-card/60 px-3 py-2.5 select-none">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40">
                    {t.status === 'COMPLETED' && <Loader2 className="hidden h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{t.status}</span>
                </div>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Режим просмотра записывается в Audit Log. Действия от имени пользователя недоступны.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
