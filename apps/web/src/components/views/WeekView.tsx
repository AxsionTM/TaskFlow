'use client';

import { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useTasksStore } from '@/stores/tasks';
import { TaskCard } from '@/components/tasks/TaskCard';
import { plural } from '@/components/views/TomorrowView';
import { TagIcon } from '@/components/tasks/TagIcon';
import { mergeWithOccurrences } from '@/lib/recurrence';

interface DayGroup {
  key: string;
  date: Date | null;
  tasks: any[];
}

export function WeekView() {
  const { tasks, recurringTasks, fetchRecurring, isLoading } = useTasksStore();

  useEffect(() => {
    fetchRecurring();
  }, [fetchRecurring]);

  const weekTasks = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const keyOf = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return mergeWithOccurrences(tasks, recurringTasks, keyOf(start), keyOf(end));
  }, [tasks, recurringTasks]);

  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    for (const task of weekTasks) {
      const raw = task.startDate || task.dueDate;
      const key = raw
        ? new Date(raw).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'Без даты';
      if (!map.has(key)) {
        map.set(key, { key, date: raw ? new Date(raw) : null, tasks: [] });
      }
      map.get(key)!.tasks.push(task);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    });
  }, [weekTasks]);

  const done = weekTasks.filter((t: any) => t.status === 'COMPLETED').length;
  const total = weekTasks.length;
  const progress = total > 0 ? done / total : 0;
  const ring = 2 * Math.PI * 52;

  const tagStats = useMemo(() => {
    const map = new Map<string, { name: string; color: string; icon?: string | null; done: number; total: number }>();
    for (const t of weekTasks as any[]) {
      const tags = t.tags?.length ? t.tags : [{ tag: { name: t.project?.name || 'Без тега', color: t.project?.color || '#888888' } }];
      for (const tt of tags) {
        const name = tt.tag?.name || 'Без тега';
        const color = tt.tag?.color || '#888888';
        const icon = tt.tag?.icon || null;
        if (!map.has(name)) map.set(name, { name, color, icon, done: 0, total: 0 });
        const entry = map.get(name)!;
        entry.total += 1;
        if (t.status === 'COMPLETED') entry.done += 1;
      }
    }
    return Array.from(map.values());
  }, [weekTasks]);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setDate(end.getDate() + 7);
  const rangeLabel = `${start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} — ${end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <h2 className="text-2xl font-bold tracking-tight">На этой неделе</h2>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">{rangeLabel}</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            <div className="tf-glass rounded-3xl p-3 space-y-4 min-w-0">
              {groups.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">Нет задач на неделю</p>
              )}
              {groups.map((g) => (
                <section key={g.key}>
                  <div className="flex items-baseline gap-2 px-2 pb-1.5">
                    <span className="text-sm font-semibold">
                      {g.date
                        ? g.date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })
                        : 'Без даты'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {g.tasks.length} {plural(g.tasks.length, 'задача', 'задачи', 'задач')}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {g.tasks.map((task: any) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="tf-glass rounded-3xl p-4 min-w-0">
              <div className="font-semibold mb-3">Статистика недели</div>
              <div className="flex items-center gap-4 mb-4">
                <div className="relative h-24 w-24 shrink-0">
                  <svg className="tf-focus-ring h-full w-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted) / 0.4)" strokeWidth="10" />
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={ring}
                      strokeDashoffset={ring * (1 - progress)}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold tabular-nums">
                      {done}/{total}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">Задач выполнено</div>
              </div>
              <div className="space-y-2.5">
                {tagStats.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color, boxShadow: `0 0 8px -1px ${s.color}` }}
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs">
                      <TagIcon icon={s.icon} />
                      {s.name}
                    </span>
                    <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.total > 0 ? Math.round((s.done / s.total) * 100) : 0}%`,
                          background: 'linear-gradient(90deg, hsl(var(--primary)), var(--tf-accent2))',
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {s.done}/{s.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
