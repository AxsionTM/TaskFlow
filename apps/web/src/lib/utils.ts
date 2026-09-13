import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === tomorrow.toDateString()) return 'Завтра';

  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

export const priorityLabels: Record<string, string> = {
  NONE: 'Нет',
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
};

export const priorityColors: Record<string, string> = {
  NONE: 'bg-emerald-600',
  LOW: 'bg-blue-500',
  MEDIUM: 'bg-amber-500',
  HIGH: 'bg-red-500',
};

/** End of a task (deadline, fall back to start). NaN when undated. */
export function taskEndMs(task: any): number {
  const raw = task?.dueDate ?? task?.startDate;
  return raw ? new Date(raw).getTime() : NaN;
}

/**
 * Overdue = end time passed and not completed. Timed tasks turn red
 * intraday (e.g. 14:20–14:50 at 14:54); all-day/date-only tasks only
 * after the calendar day ends.
 */
export function isTaskOverdue(task: any, now: number = Date.now()): boolean {
  if (!task || task.status === 'COMPLETED') return false;
  const end = taskEndMs(task);
  if (Number.isNaN(end) || end >= now) return false;
  if (task.isAllDay !== false) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    return end < dayStart.getTime();
  }
  return true;
}
