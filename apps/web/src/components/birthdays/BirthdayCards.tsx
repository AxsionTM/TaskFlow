'use client';

import { useEffect, useMemo } from 'react';
import { useBirthdaysStore, isSameMonthDay, ageFromDate } from '@/stores/birthdays';
import { useAuthStore } from '@/stores/auth';
import { useTasksStore } from '@/stores/tasks';

/**
 * Festive birthday cards for a given day.
 * Shown on top of day task lists so birthdays read as events, not plain rows.
 */
export function BirthdayCards({ date = new Date() }: { date?: Date }) {
  const { items, fetch } = useBirthdaysStore();
  const user = useAuthStore((s) => s.user);
  const setCurrentView = useTasksStore((s) => s.setCurrentView);

  useEffect(() => {
    fetch().catch(() => {});
  }, [fetch]);

  const cards = useMemo(() => {
    const list: { key: string; name: string; age: number | null; mine: boolean }[] = [];
    for (const b of items) {
      if (isSameMonthDay(b.date, date)) {
        list.push({ key: b.id, name: b.name, age: ageFromDate(b.date, date), mine: false });
      }
    }
    if (user?.birthday && isSameMonthDay(String(user.birthday), date)) {
      list.push({ key: 'me', name: user.name || 'У меня', age: null, mine: true });
    }
    return list;
  }, [items, user, date]);

  if (!cards.length) return null;

  const isToday = new Date().toDateString() === date.toDateString();

  return (
    <div className="space-y-2">
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => setCurrentView('birthdays')}
          className="flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-pink-400/50 bg-gradient-to-r from-pink-500/25 via-fuchsia-500/15 to-violet-500/25 px-3.5 py-3 text-left transition-transform hover:scale-[1.005]"
          style={{ boxShadow: '0 0 24px -8px rgba(236,72,153,.55), inset 0 0 18px -12px rgba(236,72,153,.6)' }}
        >
          <span className="shrink-0 text-2xl leading-none" aria-hidden>
            🎈🎂🎉
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-pink-100">
              {isToday ? `Сегодня день рождения у ${c.name}!` : `День рождения у ${c.name}`}
            </span>
            <span className="block truncate text-xs text-pink-200/70">
              {c.mine ? 'Поздравляем! Отличный день!' : c.age !== null ? `Исполняется ${c.age} — не забудьте поздравить` : 'Не забудьте поздравить'}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
