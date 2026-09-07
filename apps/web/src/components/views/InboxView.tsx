'use client';

import { useMemo, useState } from 'react';
import { Plus, Loader2, Inbox } from 'lucide-react';
import { useTasksStore } from '@/stores/tasks';
import { TaskCard } from '@/components/tasks/TaskCard';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';
import { cn } from '@/lib/utils';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'nodate', label: 'Без даты' },
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
];

export function InboxView() {
  const { tasks, isLoading } = useTasksStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');

  const visible = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const weekEnd = new Date(start);
    weekEnd.setDate(weekEnd.getDate() + 7);
    if (filter === 'nodate') return tasks.filter((t: any) => !t.dueDate && !t.startDate);
    if (filter === 'today')
      return tasks.filter((t: any) => {
        const raw = t.startDate || t.dueDate;
        if (!raw) return false;
        const d = new Date(raw).getTime();
        return d >= start.getTime() && d < start.getTime() + 86400000;
      });
    if (filter === 'week')
      return tasks.filter((t: any) => {
        const raw = t.startDate || t.dueDate;
        if (!raw) return false;
        const d = new Date(raw).getTime();
        return d >= start.getTime() && d <= weekEnd.getTime();
      });
    return tasks;
  }, [tasks, filter]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <h2 className="text-2xl font-bold tracking-tight">Входящие</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Новые задачи без даты</p>
        </div>

        <div className="tf-glass rounded-2xl p-3 mb-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="tf-btn-violet flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Добавить задачу
          </button>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'text-xs px-3.5 py-1.5 rounded-full border transition-all',
                  filter === f.id ? 'tf-chip-active' : 'tf-chip'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="tf-glass rounded-2xl flex flex-col items-center justify-center py-14 text-muted-foreground">
            <p className="text-sm">Входящие пусты</p>
            <p className="text-xs mt-1">Добавьте задачу кнопкой выше</p>
          </div>
        ) : (
          <div className="tf-glass rounded-2xl p-3 space-y-2 mb-4">
            {visible.map((task: any) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}

        <div className="tf-glass rounded-2xl p-4 flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ color: '#3b82f6', background: '#3b82f61a', border: '1px solid #3b82f655' }}
          >
            <Inbox className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Входящие задачи</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Здесь находятся все задачи, которые вы добавили без даты.
            </p>
          </div>
        </div>
      </div>
      <CreateTaskModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
