'use client';

import { useMemo } from 'react';
import { useTasksStore } from '@/stores/tasks';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate, cn } from '@/lib/utils';
import { TagPill } from '@/components/tasks/TagPill';
import { Calendar } from 'lucide-react';

type Quadrant = 'do' | 'schedule' | 'delegate' | 'eliminate';

const QUADRANTS: {
  id: Quadrant;
  title: string;
  subtitle: string;
  color: string;
  bg: string;
  priorities: string[];
  urgent: boolean;
}[] = [
  {
    id: 'do',
    title: 'Сделать',
    subtitle: 'Срочно и важно',
    color: 'border-red-500',
    bg: 'bg-red-500/5',
    priorities: ['HIGH'],
    urgent: true,
  },
  {
    id: 'schedule',
    title: 'Запланировать',
    subtitle: 'Важно, не срочно',
    color: 'border-blue-500',
    bg: 'bg-blue-500/5',
    priorities: ['HIGH', 'MEDIUM'],
    urgent: false,
  },
  {
    id: 'delegate',
    title: 'Делегировать',
    subtitle: 'Срочно, не важно',
    color: 'border-amber-500',
    bg: 'bg-amber-500/5',
    priorities: ['LOW', 'NONE'],
    urgent: true,
  },
  {
    id: 'eliminate',
    title: 'Исключить',
    subtitle: 'Не срочно и не важно',
    color: 'border-gray-400',
    bg: 'bg-muted/30',
    priorities: ['LOW', 'NONE'],
    urgent: false,
  },
];

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
  const { setSelectedTask, completeTask, selectedTaskId } = useTasksStore();
  const isSelected = selectedTaskId === task.id;

  return (
    <div
      onClick={() => setSelectedTask(task.id)}
      className={cn(
        'flex items-start gap-2 rounded-xl tf-glass p-2.5 cursor-pointer hover:shadow-sm transition-shadow',
        isSelected && 'ring-2 ring-primary/40'
      )}
    >
      <div
        className="pt-0.5"
        onClick={(e) => {
          e.stopPropagation();
          completeTask(task.id);
        }}
      >
        <Checkbox
          checked={task.status === 'COMPLETED'}
          priority={task.priority}
          ghost
          size="sm"
          className="tf-check-glow"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-xs font-medium leading-snug',
            task.status === 'COMPLETED' && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </p>
        {task.tags?.[0] && (
          <span className="mt-1 inline-block">
            <TagPill tag={task.tags[0].tag} />
          </span>
        )}
        {task.dueDate && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
            <Calendar className="h-2.5 w-2.5" />
            {formatDate(task.dueDate)}
            {task.isAllDay === false &&
              ` · ${new Date(task.startDate || task.dueDate).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}
          </span>
        )}
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

  const glow: Record<Quadrant, string> = {
    do: '0 0 24px -8px rgba(239,68,68,.45)',
    schedule: '0 0 24px -8px rgba(59,130,246,.45)',
    delegate: '0 0 24px -8px rgba(245,158,11,.4)',
    eliminate: '0 0 24px -10px var(--tf-glow)',
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-[500px]">
        {QUADRANTS.map((q) => (
          <div
            key={q.id}
            className={cn('flex flex-col rounded-2xl tf-glass overflow-hidden', q.color)}
            style={{ boxShadow: glow[q.id], borderWidth: 1.5 }}
          >
            <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: q.id === 'do' ? '#ef4444' : q.id === 'schedule' ? '#3b82f6' : q.id === 'delegate' ? '#f59e0b' : '#9ca3af',
                  boxShadow: '0 0 8px -1px currentColor',
                }}
              />
              <div className="flex-1">
                <h3
                  className="text-sm font-semibold"
                  style={{ color: q.id === 'do' ? '#ef4444' : q.id === 'schedule' ? '#3b82f6' : q.id === 'delegate' ? '#f59e0b' : undefined }}
                >
                  {q.title}
                </h3>
                <p className="text-[11px] text-muted-foreground">{q.subtitle}</p>
              </div>
              <span className="text-[11px] font-semibold tabular-nums rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5">
                {grouped[q.id].length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {grouped[q.id].length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Нет задач
                </p>
              ) : (
                grouped[q.id].map((task) => (
                  <MatrixCard key={task.id} task={task} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="tf-glass rounded-2xl mt-3 p-3.5 flex items-center gap-3 max-w-xl">
        <span className="text-2xl shrink-0" role="img" aria-label="Мишень">
          🎯
        </span>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Фокус на важном — правильные приоритеты это 80% успеха.
        </p>
      </div>
    </div>
  );
}
