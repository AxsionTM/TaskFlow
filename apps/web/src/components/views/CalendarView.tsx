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
  addWeeks,
  subWeeks,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTasksStore } from '@/stores/tasks';
import { useBirthdaysStore, isSameMonthDay, ageFromDate } from '@/stores/birthdays';
import { useAuthStore } from '@/stores/auth';
import { useEffectsStore } from '@/stores/effects';
import { cn, priorityColors } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';
import { TaskCard } from '@/components/tasks/TaskCard';
import { QuickGlance, MiniCalendar, UpcomingBirthdays } from '@/components/views/SidePanels';

type CalMode = 'month' | 'week';

export function CalendarView() {
  const { tasks, setSelectedTask, updateTask, setCurrentView } = useTasksStore();
  const { items: birthdays, fetch: fetchBirthdays } = useBirthdaysStore();
  const user = useAuthStore((s) => s.user);
  const effectsOn = useEffectsStore((s) => s.enabled);

  useEffect(() => {
    // Tasks are loaded by TaskList when calendar mode is selected.
    // Do not fetch them here: fetchTasks toggles the global isLoading flag,
    // which used to unmount CalendarView and immediately mount it again,
    // causing an endless loading/fetch loop.
    fetchBirthdays();
  }, [fetchBirthdays]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [mode, setMode] = useState<CalMode>('month');
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
    return map;
  }, [allTasks]);

  const navigate = (dir: -1 | 1) => {
    if (mode === 'month') {
      setCursor(dir === 1 ? addMonths(cursor, 1) : subMonths(cursor, 1));
    } else if (mode === 'week') {
      setCursor(dir === 1 ? addWeeks(cursor, 1) : subWeeks(cursor, 1));
    }
  };

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    const end = endOfWeek(cursor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const headerLabel =
    mode === 'month'
      ? format(cursor, 'LLLL yyyy', { locale: ru })
      : `${format(weekDays[0], 'd MMM', { locale: ru })} – ${format(weekDays[6], 'd MMM yyyy', { locale: ru })}`;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="tf-calendar-toolbar flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(new Date())}
          >
            Сегодня
          </Button>
          <h2 className="text-sm font-semibold capitalize ml-2">{headerLabel}</h2>
          <span className="text-[11px] text-muted-foreground hidden sm:inline ml-2">
            Перетащите задачу на другой день
          </span>
        </div>

        <div className="flex rounded-lg border overflow-hidden">
          {(['month', 'week'] as CalMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              )}
            >
              {m === 'month' ? 'Месяц' : 'Неделя'}
            </button>
          ))}
          <button
            onClick={() => setCurrentView('agenda')}
            title="Открыть повестку дня"
            className="px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            День
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-h-0 min-w-0 flex-col">

      {/* Month grid */}
      {mode === 'month' && (
        <div className="calendar-scroll flex-1 overflow-auto p-2 sm:p-3">
          <div className="calendar-grid min-w-[560px]">
          <div className="grid grid-cols-7 gap-px mb-1">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px auto-rows-fr" style={{ minHeight: 'calc(100% - 28px)' }}>
            {monthDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayTasks = tasksByDate.get(key) || [];
              const inMonth = isSameMonth(day, cursor);

              return (
                <div
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  onDragOver={(e) => onDragOverDay(e, key)}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => onDropDay(e, key)}
                  className={cn(
                    'min-h-[90px] rounded-xl tf-glass p-1.5 transition-colors relative cursor-pointer',
                    !inMonth && 'opacity-40',
                    isToday(day) && 'ring-1 ring-primary/60 shadow-[0_0_18px_-6px_var(--tf-glow)]',
                    selectedKey === key && 'ring-2 ring-primary/80',
                    dragOverKey === key && 'ring-2 ring-primary bg-primary/10'
                  )}
                >
                  <div
                    className={cn(
                      'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full relative z-[1]',
                      isToday(day) && 'bg-primary text-primary-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                  {/* Birthday highlight */}
                  {(() => {
                    const bdayPeople = birthdays.filter((b) => isSameMonthDay(b.date, day));
                    const isUserBday =
                      user?.birthday && isSameMonthDay(String(user.birthday), day);
                    if (!bdayPeople.length && !isUserBday) return null;
                    return (
                      <div
                        className={cn(
                          'absolute inset-0 rounded-md overflow-hidden pointer-events-none z-0',
                          'ring-2 ring-primary/70 bg-primary/10'
                        )}
                      >
                        {effectsOn && (
                          <div className="absolute inset-0 tf-bday-float text-[10px] leading-none">
                            <span className="absolute left-1 top-1 animate-[tf-bday_4s_ease-in-out_infinite]">🎈</span>
                            <span className="absolute right-1 top-2 animate-[tf-bday_5s_ease-in-out_infinite_0.5s]">🎂</span>
                            <span className="absolute left-2 bottom-1 animate-[tf-bday_4.5s_ease-in-out_infinite_1s]">✨</span>
                            <span className="absolute right-2 bottom-2 animate-[tf-bday_3.5s_ease-in-out_infinite_0.2s]">🎉</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="space-y-0.5 relative z-[1]">
                    {birthdays
                      .filter((b) => isSameMonthDay(b.date, day))
                      .map((b) => (
                        <div
                          key={b.id}
                          className="text-[10px] px-1 py-0.5 rounded bg-pink-500/20 text-pink-200 truncate"
                          title={`${b.name} (${ageFromDate(b.date)} лет)`}
                        >
                          🎂 {b.name}
                        </div>
                      ))}
                    {user?.birthday && isSameMonthDay(String(user.birthday), day) && (
                      <div className="text-[10px] px-1 py-0.5 rounded bg-primary/25 text-primary truncate">
                        🎂 Мой ДР
                      </div>
                    )}
                    {dayTasks.slice(0, 3).map((task) => (
                      <button
                        key={task.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, task.id)}
                        onClick={(e) => { e.stopPropagation(); setSelectedTask(task.id); }}
                        className={cn(
                          'w-full text-left text-[11px] px-1.5 py-0.5 rounded-md truncate cursor-grab active:cursor-grabbing border border-primary/25',
                          'hover:opacity-80',
                          task.status === 'COMPLETED'
                            ? 'line-through text-muted-foreground bg-muted'
                            : 'bg-primary/10 text-foreground shadow-[0_0_10px_-4px_var(--tf-glow)]'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-1.5 w-1.5 rounded-full mr-1',
                            priorityColors[task.priority] || 'bg-gray-400'
                          )}
                        />
                        {task.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[10px] text-muted-foreground px-1">
                        +{dayTasks.length - 3} ещё
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* Week view */}
      {mode === 'week' && (
        <div className="calendar-week-scroll flex-1 overflow-auto p-2 sm:p-3">
          <div className="grid min-w-[560px] grid-cols-7 gap-2 h-full">
            {weekDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayTasks = tasksByDate.get(key) || [];

              return (
                <div
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  onDragOver={(e) => onDragOverDay(e, key)}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => onDropDay(e, key)}
                  className={cn(
                    'flex flex-col rounded-2xl tf-glass overflow-hidden cursor-pointer',
                    isToday(day) && 'ring-1 ring-primary/60 shadow-[0_0_18px_-6px_var(--tf-glow)]',
                    selectedKey === key && 'ring-2 ring-primary/80',
                    dragOverKey === key && 'ring-2 ring-primary'
                  )}
                >
                  <div className="px-2 py-2 border-b text-center">
                    <div className="text-xs text-muted-foreground">
                      {format(day, 'EEE', { locale: ru })}
                    </div>
                    <div
                      className={cn(
                        'text-sm font-semibold mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full',
                        isToday(day) && 'bg-primary text-primary-foreground'
                      )}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                    {dayTasks.map((task) => (
                      <button
                        key={task.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, task.id)}
                        onClick={(e) => { e.stopPropagation(); setSelectedTask(task.id); }}
                        className={cn(
                          'w-full text-left text-xs px-2 py-1.5 rounded-xl cursor-grab active:cursor-grabbing border border-primary/20 bg-card/50',
                          task.status === 'COMPLETED'
                            ? 'line-through text-muted-foreground bg-muted'
                            : 'hover:bg-accent shadow-[0_0_10px_-6px_var(--tf-glow)]'
                        )}
                      >
                        {task.title}
                      </button>
                    ))}
                    {dayTasks.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-4">—</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Выбранный день */}
      <div className="shrink-0 border-t px-3 py-3 sm:px-4">
        <div className="tf-glass mx-auto max-w-3xl rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold capitalize">
              {format(new Date(selectedKey + 'T12:00:00'), 'd MMMM, EEEE', { locale: ru })}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {(tasksByDate.get(selectedKey) || []).length}
            </span>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {(tasksByDate.get(selectedKey) || []).map((task: any) => (
              <TaskCard key={task.id} task={task} />
            ))}
            {(tasksByDate.get(selectedKey) || []).length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">Нет задач в этот день</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setTaskOpen(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 px-3 py-2.5 text-sm text-primary transition-colors hover:bg-primary/10"
          >
            <span className="text-base leading-none">+</span>
            Добавить задачу
          </button>
        </div>
      </div>

      {/* Ближайшие события */}
      <div className="shrink-0 border-t px-3 py-2.5 sm:px-4">
        <div className="tf-glass mx-auto max-w-5xl rounded-2xl p-3">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Ближайшие события</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {allTasks
              .filter((t: any) => t.dueDate && t.status !== 'COMPLETED')
              .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
              .slice(0, 8)
              .map((t: any) => {
                const c = t.tags?.[0]?.tag?.color || t.project?.color || '#8b5cf6';
                const d = new Date(t.dueDate);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedKey(format(d, 'yyyy-MM-dd'));
                      setSelectedTask(t.id);
                    }}
                    className="w-44 shrink-0 rounded-xl border border-border/50 bg-card/40 p-2.5 text-left transition-colors hover:bg-accent/60"
                    style={{ boxShadow: `inset 2px 0 0 ${c}` }}
                  >
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })},{' '}
                      {d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="mt-0.5 truncate text-xs font-medium">{t.title}</div>
                  </button>
                );
              })}
          </div>
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
