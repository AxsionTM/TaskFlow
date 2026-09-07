'use client';

import { useTasksStore } from '@/stores/tasks';
import { Checkbox } from '@/components/ui/checkbox';
import { cn, formatDate } from '@/lib/utils';
import { Calendar, Flag } from 'lucide-react';

const FLAG_COLOR: Record<string, string> = {
  HIGH: 'text-red-500 fill-red-500',
  MEDIUM: 'text-amber-500 fill-amber-500',
  LOW: 'text-blue-500 fill-blue-500',
  NONE: '',
};

export function TaskItem({ task, depth = 0 }: { task: any; depth?: number }) {
  const { selectedTaskId, setSelectedTask, completeTask, currentView } = useTasksStore();
  const isSelected = selectedTaskId === task.id;
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const due = task.dueDate ? new Date(task.dueDate) : null;
  // A task that finished earlier today is late by time, but remains in today's
  // list and only becomes officially overdue after the calendar day ends.
  const isTimeLateToday =
    Boolean(due) &&
    due!.getTime() < now.getTime() &&
    due!.getTime() >= todayStart.getTime() &&
    task.status !== 'COMPLETED';
  const isOverdue =
    Boolean(due) &&
    due!.getTime() < todayStart.getTime() &&
    task.status !== 'COMPLETED';
  const contextualDateLabel =
    currentView === 'today' && (task.startDate || task.dueDate)
      ? 'Сегодня'
      : currentView === 'tomorrow' && (task.startDate || task.dueDate)
      ? 'Завтра'
      : formatDate(task.dueDate || task.startDate);

  return (
    <div>
      <div
        onClick={() => setSelectedTask(task.id)}
        className={cn(
          'group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors',
          isSelected ? 'tf-task-active' : 'hover:bg-accent/60'
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            completeTask(task.id);
          }}
        >
          <Checkbox checked={task.status === 'COMPLETED'} priority={depth > 0 ? 'NONE' : task.priority} className={cn('tf-check-glow', depth > 0 && 'border-violet-400 data-[checked]:bg-violet-500')} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {depth > 0 ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,.55)]" title="Подзадача" />
            ) : task.priority && task.priority !== 'NONE' ? (
              <Flag className={cn('h-3.5 w-3.5 shrink-0', FLAG_COLOR[task.priority])} />
            ) : null}
            <p
              className={cn(
                'text-sm truncate',
                task.status === 'COMPLETED' && 'line-through text-muted-foreground'
              )}
            >
              {task.title}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.dueDate && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11px]',
                  isOverdue ? 'text-red-500' : isTimeLateToday ? 'text-amber-500' : 'text-muted-foreground'
                )}
              >
                <Calendar className="h-3 w-3" />
                {isOverdue ? 'Просрочено' : isTimeLateToday ? `${contextualDateLabel} · время прошло` : contextualDateLabel}
              </span>
            )}
            {task.tags?.map((tt: any) => {
              const color = tt.tag?.color || '#888888';
              return (
                <span
                  key={tt.tag?.id || tt.tagId}
                  className="tf-tag"
                  style={{
                    border: `1px solid ${color}99`,
                    color,
                    backgroundColor: `${color}1f`,
                    boxShadow: `0 0 10px -3px ${color}88`,
                  }}
                >
                  {tt.tag?.name}
                </span>
              );
            })}
            {task.project && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: task.project.color }}
                />
                {task.project.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {task.children?.length > 0 &&
        task.children.map((child: any) => (
          <TaskItem key={child.id} task={child} depth={depth + 1} />
        ))}
    </div>
  );
}
