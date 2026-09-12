'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { useTasksStore } from '@/stores/tasks';
import { TaskCard } from '@/components/tasks/TaskCard';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';
import { BirthdayCards } from '@/components/birthdays/BirthdayCards';
import { mergeWithOccurrences } from '@/lib/recurrence';

export function plural(n: number, one: string, few: string, many: string): string {
  const m = Math.abs(n) % 100;
  const d = m % 10;
  if (m > 10 && m < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

export function TomorrowView() {
  const { tasks, recurringTasks, fetchRecurring, isLoading } = useTasksStore();
  const [open, setOpen] = useState(false);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateLabel = tomorrow.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const weekday = tomorrow.toLocaleDateString('ru-RU', { weekday: 'long' });

  useEffect(() => {
    fetchRecurring();
  }, [fetchRecurring]);

  const visibleTasks = useMemo(() => {
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    const dayKey = `${y}-${m}-${d}`;
    return mergeWithOccurrences(tasks, recurringTasks, dayKey, dayKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, recurringTasks]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Завтра</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {visibleTasks.length} {plural(visibleTasks.length, 'задача', 'задачи', 'задач')}
            </p>
          </div>
          <div className="hidden sm:block text-right shrink-0">
            <div className="text-sm font-medium capitalize">{dateLabel}</div>
            <div className="text-xs text-muted-foreground capitalize">{weekday}</div>
          </div>
        </div>

        <div className="tf-glass rounded-2xl p-3 mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="tf-btn-violet inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Добавить задачу
          </button>
        </div>

        <div className="mb-3">
          <BirthdayCards date={tomorrow} />
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="tf-glass rounded-2xl flex flex-col items-center justify-center py-14 text-muted-foreground">
            <p className="text-sm">На завтра ничего не запланировано</p>
            <p className="text-xs mt-1">Добавьте задачу кнопкой выше</p>
          </div>
        ) : (
          <div className="tf-glass rounded-2xl p-3 space-y-2">
            {visibleTasks.map((task: any) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
      <CreateTaskModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
