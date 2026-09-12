'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { checkLocalReminders, showNotification } from '@/lib/notifications';
import { useTasksStore } from '@/stores/tasks';
import { useBirthdaysStore, isSameMonthDay, ageFromDate } from '@/stores/birthdays';
import { useAuthStore } from '@/stores/auth';

export function ReminderWorker() {
  const firedRef = useRef<Set<string>>(new Set());
  const fetchBirthdays = useBirthdaysStore((s) => s.fetch);

  useEffect(() => {
    fetchBirthdays();
  }, [fetchBirthdays]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tick = async () => {
      if (api.isMaintenanceKnown()) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const state = useTasksStore.getState();
      const all = [...state.tasks, ...state.todayTasks, ...state.overdueTasks];
      const seen = new Set<string>();
      const unique = all.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      checkLocalReminders(unique, firedRef.current, (id) => firedRef.current.add(id));

      const birthdays = useBirthdaysStore.getState().items;
      const user = useAuthStore.getState().user;
      const now = new Date();

      for (const b of birthdays) {
        const key = `bday-${b.id}-${now.toISOString().slice(0, 10)}`;
        if (firedRef.current.has(key)) continue;
        const target = new Date(b.date);
        target.setFullYear(now.getFullYear());
        const remindAt = new Date(target);
        remindAt.setDate(remindAt.getDate() - (b.remindDays || 0));
        if (
          now.getFullYear() === remindAt.getFullYear() &&
          now.getMonth() === remindAt.getMonth() &&
          now.getDate() === remindAt.getDate()
        ) {
          showNotification(`День рождения: ${b.name}`, {
            body: `${ageFromDate(b.date)} лет · ${b.note || 'Не забудьте поздравить!'}`,
            tag: key,
          });
          firedRef.current.add(key);
        }
      }

      if (user?.birthday && isSameMonthDay(String(user.birthday), now)) {
        const key = `bday-me-${now.toISOString().slice(0, 10)}`;
        if (!firedRef.current.has(key)) {
          showNotification('С днём рождения!', {
            body: 'Пусть день будет продуктивным и приятным!',
            tag: key,
          });
          firedRef.current.add(key);
        }
      }

      try {
        const { reminders } = await api.getPendingReminders();
        for (const r of reminders) {
          if (firedRef.current.has(`api-${r.id}`)) continue;
          const at = new Date(r.remindAt).getTime();
          if (Date.now() + 120_000 < at) continue;
          showNotification(r.task?.title || 'Напоминание TaskFlow', {
            body: r.task?.dueDate
              ? `Срок: ${new Date(r.task.dueDate).toLocaleString('ru-RU')}`
              : 'Пора выполнить задачу',
            tag: `reminder-${r.id}`,
          });
          firedRef.current.add(`api-${r.id}`);
          await api.markReminderSent(r.id).catch(() => {});
        }
      } catch {
        // offline / unauthorized — ignore
      }
    };

    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
