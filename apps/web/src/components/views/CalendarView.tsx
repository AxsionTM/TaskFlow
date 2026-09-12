'use client';

import { useMemo, useState, useEffect, type DragEvent } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarClock,
  ChevronRight as ArrowRight,
  Cake,
  Flag,
} from 'lucide-react';
import { useTasksStore } from '@/stores/tasks';
import { useBirthdaysStore, isSameMonthDay, ageFromDate } from '@/stores/birthdays';
import { useAuthStore } from '@/stores/auth';
import { useEffectsStore } from '@/stores/effects';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';
import { QuickGlance, MiniCalendar, UpcomingBirthdays } from '@/components/views/SidePanels';

const PRIORITY_META: Record<string, { color: string; bg: string; label: string }> = {
  HIGH: { color: '#f87171', bg: 'rgba(239,68,68,.16)', label: 'Высокий' },
  MEDIUM: { color: '#fbbf24', bg: 'rgba(245,158,11,.15)', label: 'Средний' },
  LOW: { color: '#60a5fa', bg: 'rgba(59,130,246,.15)', label: 'Низкий' },
  NONE: { color: '#34d399', bg: 'rgba(52,211,153,.13)', label: 'Нет' },
};

function timeLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function CalendarView() {
  const { tasks, setSelectedTask, updateTask } = useTasksStore();
  const { items: birthdays, fetch: fetchBirthdays } = useBirthdaysStore();
  const user = useAuthStore((s) => s.user);
  const effectsOn = useEffectsStore((s) => s.enabled);

  useEffect(() => {
    fetchBirthdays();
  }, [fetchBirthdays]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [cursor, setCursor] = useState(new Date());
  const [selectedKey, setSelectedKey] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [taskOpen, setTaskOpen] = useState(false);

  const allTasks = useMemo(() => tasks, [tasks]);

  const moveTaskToDate = async (taskId: string, dateKey: string) => {
    const day = new Date(dateKey + 'T12:00:00');
    await updateTask(taskId, { dueDate: day.toISOString(), isAllDay: true });
  };

  const onDragStart = (e: DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/task-id', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOverDay = (e: DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(key);
  };

  const onDropDay = async (e: DragEvent, key: string) => {
    e.preventDefault();
    setDragOverKey(null);
    const taskId = e.dataTransfer.getData('text/task-id');
    if (!taskId) return;
    await moveTaskToDate(taskId, key);
  };

  const tasksByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const task of allTasks) {
      if (!task.dueDate) continue;
      const key = format(new Date(task.dueDate), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    map.forEach((list) => {
      list.sort((a: any, b: any) => {
        const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
        const pa = order[a.priority] ?? 4;
        const pb = order[b.priority] ?? 4;
        if (pa !== pb) return pa - pb;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    });
    return map;
  }, [allTasks]);

  const navigate = (dir: -1 | 1) => {
    setCursor(dir === 1 ? addMonths(cursor, 1) : subMonths(cursor, 1));
  };

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const headerLabel = format(cursor, 'LLLL yyyy', { locale: ru });

  const upcoming = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return allTasks
      .filter((t: any) => {
        if (!t.dueDate || t.status === 'COMPLETED') return false;
        return new Date(t.dueDate).getTime() >= start.getTime();
      })
      .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 8);
  }, [allTasks]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {}
      <div className="tf-view-header flex items-center gap-3 px-4 sm:px-6 py-3 border-b">
        <span className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <CalendarDays className="h-4.5 w-4.5" />
        </span>
        <div className="mr-auto min-w-0">
          <h1 className="text-lg font-semibold leading-tight">Календарь</h1>
          <p className="hidden sm:block text-xs text-muted-foreground">Все ваши события и задачи в одном месте</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={() => navigate(-1)} title="Предыдущий месяц">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={() => navigate(1)} title="Следующий месяц">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setCursor(new Date()); setSelectedKey(format(new Date(), 'yyyy-MM-dd')); }}>
            Сегодня
          </Button>
          <h2 className="text-sm font-semibold capitalize ml-1 whitespace-nowrap">{headerLabel}</h2>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-h-0 min-w-0 flex-col">
          {}
          <div className="calendar-scroll flex-1 overflow-auto p-2 sm:p-4">
            <div className="tf-glass rounded-3xl p-2 sm:p-3">
              <div className="tf-cal-head grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d, i) => (
                  <div
                    key={d + i}
                    className={cn(
                      'text-center text-xs font-semibold py-2 rounded-lg',
                      i >= 5 ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="tf-cal-grid grid grid-cols-7 gap-1 sm:gap-1.5">
                {monthDays.map((day) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const dayTasks = tasksByDate.get(key) || [];
                  const inMonth = isSameMonth(day, cursor);
                  const today = isToday(day);
                  const selected = selectedKey === key;
                  const bdayPeople = birthdays.filter((b) => isSameMonthDay(b.date, day));
                  const isUserBday = user?.birthday && isSameMonthDay(String(user.birthday), day);
                  const hasBday = bdayPeople.length > 0 || isUserBday;

                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedKey(key)}
                      onDragOver={(e) => onDragOverDay(e, key)}
                      onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                      onDrop={(e) => onDropDay(e, key)}
                      className={cn(
                        'tf-cal-cell group relative flex h-[118px] sm:h-[132px] flex-col rounded-2xl border p-1.5 transition-all cursor-pointer overflow-hidden',
                        'bg-card/40 hover:bg-accent/40',
                        inMonth ? 'border-primary/20' : 'opacity-45 border-border/40',
                        today && 'border-primary/70 shadow-[0_0_22px_-6px_var(--tf-glow)] bg-primary/[0.07]',
                        selected && !today && 'border-primary/60 ring-1 ring-primary/50',
                        dragOverKey === key && 'border-primary bg-primary/10 ring-2 ring-primary/70'
                      )}
                      style={today ? { boxShadow: '0 0 22px -6px var(--tf-glow), inset 0 0 18px -12px var(--tf-glow)' } : undefined}
                    >
                      <div className="flex items-center justify-between px-0.5">
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-all',
                            today
                              ? 'bg-primary text-white shadow-[0_0_12px_-2px_var(--tf-glow)]'
                              : selected
                                ? 'border border-primary/60 text-primary'
                                : 'text-muted-foreground group-hover:text-foreground'
                          )}
                        >
                          {format(day, 'd')}
                        </span>
                        {hasBday && (
                          <span title={bdayPeople.map((b) => `${b.name} (${ageFromDate(b.date)} лет)`).join(', ') || 'Мой день рождения'}>
                            <Cake className="h-3.5 w-3.5 text-pink-400" />
                          </span>
                        )}
                      </div>

                      {hasBday && effectsOn && (
                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                          <span className="absolute left-1 top-7 text-[10px] leading-none animate-[tf-bday_4s_ease-in-out_infinite]">✦</span>
                          <span className="absolute right-1.5 top-9 text-[9px] leading-none text-pink-300/70 animate-[tf-bday_5s_ease-in-out_infinite_0.5s]">✦</span>
                        </div>
                      )}

                      {}
                      <div className="tf-cal-tasks mt-1 flex-1 min-h-0 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
                        {bdayPeople.slice(0, 1).map((b) => (
                          <div
                            key={b.id}
                            className="truncate rounded-lg border border-pink-400/40 bg-pink-500/15 px-1.5 py-[3px] text-[10px] font-medium leading-tight text-pink-200"
                            title={`${b.name} (${ageFromDate(b.date)} лет)`}
                          >
                            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-pink-400 align-middle" />
                            {b.name}
                          </div>
                        ))}
                        {dayTasks.map((task) => {
                          const meta = PRIORITY_META[task.priority] || PRIORITY_META.NONE;
                          const done = task.status === 'COMPLETED';
                          return (
                            <button
                              key={task.id}
                              draggable
                              onDragStart={(e) => onDragStart(e, task.id)}
                              onClick={(e) => { e.stopPropagation(); setSelectedTask(task.id); }}
                              title={`${task.title}${timeLabel(task.dueDate) ? ` · ${timeLabel(task.dueDate)}` : ''}`}
                              className={cn(
                                'flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-[4px] text-left transition-all cursor-grab active:cursor-grabbing',
                                'hover:brightness-125 hover:translate-x-[1px] active:scale-[0.98]',
                                done && 'opacity-55'
                              )}
                              style={{
                                borderColor: `${meta.color}55`,
                                background: done ? 'hsl(var(--muted) / .5)' : meta.bg,
                                boxShadow: `0 0 12px -5px ${meta.color}88, inset 0 0 10px -8px ${meta.color}`,
                              }}
                            >
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: meta.color, boxShadow: `0 0 8px -1px ${meta.color}` }}
                              />
                              <Flag className="h-2.5 w-2.5 shrink-0" style={{ color: meta.color }} />
                              <span className={cn('min-w-0 flex-1 truncate text-[10px] font-medium leading-tight', done && 'line-through text-muted-foreground')}>
                                {task.title}
                              </span>
                              {timeLabel(task.dueDate) && (
                                <span className="tf-cal-time shrink-0 text-[9px] tabular-nums text-muted-foreground">
                                  {timeLabel(task.dueDate)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        {dayTasks.length === 0 && bdayPeople.length === 0 && (
                          <span className="block px-1 pt-0.5 text-[9px] text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors select-none">
                            +
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {}
            <div className="tf-glass mx-auto mt-3 max-w-5xl rounded-3xl p-3 sm:p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <CalendarClock className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-semibold">Ближайшие события</span>
                <button
                  type="button"
                  onClick={() => setTaskOpen(true)}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 text-primary transition-all hover:bg-primary/15 hover:shadow-[0_0_14px_-4px_var(--tf-glow)]"
                  title="Добавить задачу"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              {upcoming.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">Нет предстоящих событий — наслаждайтесь свободным временем</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {upcoming.map((t: any) => {
                    const meta = PRIORITY_META[t.priority] || PRIORITY_META.NONE;
                    const d = new Date(t.dueDate);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedKey(format(d, 'yyyy-MM-dd'));
                          setSelectedTask(t.id);
                        }}
                        className="w-48 shrink-0 rounded-2xl border p-2.5 text-left transition-all hover:brightness-125 hover:-translate-y-[1px]"
                        style={{
                          borderColor: `${meta.color}44`,
                          background: `linear-gradient(180deg, ${meta.color}14, transparent 60%), hsl(var(--card) / .5)`,
                          boxShadow: `0 0 16px -8px ${meta.color}66`,
                        }}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
                          {d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })},{' '}
                          {d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="mt-1 truncate text-xs font-semibold">{t.title}</div>
                        <div className="mt-0.5 text-[10px]" style={{ color: meta.color }}>{meta.label} приоритет</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden min-h-0 min-w-0 flex-col gap-4 overflow-y-auto border-l border-border/50 p-4 lg:flex">
          <QuickGlance />
          <MiniCalendar
            value={new Date(selectedKey + 'T12:00:00')}
            onSelect={(d) => {
              setSelectedKey(format(d, 'yyyy-MM-dd'));
              setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
            taskKeys={new Set(allTasks.flatMap((t: any) => {
              const keys: string[] = [];
              for (const raw of [t.startDate, t.dueDate]) {
                if (!raw) continue;
                keys.push(format(new Date(raw), 'yyyy-MM-dd'));
              }
              return keys;
            }))}
            birthdayKeys={new Set(birthdays.map((b: any) => {
              const d = new Date(b.date);
              return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }))}
          />
          <UpcomingBirthdays limit={3} />
        </div>
      </div>
      <CreateTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} initialDate={selectedKey} />
    </div>
  );
}
