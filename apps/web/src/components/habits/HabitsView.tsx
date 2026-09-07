'use client';

import { useEffect, useState } from 'react';
import { useHabitsStore } from '@/stores/habits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus, Flame, Check, Trash2, Loader2, X, Sparkles } from 'lucide-react';

const COLORS = [
  '#4A90D9',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
];

function Heatmap({ logs, color }: { logs: any[]; color: string }) {
  const days = 35;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logSet = new Set(
    logs.map((l) => new Date(l.date).toISOString().slice(0, 10))
  );

  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const done = logSet.has(key);
    cells.push(
      <div
        key={key}
        title={key}
        className={cn(
          'h-3.5 w-3.5 rounded-[3px] transition-colors',
          done ? 'shadow-sm' : ''
        )}
        style={
          done
            ? { backgroundColor: color }
            : {
                backgroundColor: 'var(--heatmap-empty, #e2e8f0)',
                border: '1px solid var(--heatmap-empty-border, #cbd5e1)',
              }
        }
      />
    );
  }

  return <div className="flex flex-wrap gap-[3px] max-w-[180px]">{cells}</div>;
}

/** Creative habit toggle: ring + soft glow when done, dashed ring when not */
function HabitToggle({
  done,
  color,
  onClick,
}: {
  done: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
        done ? 'scale-100' : 'hover:scale-105'
      )}
      style={
        done
          ? {
              background: `linear-gradient(135deg, ${color}, ${color}cc)`,
              boxShadow: `0 0 0 3px ${color}22, 0 4px 14px ${color}40`,
            }
          : {
              background: `linear-gradient(135deg, ${color}12, ${color}08)`,
              border: `2px dashed ${color}99`,
            }
      }
      title={done ? 'Отметить как невыполненное' : 'Отметить выполненным'}
    >
      {done ? (
        <Check className="h-5 w-5 text-white drop-shadow-sm" strokeWidth={3} />
      ) : (
        <span
          className="h-2 w-2 rounded-full opacity-70"
          style={{ backgroundColor: color }}
        />
      )}
    </button>
  );
}

export function HabitsView() {
  const { habits, isLoading, fetchHabits, createHabit, deleteHabit, toggleToday } =
    useHabitsStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createHabit({ name: name.trim(), description: description.trim() || undefined, color });
      setName('');
      setDescription('');
      setColor(COLORS[0]);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="tf-view-header px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Привычки
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Маленькие шаги — большие результаты
          </p>
        </div>
        <Button size="sm" className="tf-btn-violet gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Привычка
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {habits.length > 0 && (
          <div className="tf-glass rounded-2xl p-3.5">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-2xl font-bold tabular-nums">
                {habits.filter((h) => h.completedToday).length}/{habits.length}
              </span>
              <span className="text-[11px] text-muted-foreground">Сегодня</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${habits.length ? Math.round((habits.filter((h) => h.completedToday).length / habits.length) * 100) : 0}%`,
                  background: 'linear-gradient(90deg, hsl(var(--primary)), var(--tf-accent2))',
                  boxShadow: '0 0 12px -2px var(--tf-glow)',
                }}
              />
            </div>
          </div>
        )}
        {showForm && (
          <div className="tf-glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Новая привычка</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Input
              placeholder="Название (например: Зарядка)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Input
              placeholder="Описание (необязательно)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Цвет:</span>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-6 w-6 rounded-full transition-transform',
                    color === c && 'ring-2 ring-offset-2 ring-primary scale-110'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Отмена
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Создать'}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : habits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="h-14 w-14 rounded-2xl bg-muted/80 border border-dashed border-border flex items-center justify-center mb-3">
              <Sparkles className="h-6 w-6 opacity-50" />
            </div>
            <p className="text-sm">Пока нет привычек</p>
            <p className="text-xs mt-1">Добавьте первую привычку для отслеживания</p>
          </div>
        ) : (
          habits.map((habit) => (
            <div
              key={habit.id}
              className="tf-glass rounded-2xl p-4 flex items-start gap-4 hover:shadow-sm transition-shadow"
            >
              <HabitToggle
                done={!!habit.completedToday}
                color={habit.color || COLORS[0]}
                onClick={() => toggleToday(habit.id)}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{habit.name}</h3>
                  {habit.streak > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-orange-500 font-medium">
                      <Flame className="h-3.5 w-3.5" />
                      {habit.streak}
                    </span>
                  )}
                </div>
                {habit.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{habit.description}</p>
                )}
                <div className="mt-2.5">
                  <Heatmap logs={habit.logs || []} color={habit.color || COLORS[0]} />
                </div>
              </div>

              <button
                onClick={() => {
                  if (confirm('Удалить привычку?')) deleteHabit(habit.id);
                }}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}

        {habits.length > 0 && (
          <div className="tf-glass rounded-2xl p-4 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Лучшие результаты приходят от постоянства,
              <br />а не от идеальности.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
