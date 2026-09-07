'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ListChecks, Timer, Flame, Target, Plus, CalendarDays } from 'lucide-react';
import { useTasksStore } from '@/stores/tasks';
import { useHabitsStore } from '@/stores/habits';
import { useGoalsStore } from '@/stores/goals';
import { useFocusStore } from '@/stores/focus';
import { TaskItem } from '@/components/tasks/TaskItem';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';
import { Loader2 } from 'lucide-react';

function Tile({
  icon,
  color,
  label,
  value,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="tf-glass rounded-2xl p-3.5 flex items-center gap-3 min-w-0">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{
          color,
          background: `${color}1a`,
          border: `1px solid ${color}55`,
          boxShadow: `0 0 16px -4px ${color}88`,
        }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-muted-foreground truncate">{label}</span>
        <span className="block text-xl font-semibold tabular-nums">{value}</span>
      </span>
    </div>
  );
}

export function TodayDashboard() {
  const { todayTasks, isLoading, setCurrentView } = useTasksStore();
  const { habits, fetchHabits } = useHabitsStore();
  const { goals, fetchGoals } = useGoalsStore();
  const { sessions, fetchStats, fetchSessions } = useFocusStore();
  const [taskOpen, setTaskOpen] = useState(false);

  useEffect(() => {
    fetchHabits();
    fetchGoals();
    fetchStats();
    fetchSessions();
  }, [fetchHabits, fetchGoals, fetchStats, fetchSessions]);

  // Прогресс с учетом подзадач: задача с детьми дает долю за каждую
  // выполненную подзадачу, задача без детей — 0/100% по статусу.
  const taskScore = (t: any): number => {
    const kids = (t.children || []).filter((c: any) => !c.isDeleted);
    if (kids.length > 0) {
      return kids.filter((c: any) => c.status === 'COMPLETED').length / kids.length;
    }
    return t.status === 'COMPLETED' ? 1 : 0;
  };
  const done = todayTasks.filter((t) => t.status === 'COMPLETED').length;
  const total = todayTasks.length;
  const progress =
    total > 0
      ? Math.round((todayTasks.reduce((s: number, t) => s + taskScore(t), 0) / total) * 100)
      : 0;
  const ring = 2 * Math.PI * 52;

  const habitsDone = habits.filter((h) => h.completedToday).length;
  const goalsDone = goals.filter((g) => g.isCompleted).length;

  const focusTodayMin = useMemo(() => {
    const day = new Date().toISOString().slice(0, 10);
    return sessions
      .filter((s: any) => s.startedAt && new Date(s.startedAt).toISOString().slice(0, 10) === day)
      .reduce((sum: number, s: any) => sum + (Number(s.durationMin) || 0), 0);
  }, [sessions]);

  const today = new Date();
  const dateLabel = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const weekday = today.toLocaleDateString('ru-RU', { weekday: 'long' });

  const quickActions = [
    { label: 'Новая задача', icon: <Plus className="h-4 w-4" />, onClick: () => setTaskOpen(true) },
    { label: 'Добавить привычку', icon: <Flame className="h-4 w-4" />, onClick: () => setCurrentView('habits') },
    { label: 'Новая цель', icon: <Target className="h-4 w-4" />, onClick: () => setCurrentView('goals') },
    { label: 'Открыть календарь', icon: <CalendarDays className="h-4 w-4" />, onClick: () => setCurrentView('calendar') },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Сегодня</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Пусть сегодня будет продуктивным!</p>
          </div>
          <div className="hidden sm:block text-right shrink-0">
            <div className="text-sm font-medium capitalize">{dateLabel}</div>
            <div className="text-xs text-muted-foreground capitalize">{weekday}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          <Tile icon={<ListChecks className="h-5 w-5" />} color="#3b82f6" label="Задач сегодня" value={`${done} / ${total}`} />
          <Tile
            icon={<Timer className="h-5 w-5" />}
            color="#10b981"
            label="Время фокуса"
            value={`${Math.floor(focusTodayMin / 60)} ч. ${focusTodayMin % 60} м`}
          />
          <Tile icon={<Flame className="h-5 w-5" />} color="#a855f7" label="Привычки" value={`${habitsDone} / ${habits.length}`} />
          <Tile icon={<Target className="h-5 w-5" />} color="#f59e0b" label="Цели" value={`${goalsDone} / ${goals.length}`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <div className="tf-glass rounded-3xl p-4 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold">Задачи на сегодня</h3>
              <button
                type="button"
                onClick={() => setTaskOpen(true)}
                className="tf-btn-violet inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                Добавить задачу
              </button>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : todayTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                <p className="text-sm">Нет задач</p>
                <p className="text-xs mt-1">Добавьте первую задачу кнопкой выше</p>
              </div>
            ) : (
              <div className="mt-1 divide-y divide-[hsl(var(--primary)/0.14)]">
                {todayTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="tf-glass rounded-3xl p-4 flex items-center gap-4">
              <div className="relative h-28 w-28 shrink-0">
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
                    strokeDashoffset={ring * (1 - progress / 100)}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold tabular-nums">{progress}%</span>
                </div>
              </div>
              <div className="min-w-0">
                <div className="font-semibold">Прогресс дня</div>
                <div className="text-xs text-muted-foreground mt-0.5">Ты на правильном пути!</div>
              </div>
            </div>

            <div className="tf-glass rounded-3xl p-4">
              <div className="font-semibold mb-3">Быстрые действия</div>
              <div className="space-y-2">
                {quickActions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.onClick}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5 text-sm hover:bg-accent/60 transition-colors"
                  >
                    <span className="text-primary">{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <CreateTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} />
    </div>
  );
}
