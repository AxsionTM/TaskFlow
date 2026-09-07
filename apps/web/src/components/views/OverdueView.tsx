'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTasksStore } from '@/stores/tasks';
import { TaskCard } from '@/components/tasks/TaskCard';

export function OverdueView() {
  const { overdueTasks, todayTasks, tasks, isLoading, fetchOverdue, fetchToday } = useTasksStore();

  useEffect(() => {
    fetchOverdue();
    fetchToday();
  }, [fetchOverdue, fetchToday]);

  const total = overdueTasks.length;
  const todayCount = todayTasks.filter((t: any) => t.status !== 'COMPLETED').length;
  const weekCount = tasks.filter((t: any) => {
    if (!t.dueDate || t.status === 'COMPLETED') return false;
    const due = new Date(t.dueDate).getTime();
    const now = Date.now();
    return due >= now - 30 * 86400000 && due <= now + 7 * 86400000;
  }).length;

  const tiles = [
    { value: total, label: 'Всего', color: '#a855f7' },
    { value: todayCount, label: 'Сегодня', color: '#3b82f6' },
    { value: weekCount, label: 'Неделя', color: '#ef4444' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <h2 className="text-2xl font-bold tracking-tight">Просроченные</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Задачи, которые нужно сделать</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {tiles.map((t) => (
            <div key={t.label} className="tf-glass rounded-2xl p-3 text-center">
              <div className="text-2xl font-bold tabular-nums" style={{ color: t.color }}>
                {t.value}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{t.label}</div>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : overdueTasks.length === 0 ? (
          <div className="tf-glass rounded-2xl flex flex-col items-center justify-center py-14 text-muted-foreground">
            <p className="text-sm">Просрочек нет — так держать!</p>
          </div>
        ) : (
          <div className="tf-glass rounded-2xl p-3 space-y-2 mb-4">
            {overdueTasks.map((task: any) => (
              <TaskCard key={task.id} task={task} ringColor="#ef4444" />
            ))}
          </div>
        )}

        <div className="tf-glass rounded-2xl p-4 flex items-center gap-3">
          <span className="text-3xl shrink-0" role="img" aria-label="Будильник">
            ⏰
          </span>
          <div>
            <p className="text-sm font-semibold">Не откладывай важное!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Даже небольшие задачи могут сильно повлиять на результат.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
