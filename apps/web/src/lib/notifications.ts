export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

import { playNotifySound, type NotifySoundId } from './notifySound';

/** Returns true only when the notification was actually shown. */
export function showNotification(
  title: string,
  options?: NotificationOptions & { sound?: NotifySoundId }
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const { sound, ...rest } = options || {};
  try {
    new Notification(title, {
      icon: '/logo-tf.png',
      ...rest,
    });
    playNotifySound(sound);
    return true;
  } catch {
    // e.g. mobile browsers without `new Notification()` support
    return false;
  }
}

/** Notify about overdue and due-today tasks (once per day session). */
export function notifyDueTasks(overdue: any[], today: any[]) {
  if (typeof window === 'undefined') return;
  const key = `tf-notified-${new Date().toISOString().slice(0, 10)}`;
  if (sessionStorage.getItem(key)) return;

  const overdueCount = overdue.length;
  const todayOpen = today.filter((t) => t.status !== 'COMPLETED').length;

  if (overdueCount === 0 && todayOpen === 0) return;

  let body = '';
  if (overdueCount > 0) body += `Просрочено: ${overdueCount}. `;
  if (todayOpen > 0) body += `На сегодня: ${todayOpen}.`;

  showNotification('TaskFlow — напоминание', {
    body: body.trim(),
    tag: 'taskflow-daily',
  });

  sessionStorage.setItem(key, '1');
}

/** Resolve fire times for a task: explicit server reminders + sensible defaults. */
export function reminderFireTimes(t: any): number[] {
  if (!t || t.status === 'COMPLETED') return [];
  const times: number[] = [];
  // Tasks may have only startDate (end time removed) — notify on it as well.
  const anchorRaw = t.dueDate || t.startDate;
  const due = anchorRaw ? new Date(anchorRaw).getTime() : NaN;
  if (Array.isArray(t.reminders)) {
    for (const r of t.reminders) {
      if (r?.isSent) continue;
      const at = new Date(r.remindAt).getTime();
      if (!Number.isNaN(at) && !times.includes(at)) times.push(at);
    }
  }
  if (!Number.isNaN(due)) {
    // Defaults so tasks without explicit settings still notify.
    if (!times.includes(due)) times.push(due);
    const early = due - 15 * 60 * 1000;
    if (!times.includes(early)) times.push(early);
  }
  return times.sort((a, b) => a - b);
}

/** Local schedule: fire when a fire time is reached (client-side). */
export function checkLocalReminders(
  tasks: any[],
  fired: Set<string>,
  markFired: (id: string) => void,
  sound?: NotifySoundId
) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = Date.now();
  for (const t of tasks) {
    if (t.status === 'COMPLETED') continue;
    const anchorRaw = t.dueDate || t.startDate;
    const due = anchorRaw ? new Date(anchorRaw).getTime() : NaN;
    for (const at of reminderFireTimes(t)) {
      const key = `${t.id}-${at}`;
      if (fired.has(key)) continue;
      // 5-minute window: background tabs throttle timers to ~1/min,
      // so a 60s poll can otherwise miss the fire time entirely.
      if (now >= at && now < at + 300_000) {
        const mins = Number.isNaN(due) ? null : Math.round((due - at) / 60000);
        const when =
          mins === null || mins <= 0 ? 'Сейчас срок' : `Через ${mins} мин срок`;
        // Mark fired only when actually shown — otherwise retry next tick.
        if (
          showNotification(t.title, {
            body: when,
            tag: key,
            requireInteraction: mins === 0,
            sound,
          })
        ) {
          markFired(key);
        }
      }
    }
  }
}
