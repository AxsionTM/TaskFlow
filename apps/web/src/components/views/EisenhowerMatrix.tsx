'use client';

import { useMemo, useState } from 'react';
import { useTasksStore } from '@/stores/tasks';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate, cn } from '@/lib/utils';
import { TagPill } from '@/components/tasks/TagPill';
import {
  Calendar,
  ChevronRight,
  Flame,
  CalendarClock,
  Inbox,
  Leaf,
  Lightbulb,
  Quote,
} from 'lucide-react';

type Quadrant = 'do' | 'schedule' | 'delegate' | 'eliminate';

const QUADRANTS: {
  id: Quadrant;
  title: string;
  subtitle: string;
  icon: typeof Flame;
  color: string;
  urgent: boolean;
}[] = [
  {
    id: 'do',
    title: 'Срочно / Важно',
    subtitle: 'Сделать сейчас',
    icon: Flame,
    color: '#ef4444',
    urgent: true,
  },
  {
    id: 'schedule',
    title: 'Не срочно / Важно',
    subtitle: 'Запланировать',
    icon: CalendarClock,
    color: '#3b82f6',
    urgent: false,
  },
  {
    id: 'delegate',
    title: 'Срочно / Не важно',
    subtitle: 'Делегировать',
    icon: Inbox,
    color: '#f59e0b',
    urgent: true,
  },
  {
    id: 'eliminate',
    title: 'Не срочно / Не важно',
    subtitle: 'Исключить',
    icon: Leaf,
    color: '#22c55e',
    urgent: false,
  },
];

const PRIORITY_META: Record<string, { color: string; label: string }> = {
  HIGH: { color: '#ef4444', label: 'Срочно' },
  MEDIUM: { color: '#f59e0b', label: 'Важно' },
  LOW: { color: '#3b82f6', label: 'Низкий' },
  NONE: { color: '#22a06b', label: 'Можно отложить' },
};

function isUrgent(task: any): boolean {
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  const inThreeDays = new Date();
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  inThreeDays.setHours(23, 59, 59, 999);
  return due <= inThreeDays;
}

function getQuadrant(task: any): Quadrant {
  const urgent = isUrgent(task);
  const important = task.priority === 'HIGH' || task.priority === 'MEDIUM';

  if (urgent && important) return 'do';
  if (!urgent && important) return 'schedule';
  if (urgent && !important) return 'delegate';
  return 'eliminate';
}

function MatrixCard({ task }: { task: any }) {
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const setSelectedTask = useTasksStore.getState().setSelectedTask;
  const completeTask = useTasksStore.getState().completeTask;
  const isSelected = selectedTaskId === task.id;
  const done = task.status === 'COMPLETED';
  const meta = PRIORITY_META[task.priority] || PRIORITY_META.NONE;

  return (
    <div
      onClick={() => setSelectedTask(task.id)}
      className={cn(
        'group flex items-start gap-2.5 rounded-2xl border border-border/50 bg-card/50 p-3 cursor-pointer backdrop-blur transition-all',
        'hover:brightness-125 hover:-translate-y-[1px] hover:border-primary/40',
        isSelected && 'ring-2 ring-primary/50'
      )}
      style={{ boxShadow: `0 0 16px -10px ${meta.color}66` }}
    >
      <div
        className="pt-0.5"
        onClick={(e) => {
          e.stopPropagation();
          completeTask(task.id);
        }}
      >
        <Checkbox
          checked={done}
          priority={task.priority}
          ghost
          size="sm"
          className="tf-check-glow"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: meta.color, boxShadow: `0 0 8px -1px ${meta.color}` }}
          />
          <p className={cn('flex-1 text-[13px] font-medium leading-snug', done && 'line-through text-muted-foreground')}>
            {task.title}
          </p>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {Array.isArray(task.tags) && task.tags.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {task.tags.slice(0, 3).map((tt: any, i: number) => (
                <TagPill key={tt?.tag?.id || tt?.tagId || `${tt?.tag?.name}-${i}`} tag={tt.tag || tt} />
              ))}
              {task.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{task.tags.length - 3}</span>
              )}
            </span>
          )}
          {task.dueDate && (
            <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
              <Calendar className="h-2.5 w-2.5" />
              {formatDate(task.dueDate)}
            </span>
          )}
          <span
            className="rounded-md border px-1.5 py-px text-[10px] font-semibold"
            style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}
          >
            {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
}

function Donut({ values }: { values: { color: string; value: number; label: string }[] }) {
  const total = values.reduce((s, v) => s + v.value, 0);
  const R = 40;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-28 w-28 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--muted) / 0.35)" strokeWidth="11" />
          {total > 0 &&
            values.map((v, i) => {
              const frac = v.value / total;
              const el = (
                <circle
                  key={v.label + i}
                  cx="50" cy="50" r={R} fill="none"
                  stroke={v.color} strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={`${frac * C} ${C}`}
                  strokeDashoffset={-acc * C}
                />
              );
              acc += frac;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{total}</span>
          <span className="text-[9px] text-muted-foreground">задач</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {values.map((v) => (
          <div key={v.label} className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: v.color, boxShadow: `0 0 6px ${v.color}` }} />
            <span className="flex-1 truncate text-muted-foreground">{v.label}</span>
            <span className="tabular-nums font-semibold">{v.value}</span>
            <span className="w-9 text-right tabular-nums text-muted-foreground">
              {total > 0 ? `${Math.round((v.value / total) * 100)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EisenhowerMatrix() {
  const { tasks, todayTasks, overdueTasks, currentView } = useTasksStore();

  const allTasks = useMemo(() => {
    if (currentView === 'today') return todayTasks;
    if (currentView === 'overdue') return overdueTasks;
    return tasks;
  }, [currentView, tasks, todayTasks, overdueTasks]);

  const grouped = useMemo(() => {
    const map: Record<Quadrant, any[]> = {
      do: [],
      schedule: [],
      delegate: [],
      eliminate: [],
    };
    for (const task of allTasks) {
      map[getQuadrant(task)].push(task);
    }
    return map;
  }, [allTasks]);

  // Телефон: один квадрант за раз с переключателем (все 4 остаются доступны).
  const [mobileQuad, setMobileQuad] = useState<Quadrant>('do');

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4">
      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
        {/* Мобильный переключатель квадрантов */}
        <div className="grid grid-cols-2 gap-2 lg:hidden" role="tablist" aria-label="Квадранты матрицы">
          {QUADRANTS.map((q) => (
            <button
              key={q.id}
              role="tab"
              aria-selected={mobileQuad === q.id}
              type="button"
              onClick={() => setMobileQuad(q.id)}
              className={cn(
                'flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border px-2 py-2 text-[11px] font-semibold transition-all',
                mobileQuad === q.id ? 'text-white' : 'text-muted-foreground'
              )}
              style={
                mobileQuad === q.id
                  ? { borderColor: `${q.color}88`, background: `${q.color}26`, color: q.color, boxShadow: `0 0 16px -6px ${q.color}` }
                  : { borderColor: 'hsl(var(--border) / .6)', background: 'hsl(var(--card) / .5)' }
              }
            >
              <span className="truncate">{q.title}</span>
              <span className="tabular-nums">· {grouped[q.id].length}</span>
            </button>
          ))}
        </div>
        <div className="grid min-w-0 grid-cols-1 md:grid-cols-2 gap-3">
          {QUADRANTS.map((q) => {
            const Icon = q.icon;
            return (
              <div
                key={q.id}
                className={cn(
                  'min-h-[280px] flex-col rounded-3xl border tf-glass overflow-hidden',
                  mobileQuad === q.id ? 'flex' : 'hidden',
                  'lg:flex'
                )}
                style={{
                  borderColor: `${q.color}45`,
                  boxShadow: `0 0 28px -12px ${q.color}88, inset 0 1px 0 rgba(255,255,255,.05)`,
                  background: `linear-gradient(180deg, ${q.color}12, transparent 30%), hsl(var(--card) / 0.62)`,
                }}
              >
                <div className="flex items-center gap-2.5 px-3.5 py-3 border-b" style={{ borderColor: `${q.color}30` }}>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ color: q.color, border: `1.5px solid ${q.color}77`, background: `${q.color}14`, boxShadow: `0 0 14px -4px ${q.color}` }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[13px] font-bold" style={{ color: q.color }}>{q.title}</h3>
                    <p className="text-[10px] text-muted-foreground">{q.subtitle}</p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                    style={{ color: q.color, background: `${q.color}16`, border: `1px solid ${q.color}55` }}
                  >
                    {grouped[q.id].length}
                  </span>
                </div>
                <div className="flex-1 min-h-0 max-h-[46dvh] md:max-h-[52dvh] overflow-y-auto p-2.5 space-y-2 overscroll-contain">
                  {grouped[q.id].length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">
                      Нет задач
                    </p>
                  ) : (
                    grouped[q.id].map((task) => (
                      <MatrixCard key={task.id} task={task} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Правая колонка — как в референсе */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="tf-glass rounded-3xl p-4">
            <div className="mb-3 text-[13px] font-semibold">Статистика матрицы</div>
            <Donut
              values={[
                { color: '#ef4444', value: grouped.do.length, label: 'Срочно / Важно' },
                { color: '#3b82f6', value: grouped.schedule.length, label: 'Не срочно / Важно' },
                { color: '#f59e0b', value: grouped.delegate.length, label: 'Срочно / Не важно' },
                { color: '#22c55e', value: grouped.eliminate.length, label: 'Не срочно / Не важно' },
              ]}
            />
          </div>
          <div className="tf-glass rounded-3xl p-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              Полезный совет
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Сосредоточьтесь на задачах из квадранта «Не срочно / Важно» — они двигают вас к целям
              без стресса дедлайнов.
            </p>
          </div>
          <div className="tf-glass rounded-3xl p-4 flex items-start gap-2.5">
            <Quote className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs italic leading-relaxed text-muted-foreground">
              «Делай то, что важно, а не то, что срочно».
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
