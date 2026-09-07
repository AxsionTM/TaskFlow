'use client';

import { useTasksStore } from '@/stores/tasks';
import { Checkbox } from '@/components/ui/checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TagPill } from '@/components/tasks/TagPill';

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

export function TaskCard({
  task,
  flat,
  ringColor,
}: {
  task: any;
  flat?: boolean;
  ringColor?: string;
}) {
  const { setSelectedTask, completeTask } = useTasksStore();
  const color =
    ringColor ||
    task.tags?.[0]?.tag?.color ||
    task.project?.color ||
    PRIORITY_TINT[task.priority || 'NONE'] ||
    '#888888';
  const tag = task.tags?.[0]?.tag || null;
  const tagName = tag ? tag.name : task.project?.name || '';
  const letter = (task.title || '?').trim().slice(0, 1).toUpperCase();
  const checked = task.status === 'COMPLETED';

  return (
    <div
      onClick={() => setSelectedTask(task.id)}
      className={cn(
        'px-3.5 py-3 flex items-center gap-3 cursor-pointer transition-transform hover:scale-[1.005]',
        flat ? 'rounded-none' : 'tf-glass rounded-2xl'
      )}
    >
      {ringColor ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={(e) => {
            e.stopPropagation();
            completeTask(task.id);
          }}
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 bg-transparent"
          style={{
            borderColor: ringColor,
            color: ringColor,
            boxShadow: `0 0 12px -2px ${ringColor}`,
          }}
        >
          {checked && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
        </button>
      ) : (
        <div
          onClick={(e) => {
            e.stopPropagation();
            completeTask(task.id);
          }}
        >
          <Checkbox checked={checked} priority={task.priority} ghost size="md" className="tf-check-glow" />
        </div>
      )}
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
            checked && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </span>
        {tagName && (
          <span className="mt-1 inline-block">
            <TagPill tag={tag || { name: tagName, color: task.project?.color }} />
          </span>
        )}
      </span>
      {taskTimeLabel(task) && (
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{taskTimeLabel(task)}</span>
      )}
    </div>
  );
}
