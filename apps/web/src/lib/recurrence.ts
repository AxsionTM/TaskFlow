import { addDays, addMonths, addYears, format } from 'date-fns';

export type RecurrenceRule = {
  interval?: number;
  end?: string | null;
  skip?: string[];
};

export function parseRecurrenceRule(task: any): RecurrenceRule {
  const raw = task?.recurrenceRule;
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        interval: typeof parsed.interval === 'number' ? Math.min(30, Math.max(1, Math.floor(parsed.interval))) : 1,
        end: typeof parsed.end === 'string' ? parsed.end.slice(0, 10) : null,
        skip: Array.isArray(parsed.skip) ? parsed.skip.filter((s: unknown) => typeof s === 'string') : [],
      };
    }
  } catch {
    // legacy plain-string rule: treat as default recurrence
  }
  return {};
}

export function isRecurring(task: any): boolean {
  return Boolean(task) && task.recurrenceType && task.recurrenceType !== 'NONE' && !isOccurrence(task);
}

export function isOccurrence(task: any): boolean {
  return Boolean(task?.isOccurrence) || (typeof task?.id === 'string' && task.id.includes('@'));
}

export function occurrenceBaseId(task: any): string {
  if (typeof task?.baseId === 'string') return task.baseId;
  if (typeof task?.id === 'string' && task.id.includes('@')) return task.id.split('@')[0];
  return task?.id;
}

/** ID to open in detail view: occurrences open their base task. */
export function detailId(task: any): string {
  return occurrenceBaseId(task);
}

function toKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function timeOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'HH:mm');
}

function atTime(key: string, time: string | null, fallbackNoon = true): string {
  if (time) return new Date(`${key}T${time}:00`).toISOString();
  return new Date(`${key}T${fallbackNoon ? '12:00' : '00:00'}:00`).toISOString();
}

function stepDate(d: Date, type: string, interval: number): Date {
  if (type === 'WEEKLY') return addDays(d, 7 * interval);
  if (type === 'MONTHLY') return addMonths(d, interval);
  if (type === 'YEARLY') return addYears(d, interval);
  // CUSTOM has no structured rule: fall back to a weekly step.
  if (type === 'CUSTOM') return addDays(d, 7 * interval);
  return addDays(d, interval);
}

/**
 * Expand a recurring base task into virtual occurrences between date keys.
 * Times of day are preserved; skipped instances are excluded.
 */
export function expandRecurrence(task: any, fromKey: string, to: string, cap = 60): any[] {
  if (!isRecurring(task) || task.status === 'COMPLETED') return [];
  const rule = parseRecurrenceRule(task);
  const skip = new Set(rule.skip || []);
  const interval = rule.interval || 1;
  const anchorRaw = task.dueDate || task.startDate;
  if (!anchorRaw) return [];
  const anchor = new Date(anchorRaw);
  if (Number.isNaN(anchor.getTime())) return [];

  const startT = timeOf(task.startDate);
  const dueT = timeOf(task.dueDate);
  const out: any[] = [];
  let current = new Date(anchor);
  // Align to anchor day; occurrences never go before the base date.
  const anchorKey = toKey(anchor);
  let guard = 0;
  while (out.length < cap && guard < 500) {
    guard++;
    const key = toKey(current);
    if (key > to) break;
    if (rule.end && key > rule.end) break;
    if (key >= fromKey && key >= anchorKey && !skip.has(key)) {
      out.push({
        ...task,
        id: `${task.id}@${key}`,
        baseId: task.id,
        isOccurrence: true,
        occurrenceDate: key,
        startDate: task.startDate ? atTime(key, startT) : null,
        dueDate: task.dueDate ? atTime(key, dueT) : task.startDate ? atTime(key, startT) : null,
      });
    }
    const next = stepDate(current, task.recurrenceType, interval);
    if (toKey(next) <= key) break;
    current = next;
  }
  return out;
}

/**
 * All calendar days touched by a task interval [startDate, dueDate].
 * Single-day tasks return one key.
 */
export function taskSpanKeys(task: any): string[] {
  const startRaw = task?.startDate;
  const dueRaw = task?.dueDate;
  if (startRaw && dueRaw) {
    const s = new Date(startRaw);
    const e = new Date(dueRaw);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      const sk = toKey(s);
      const ek = toKey(e);
      if (sk !== ek) {
        const keys: string[] = [];
        let cur = new Date(`${sk}T12:00:00`);
        let guard = 0;
        while (toKey(cur) <= ek && guard < 400) {
          keys.push(toKey(cur));
          cur = addDays(cur, 1);
          guard++;
        }
        return keys;
      }
    }
  }
  const single = dueRaw || startRaw;
  if (!single) return [];
  const d = new Date(single);
  if (Number.isNaN(d.getTime())) return [];
  return [toKey(d)];
}

/**
 * Merge base lists with virtual occurrences for a date range.
 * Recurring bases are replaced by their occurrences inside the range
 * (an occurrence IS the task on that day).
 */
export function mergeWithOccurrences(baseList: any[], recurring: any[], fromKey: string, toKey: string): any[] {
  const list = Array.isArray(baseList) ? baseList : [];
  const rec = Array.isArray(recurring) ? recurring.filter((t) => isRecurring(t)) : [];
  if (!rec.length) return list;
  const occurrences = rec.flatMap((t) => expandRecurrence(t, fromKey, toKey));
  // Every recurring base is represented by its occurrences inside day views,
  // never by the base row itself. Using ALL base ids (not only those with
  // occurrences in range) also hides the base on days whose instance was
  // skipped via skip-occurrence — otherwise the completed/deleted instance
  // would reappear as the base task (the server /today query is span-based
  // and doesn't know about the client-side skip list).
  const covered = new Set(rec.map((o) => o.id));
  const rest = list.filter((t) => {
    if (isOccurrence(t)) return true;
    if (covered.has(t.id)) {
      // Base is represented by occurrences; keep it only outside the range.
      const keys = taskSpanKeys(t);
      return !keys.some((k) => k >= fromKey && k <= toKey);
    }
    return true;
  });
  const merged = [...rest, ...occurrences];
  merged.sort((a: any, b: any) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    return da - db;
  });
  return merged;
}

const RECURRENCE_LABELS: Record<string, string> = {
  DAILY: 'Ежедневно',
  WEEKLY: 'Еженедельно',
  MONTHLY: 'Ежемесячно',
  YEARLY: 'Ежегодно',
  CUSTOM: 'Свой повтор',
};

export function recurrenceLabel(task: any): string | null {
  if (!isRecurring(task)) return null;
  const rule = parseRecurrenceRule(task);
  const base = RECURRENCE_LABELS[task.recurrenceType] || task.recurrenceType;
  const every = rule.interval && rule.interval > 1 ? ` · каждые ${rule.interval}` : '';
  const until = rule.end ? ` · до ${rule.end.split('-').reverse().join('.')}` : '';
  return `${base}${every}${until}`;
}
