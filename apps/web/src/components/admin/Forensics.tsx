'use client';

import { useCallback, useEffect, useState } from 'react';
import { SearchCheck, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton, EmptyState } from './ui';
import { cn } from '@/lib/utils';

type Toast = (text: string, ok?: boolean) => void;

function fmtDT(v: any): string {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function TaskRow({ t, extra }: { t: any; extra?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs">
      <span className="min-w-0 flex-1 truncate">{t.title || '(без названия)'}</span>
      {extra ? <span className="shrink-0 text-muted-foreground">{extra}</span> : null}
      <span
        className={cn(
          'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold',
          t.status === 'COMPLETED'
            ? 'bg-emerald-500/15 text-emerald-400'
            : t.isDeleted || extra === 'удалена'
            ? 'bg-red-500/15 text-red-400'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {t.status}
      </span>
    </div>
  );
}

export function Forensics({ userId, toast }: { userId: string; toast: Toast }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.adminUserForensics(userId));
    } catch (e: any) {
      toast(e.message || 'Не удалось загрузить форензику', false);
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!data) return <EmptyState text="Нет данных" />;

  const c = data.counts;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <SearchCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Куда делись задачи — сводка</h3>
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            Обновить
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-5">
          {[
            ['Активных', c.active, 'text-foreground'],
            ['Выполнено', c.completed, 'text-emerald-400'],
            ['Удалено', c.deleted, 'text-red-400'],
            ['Повторяющихся', c.recurring, 'text-sky-300'],
            ['Напоминаний ждёт', c.pendingReminders, 'text-amber-300'],
          ].map(([label, v, cls]) => (
            <div key={label as string} className="rounded-xl bg-muted/30 p-2.5">
              <div className={cn('text-base font-bold tabular-nums', cls as string)}>{v as number}</div>
              <div className="text-muted-foreground">{label as string}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Выполненные задачи никуда не исчезают из базы — они скрыты фильтрами списков. Удалённые лежат в
          корзине пользователя. Повторяющаяся серия исчезает из всех видов только если завершена целиком.
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">Недавно выполненные</h3>
        {data.recentCompleted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет</p>
        ) : (
          <div className="space-y-1.5">
            {data.recentCompleted.map((t: any) => (
              <TaskRow key={t.id} t={t} extra={fmtDT(t.completedAt)} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">Недавно удалённые</h3>
        {data.recentDeleted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет</p>
        ) : (
          <div className="space-y-1.5">
            {data.recentDeleted.map((t: any) => (
              <TaskRow key={t.id} t={{ ...t, isDeleted: true }} extra={fmtDT(t.deletedAt)} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">Повторяющиеся серии</h3>
        {data.recurring.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет активных серий</p>
        ) : (
          <div className="space-y-1.5">
            {data.recurring.map((t: any) => (
              <TaskRow key={t.id} t={t} extra={t.recurrenceType} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">Действия админов по пользователю</h3>
        {data.adminActions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет записей в Audit Log</p>
        ) : (
          <div className="space-y-1.5">
            {data.adminActions.map((a: any) => (
              <div key={a.id} className="rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-300">{a.action}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{fmtDT(a.createdAt)}</span>
                </div>
                <div className="mt-0.5 truncate text-muted-foreground">
                  {a.adminEmail}
                  {a.description ? ` · ${a.description}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ForensicsLoader() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Загрузка…
    </div>
  );
}
