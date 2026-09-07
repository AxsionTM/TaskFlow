'use client';

import { useTasksStore } from '@/stores/tasks';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export const PRIORITY_TINT: Record<string, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#3b82f6',
  NONE: '#22a06b',
};

export function taskTimeLabel(task: any): string {
  const raw = task.startDate || task.dueDate;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function TaskCard({ task }: { task: any }) {
  const { setSelectedTask, completeTask } = useTasksStore();
  const color =
    task.tags?.[0]?.tag?.color || task.project?.color || PRIORITY_TINT[task.priority || 'NONE'] || '#888888';
  const tagName = task.tags?.[0]?.tag?.name || task.project?.name || '';
  const letter = (task.title || '?').trim().slice(0, 1).toUpperCase();

  return (
    <div
      onClick={() => setSelectedTask(task.id)}
      className="tf-glass rounded-2xl px-3.5 py-3 flex items-center gap-3 cursor-pointer transition-transform hover:scale-[1.005]"
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          completeTask(task.id);
        }}
      >
        <Checkbox checked={task.status === 'COMPLETED'} priority={task.priority} className="tf-check-glow" />
      </div>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
        style={{
          color,
          background: `${color}1a`,
          border: `1.5px solid ${color}66`,
          boxShadow: `0 0 16px -4px ${color}88`,
        }}
      >
        {letter}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={cn(
            'block truncate text-[15px] font-medium',
            task.status === 'COMPLETED' && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </span>
        {tagName && (
          <span
            className="tf-tag mt-1 inline-block"
            style={{
              border: `1px solid ${color}99`,
              color,
              backgroundColor: `${color}1f`,
              boxShadow: `0 0 10px -3px ${color}88`,
            }}
          >
            {tagName}
          </span>
        )}
      </span>
      {taskTimeLabel(task) && (
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{taskTimeLabel(task)}</span>
      )}
    </div>
  );
}
