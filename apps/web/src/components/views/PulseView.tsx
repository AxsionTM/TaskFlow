'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTasksStore } from '@/stores/tasks';
import { useFocusStore } from '@/stores/focus';
import { Activity } from 'lucide-react';

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PulseView() {
  const { overdueTasks, todayTasks, fetchOverdue, fetchToday, fetchTasks, tasks } =
    useTasksStore();
  const { stats, fetchStats } = useFocusStore();
  const [completedCount, setCompletedCount] = useState(0);
  const [range, setRange] = useState<7 | 30>(7);

  useEffect(() => {
    fetchOverdue();
    fetchToday();
    fetchTasks({ includeCompleted: 'true' });
    fetchStats();
  }, [fetchOverdue, fetchToday, fetchTasks, fetchStats]);

  useEffect(() => {
    const done = tasks.filter((t) => t.status === 'COMPLETED').length;
    setCompletedCount(done);
  }, [tasks]);

  const activeCount = useMemo(
    () => tasks.filter((t) => t.status !== 'COMPLETED' && !t.isDeleted).length,
    [tasks]
  );

  const overdue = overdueTasks.length;
  const today = todayTasks.length;
  const open = Math.max(0, activeCount - overdue);

  const score = useMemo(() => {
    const total = completedCount + overdue + today + open;
    if (total === 0) return 100;
    const raw = Math.round(
      ((completedCount + today * 0.5) / (total + overdue * 0.5)) * 100
    );
    return Math.max(0, Math.min(100, raw));
  }, [completedCount, overdue, today, open]);

  // Активность: выполненные задачи по дням из completedAt
  const activity = useMemo(() => {
    const doneByDay = new Map<string, number>();
    for (const t of tasks as any[]) {
      if (t.status !== 'COMPLETED' || !t.completedAt) continue;
      const k = dayKey(new Date(t.completedAt));
      doneByDay.set(k, (doneByDay.get(k) || 0) + 1);
    }
    const days: { key: string; label: string; value: number }[] = [];
    const now = new Date();
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        key: dayKey(d),
        label: d.toLocaleDateString('ru-RU', { weekday: 'short' }),
        value: doneByDay.get(dayKey(d)) || 0,
      });
    }
    const prev: number[] = [];
    for (let i = range * 2 - 1; i >= range; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      prev.push(doneByDay.get(dayKey(d)) || 0);
    }
    const cur = days.reduce((s, d) => s + d.value, 0);
    const prv = prev.reduce((s, v) => s + v, 0);
    const delta = prv === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prv) / prv) * 100);
    return { days, delta };
  }, [tasks, range]);

  const mood =
    score >= 70
      ? { emoji: '🙂', title: 'Отлично', sub: 'Сегодня ты молодец!' }
      : score >= 40
      ? { emoji: '🙂', title: 'Хорошо', sub: 'Держишь темп!' }
      : { emoji: '😴', title: 'Нужен отдых', sub: 'Сбавь обороты сегодня' };

  const scoreLabel = score >= 70 ? 'Хороший результат!' : score >= 40 ? 'Неплохо, расти!' : 'Есть куда расти';

  const recommendations = [
    overdue > 0 ? `Закрой просроченные задачи (${overdue})` : 'Так держать — просрочек нет',
    score < 50 ? 'Больше отдыха' : 'Держи фокус на главном',
    today > 5 ? 'Разгрузи сегодняшний день' : 'Не забывай про себя',
  ];

  const maxV = Math.max(1, ...activity.days.map((d) => d.value));
  const W = 560;
  const H = 150;
  const P = 12;
  const pts = activity.days.map((d, i) => {
    const x = activity.days.length === 1 ? W / 2 : P + (i / (activity.days.length - 1)) * (W - P * 2);
    const y = H - P - (d.value / maxV) * (H - P * 2);
    return { x, y, ...d };
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts.length ? pts[pts.length - 1].x.toFixed(1) : 0},${H} L${pts.length ? pts[0].x.toFixed(1) : 0},${H} Z`;
  const scoreRing = 2 * Math.PI * 40;

  const focusMin = stats?.totalMinutes ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="tf-view-header px-6 py-4 border-b flex flex-wrap items-center gap-3">
        <Activity className="h-5 w-5 text-primary" />
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">Пульс</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Анализ твоей активности и продуктивности
          </p>
        </div>
        <div className="flex rounded-xl border border-border/60 overflow-hidden">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={
                range === r
                  ? 'tf-chip-active px-3 py-1.5 text-xs font-medium'
                  : 'px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent'
              }
            >
              {r} дней
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
        <div className="mx-auto max-w-6xl grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <div className="min-w-0 space-y-4">
            <div className="tf-glass rounded-3xl p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold">Общая активность</span>
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    color: activity.delta >= 0 ? '#34d399' : '#f87171',
                    background: activity.delta >= 0 ? '#34d3991a' : '#f871711a',
                    border: `1px solid ${activity.delta >= 0 ? '#34d39955' : '#f8717155'}`,
                  }}
                >
                  {activity.delta >= 0 ? '+' : ''}
                  {activity.delta}% к прошлой неделе
                </span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 150 }}>
                <defs>
                  <linearGradient id="tf-pulse-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="var(--tf-accent2)" />
                  </linearGradient>
                  <linearGradient id="tf-pulse-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={area} fill="url(#tf-pulse-area)" />
                <path
                  d={line}
                  fill="none"
                  stroke="url(#tf-pulse-line)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ filter: 'drop-shadow(0 0 6px hsl(var(--primary) / 0.6))' }}
                />
                {pts.map((p) => (
                  <circle key={p.key} cx={p.x} cy={p.y} r="3.5" fill="hsl(var(--primary))" stroke="#fff" strokeWidth="1.5" />
                ))}
              </svg>
              <div className="flex justify-between text-[10px] text-muted-foreground capitalize mt-1">
                {pts
                  .filter((_, i) => range === 7 || i % 5 === 0 || i === pts.length - 1)
                  .map((p) => (
                    <span key={p.key}>{p.label}</span>
                  ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="tf-glass rounded-2xl p-3 text-center">
                <div className="text-[11px] text-muted-foreground">Задачи</div>
                <div className="text-xl font-bold tabular-nums">
                  {completedCount} / {completedCount + activeCount}
                </div>
              </div>
              <div className="tf-glass rounded-2xl p-3 text-center">
                <div className="text-[11px] text-muted-foreground">Фокус</div>
                <div className="text-xl font-bold tabular-nums">
                  {Math.floor(focusMin / 60)} ч {focusMin % 60} м
                </div>
              </div>
              <div className="tf-glass rounded-2xl p-3 text-center">
                <div className="text-[11px] text-muted-foreground">Просрочено</div>
                <div className="text-xl font-bold tabular-nums">{overdue}</div>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="tf-glass rounded-3xl p-4 flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0">
                <svg className="tf-focus-ring h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted) / 0.4)" strokeWidth="9" />
                  <circle
                    cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="9"
                    strokeLinecap="round" strokeDasharray={scoreRing}
                    strokeDashoffset={scoreRing * (1 - score / 100)}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold tabular-nums">{score}%</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{scoreLabel}</div>
            </div>

            <div className="tf-glass rounded-3xl p-4">
              <div className="text-sm font-semibold mb-2">Твое настроение</div>
              <div className="flex items-center gap-3">
                <span className="text-4xl" role="img" aria-label="Настроение">
                  {mood.emoji}
                </span>
                <div>
                  <div className="font-semibold">{mood.title}</div>
                  <div className="text-xs text-muted-foreground">{mood.sub}</div>
                </div>
              </div>
            </div>

            <div className="tf-glass rounded-3xl p-4">
              <div className="text-sm font-semibold mb-2">Рекомендации</div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {recommendations.map((r) => (
                  <li key={r} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
