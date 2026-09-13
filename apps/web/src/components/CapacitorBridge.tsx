'use client';

import { useEffect } from 'react';
import { useTasksStore } from '@/stores/tasks';
import { useBirthdaysStore } from '@/stores/birthdays';
import { useAuthStore } from '@/stores/auth';

/**
 * Native shell wiring (Android via Capacitor). Renders nothing and is a
 * no-op on the regular web build.
 */
export function CapacitorBridge() {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const cap = await import('@/lib/capacitor');
      if (cancelled || !cap.isNativeApp()) return;

      const openTask = (id: string) => {
        try {
          useTasksStore.getState().setSelectedTask(id);
        } catch {}
      };

      cleanup = await cap.initCapacitorBridge({ onOpenTask: openTask });

      // Cold start from a notification tap: open the task once stores hydrate.
      const pending = cap.consumeOpenTask();
      if (pending) {
        setTimeout(() => {
          if (!cancelled) openTask(pending);
        }, 1500);
      }

      const { expandRecurrence } = await import('@/lib/recurrence').catch(() => ({ expandRecurrence: null as any }));
      const { getNotifySound } = await import('@/lib/notifySound').catch(() => ({ getNotifySound: () => 'soft' as const }));
      let lastSound = getNotifySound();
      const keyOf = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const resync = async (force = false) => {
        if (cancelled) return;
        try {
          // A sound change must recreate channels + reschedule immediately.
          try {
            const snd = getNotifySound();
            if (snd !== lastSound) {
              lastSound = snd;
              force = true;
            }
          } catch {}
          if (!force) {
            const last = cap.lastNativeSyncAt();
            if (last && Date.now() - last < 15 * 60 * 1000) return;
          }
          const s = useTasksStore.getState();
          const b = useBirthdaysStore.getState();
          const u = useAuthStore.getState().user;
          const all = [...(s.tasks || []), ...(s.todayTasks || []), ...(s.recurringTasks || [])];
          const seen = new Set<string>();
          const unique = all.filter((t: any) => {
            if (!t || seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });
          // Recurring series: schedule their upcoming occurrences too.
          try {
            if (expandRecurrence) {
              const from = keyOf(new Date());
              const to = keyOf(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
              for (const t of s.recurringTasks || []) {
                for (const occ of expandRecurrence(t, from, to)) {
                  if (!occ || seen.has(occ.id)) continue;
                  seen.add(occ.id);
                  unique.push(occ);
                }
              }
            }
          } catch {}
          await cap.syncNativeReminders({
            tasks: unique,
            birthdays: b.items || [],
            userBirthday: (u as any)?.birthday ?? null,
          });
          // Retry FCM registration once logged in (no-op when registered).
          await cap.registerFcmToken().catch(() => {});
        } catch {}
      };

      await resync(true);
      const id = setInterval(() => void resync(false), 15 * 60 * 1000);
      // Returning to the app: make sure just-made changes are scheduled.
      // Cheap when nothing changed (signature check inside skips rescheduling).
      const onResume = () => void resync(true);
      document.addEventListener('visibilitychange', onResume);
      window.addEventListener('focus', onResume);
      // Reactive resync: ANY task/birthday mutation (create, edit time,
      // reminder, repeat, delete) reschedules within seconds — even if the
      // user closes the app right after. This is the main path that makes
      // reminders appear; the 15-minute timer is only a safety net.
      let debounceId: ReturnType<typeof setTimeout> | null = null;
      const scheduleResync = () => {
        if (cancelled) return;
        if (debounceId) clearTimeout(debounceId);
        debounceId = setTimeout(() => {
          debounceId = null;
          void resync(true);
        }, 2500);
      };
      const unsubTasks = useTasksStore.subscribe(() => scheduleResync());
      const unsubBdays = useBirthdaysStore.subscribe(() => scheduleResync());
      cleanup = (() => {
        const prev = cleanup;
        return () => {
          clearInterval(id);
          if (debounceId) clearTimeout(debounceId);
          try {
            unsubTasks();
          } catch {}
          try {
            unsubBdays();
          } catch {}
          document.removeEventListener('visibilitychange', onResume);
          window.removeEventListener('focus', onResume);
          if (prev) prev();
        };
      })();
    })().catch(() => {});

    return () => {
      cancelled = true;
      if (cleanup) {
        try {
          cleanup();
        } catch {}
      }
    };
  }, []);

  return null;
}
