'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlarmClock, Inbox, Cake, Flame, Gift, ChevronRight as Arrow } from 'lucide-react';
import { useTasksStore } from '@/stores/tasks';
import { useBirthdaysStore, ageFromDate } from '@/stores/birthdays';
import { useHabitsStore } from '@/stores/habits';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function daysUntilBirthday(iso: string, from: Date): number {
  const d = new Date(iso);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const next = new Date(from.getFullYear(), d.getMonth(), d.getDate());
  if (next.getTime() < start.getTime()) next.setFullYear(from.getFullYear() + 1);
  return Math.round((next.getTime() - start.getTime()) / 86400000);
}

export function QuickGlance() {
  const { overdueTasks, setCurrentView } = useTasksStore();
  const { items: birthdays, fetch: fetchBirthdays } = useBirthdaysStore();
  const { habits, fetchHabits } = useHabitsStore();
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    fetchBirthdays();
    fetchHabits();
    api
      .getTasks({ inbox: 'true', includeCompleted: 'false' })
      .then(({ tasks }) => setInboxCount(tasks.length))
      .catch(() => {});
  }, [fetchBirthdays, fetchHabits]);

  const now = new Date();
  const bdaySoon = birthdays.filter((b) => daysUntilBirthday(b.date, now) <= 30).length;
  const habitsDone = habits.filter((h) => h.completedToday).length;

  const rows = [
    {
      icon: <AlarmClock className="h-4 w-4" />,
      color: '#ef4444',
      title: 'Просроченные задачи',
      sub: `${overdueTasks.length} требуют внимания`,
      badge: String(overdueTasks.length),
      onClick: () => setCurrentView('overdue'),
    },
    {
      icon: <Inbox className="h-4 w-4" />,
      color: '#3b82f6',
      title: 'Входящие',
      sub: `${inboxCount} новых задачи`,
      badge: String(inboxCount),
      onClick: () => setCurrentView('inbox'),
    },
    {
      icon: <Cake className="h-4 w-4" />,
      color: '#a855f7',
      title: 'Дни рождения',
      sub: `${bdaySoon} скоро`,
      badge: String(bdaySoon),
      onClick: () => setCurrentView('birthdays'),
    },
    {
      icon: <Flame className="h-4 w-4" />,
      color: '#22c55e',
      title: 'Привычки',
      sub: `Сегодня ${habitsDone} из ${habits.length}`,
      badge: `${habitsDone}/${habits.length}`,
      onClick: () => setCurrentView('habits'),
    },
  ];

  return (
    <div className="tf-glass rounded-3xl p-4">
      <div className="mb-3 text-sm font-semibold">Быстрый просмотр</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <button
            key={r.title}
            type="button"
            onClick={r.onClick}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent/60"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                color: r.color,
                border: `1.5px solid ${r.color}88`,
                background: `${r.color}14`,
                boxShadow: `0 0 12px -3px ${r.color}88`,
              }}
            >
              {r.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{r.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{r.sub}</span>
            </span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
              style={{ color: r.color, background: `${r.color}1a`, border: `1px solid ${r.color}55` }}
            >
              {r.badge}
            </span>
            <Arrow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function MiniCalendar({
  value,
  onSelect,
  taskKeys,
  birthdayKeys,
}: {
  value: Date;
  onSelect: (d: Date) => void;
  taskKeys?: Set<string>;
  birthdayKeys?: Set<string>;
}) {
  const [cursor, setCursor] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  useEffect(() => {
    setCursor(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value.getFullYear(), value.getMonth()]);

  const days = useMemo(() => {
    const start = new Date(cursor);
    const pad = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - pad);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const keyOf = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const today = new Date();

  return (
    <div className="tf-glass rounded-3xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Календарь</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-md p-1 hover:bg-accent"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-md p-1 hover:bg-accent"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mb-1 text-center text-xs font-medium capitalize">
        {cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <span key={d} className="py-0.5 text-[10px] text-muted-foreground">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const k = keyOf(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const selected = sameDay(d, value);
          const isToday = sameDay(d, today);
          return (
            <button
              key={k + d.getDate()}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                'relative flex h-7 flex-col items-center justify-center rounded-full text-[11px] tabular-nums transition-colors',
                !inMonth && 'opacity-30',
                selected
                  ? 'bg-emerald-500 font-bold text-white shadow-[0_0_12px_-2px_#22c55e]'
                  : isToday
                  ? 'text-primary hover:bg-accent'
                  : 'hover:bg-accent'
              )}
            >
              {d.getDate()}
              <span className="absolute bottom-0.5 flex gap-0.5">
                {taskKeys?.has(k) && <span className="h-1 w-1 rounded-full bg-emerald-400" />}
                {birthdayKeys?.has(k.slice(5)) && <span className="h-1 w-1 rounded-full bg-amber-400" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Задачи
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Дни рождения
        </span>
      </div>
    </div>
  );
}

export function UpcomingBirthdays({ limit = 3 }: { limit?: number }) {
  const { items, fetch } = useBirthdaysStore();
  const { setCurrentView } = useTasksStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return items
      .map((b) => ({ b, left: daysUntilBirthday(b.date, now) }))
      .sort((a, z) => a.left - z.left)
      .slice(0, limit);
  }, [items, limit]);

  if (upcoming.length === 0) return null;

  return (
    <div className="tf-glass rounded-3xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Gift className="h-4 w-4 text-pink-400" />Следующие дни рождения</span>
        <button
          type="button"
          onClick={() => setCurrentView('birthdays')}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Все
        </button>
      </div>
      <div className="space-y-2">
        {upcoming.map(({ b, left }) => {
          const d = new Date(b.date);
          const initials = b.name
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          return (
            <div key={b.id} className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), var(--tf-accent2))',
                }}
              >
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{b.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} ·{' '}
                  {left === 0 ? 'сегодня!' : `${left} дн.`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
