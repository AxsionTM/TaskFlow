'use client';

import { useEffect, useState } from 'react';
import { useBirthdaysStore, ageFromDate } from '@/stores/birthdays';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Cake, Plus, Trash2, Gift, PartyPopper } from 'lucide-react';

export function BirthdaysView() {
  const { items, loading, fetch, create, remove } = useBirthdaysStore();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [remindDays, setRemindDays] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch();
  }, [fetch]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !date) return;
    await create({ name: name.trim(), date, note: note || undefined, remindDays });
    setName('');
    setDate('');
    setNote('');
    setRemindDays(0);
    setShowForm(false);
  };

  const visible = items.filter((b) =>
    b.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const daysUntil = (iso: string): number => {
    const now = new Date();
    const d = new Date(iso);
    const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (next.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
      next.setFullYear(now.getFullYear() + 1);
    }
    return Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-2 mb-4">
        <Cake className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Дни рождения</h1>
          <p className="text-xs text-muted-foreground">
            Ближайшие события
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          title="Добавить день рождения"
          className="tf-btn-violet flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          Добавить день рождения
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск…"
        className="mb-4 h-9 w-full rounded-xl border border-input bg-card/60 px-3 text-sm outline-none backdrop-blur focus:ring-2 focus:ring-ring"
      />

      {showForm && (
      <form onSubmit={submit} className="tf-glass rounded-2xl p-4 space-y-3 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Input placeholder="Заметка (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Напомнить</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={remindDays}
            onChange={(e) => setRemindDays(Number(e.target.value))}
          >
            <option value={0}>В день рождения</option>
            <option value={1}>За 1 день</option>
            <option value={3}>За 3 дня</option>
            <option value={7}>За 7 дней</option>
          </select>
          <Button type="submit" size="sm" className="tf-btn-violet ml-auto gap-1">
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        </div>
      </form>
      )}

      {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      <div className="tf-glass rounded-2xl p-3 space-y-2">
        {visible.map((b) => {
          const age = ageFromDate(b.date);
          const d = new Date(b.date);
          const left = daysUntil(b.date);
          const initials = b.name
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          return (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5"
            >
              <div
                className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), var(--tf-accent2))',
                  boxShadow: '0 0 14px -3px var(--tf-glow)',
                }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{b.name}</p>
                <p className="text-xs text-muted-foreground">
                  {d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} ·{' '}
                  {left === 0 ? 'сегодня!' : `${left} дн.`}
                  {b.note ? ` · ${b.note}` : ''}
                </p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-pink-400/40 bg-pink-500/10 text-pink-400">
                <Gift className="h-4 w-4" />
              </span>
              <button
                type="button"
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                onClick={() => remove(b.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {!loading && visible.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {query ? 'Ничего не найдено' : 'Пока пусто — добавьте первый день рождения'}
          </p>
        )}
      </div>

      <div className="tf-glass rounded-2xl p-4 mt-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-pink-400/40 bg-pink-500/10 text-pink-400">
          <PartyPopper className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Добавьте дни рождения</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Не забудьте поздравить близких и друзей!
          </p>
        </div>
      </div>
    </div>
  );
}
