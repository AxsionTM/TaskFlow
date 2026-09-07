'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatDate, cn } from '@/lib/utils';
import { Trash2, RotateCcw, Loader2, Clock3 } from 'lucide-react';
import { plural } from '@/components/views/TomorrowView';
import { TagPill } from '@/components/tasks/TagPill';

const CHIPS = [
  { id: 'all', label: 'Все' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'projects', label: 'Проекты' },
  { id: 'habits', label: 'Привычки' },
  { id: 'goals', label: 'Цели' },
];

function daysAgo(iso?: string | null): string {
  if (!iso) return '';
  const days = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
  );
  if (days === 0) return 'сегодня';
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
}

export function TrashView() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const { tasks: t } = await api.getTrash();
      setTasks(t);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRestore = async (id: string) => {
    setBusy(id);
    try {
      await api.restoreTask(id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handlePermanent = async (id: string) => {
    if (!confirm('Удалить навсегда? Это действие нельзя отменить.')) return;
    setBusy(id);
    try {
      await api.permanentDeleteTask(id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleEmpty = async () => {
    if (!confirm('Очистить корзину? Все задачи будут удалены навсегда.')) return;
    setBusy('empty');
    try {
      await api.emptyTrash();
      await load();
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(
    () => (filter === 'all' || filter === 'tasks' ? tasks : []),
    [tasks, filter]
  );
  const onlyTasks = filter === 'projects' || filter === 'habits' || filter === 'goals';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="tf-view-header px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-primary" />
            Корзина
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Удалённые задачи. Они хранятся 30 дней, после чего удаляются навсегда.
          </p>
        </div>
        {tasks.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEmpty}
            disabled={busy === 'empty'}
            className="text-destructive hover:text-destructive"
          >
            Очистить корзину
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
        <div className="mx-auto max-w-6xl grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {CHIPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter(c.id)}
                  className={cn(
                    'text-xs px-3.5 py-1.5 rounded-full border transition-all',
                    filter === c.id ? 'tf-chip-active' : 'tf-chip'
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : onlyTasks ? (
              <div className="tf-glass rounded-2xl flex flex-col items-center justify-center py-14 text-muted-foreground">
                <p className="text-sm">Здесь пока только удалённые задачи</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="tf-glass rounded-2xl flex flex-col items-center justify-center py-14 text-muted-foreground">
                <Trash2 className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">Корзина пуста</p>
              </div>
            ) : (
              <div className="tf-glass rounded-2xl p-3 space-y-2">
                {visible.map((task) => {
                  const color = task.tags?.[0]?.tag?.color || task.project?.color || '#a855f7';
                  const letter = (task.title || '?').trim().slice(0, 1).toUpperCase();
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold"
                        style={{
                          color,
                          background: `${color}1a`,
                          border: `1px solid ${color}66`,
                          boxShadow: `0 0 14px -4px ${color}88`,
                        }}
                      >
                        {letter}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-through text-muted-foreground truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {task.tags?.[0] && <TagPill tag={task.tags[0].tag} />}
                          {task.dueDate && (
                            <span className="text-[11px] text-muted-foreground">
                              {formatDate(task.dueDate)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="hidden sm:block shrink-0 text-center text-[11px] text-muted-foreground">
                        <span className="block text-red-400">🗑 Удалено</span>
                        {daysAgo(task.deletedAt)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs shrink-0"
                        onClick={() => handleRestore(task.id)}
                        disabled={busy === task.id}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Восстановить
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive shrink-0 px-2"
                        onClick={() => handlePermanent(task.id)}
                        disabled={busy === task.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {!loading && visible.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2 px-1">
                Всего: {visible.length} {plural(visible.length, 'задача', 'задачи', 'задач')}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="tf-glass rounded-3xl p-4">
              <div className="text-sm font-semibold mb-1">Корзина</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Здесь хранятся удалённые задачи. Вы можете восстановить их в любой момент.
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5">
                <Clock3 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="text-xs">
                  <div className="text-muted-foreground">Хранение</div>
                  <div className="font-semibold">30 дней</div>
                </div>
              </div>
            </div>
            <div className="tf-glass rounded-3xl p-4 text-center">
              <p className="text-xs text-muted-foreground italic leading-relaxed">
                «Иногда лучше сделать паузу, чем удалить навсегда.»
              </p>
              <div className="mt-1 text-lg text-primary">∞</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
