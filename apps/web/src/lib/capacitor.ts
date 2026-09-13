'use client';

// Capacitor native bridge. Every function is a safe no-op on the regular
// web build — native code paths run only inside the Android WebView
// (window.Capacitor is injected there by the native shell).
// Imports of @capacitor/* are dynamic so the web bundle stays untouched.

import { reminderFireTimes, showNotification } from './notifications';
import { getNotifySound } from './notifySound';

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  try {
    return Boolean(w.Capacitor && typeof w.Capacitor.isNativePlatform === 'function' && w.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

const OPEN_TASK_KEY = 'tf-open-task';
const SCHED_KEY = 'tf-native-sched';
const SYNC_KEY = 'tf-native-sync-at';

export function stashOpenTask(id: string) {
  try {
    localStorage.setItem(OPEN_TASK_KEY, id);
  } catch {}
}

export function consumeOpenTask(): string | null {
  try {
    const v = localStorage.getItem(OPEN_TASK_KEY);
    if (v) localStorage.removeItem(OPEN_TASK_KEY);
    return v;
  } catch {
    return null;
  }
}

function stableId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 2000000000);
}

/** Debug logs for the notification pipeline. Never logs secrets/tokens. */
function logN(event: string, details?: Record<string, unknown>) {
  try {
    if (details) console.debug('[TaskFlow Notifications]', event, details);
    else console.debug('[TaskFlow Notifications]', event);
  } catch {}
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    return 'unknown';
  }
}

function soundResource(): string {
  // Maps the in-app sound choice to a bundled android res/raw file (no ext).
  const map: Record<string, string> = {
    soft: 'notify_soft',
    chime: 'notify_chime',
    bells: 'notify_bells',
    digital: 'notify_digital',
    silent: '',
  };
  try {
    return map[getNotifySound()] ?? 'notify_soft';
  } catch {
    return 'notify_soft';
  }
}

const DIAG_KEY = 'tf-native-diag';
const CHANNEL_SOUND_KEY = 'tf-channel-sound';

export interface NativeDiag {
  perm: string;
  channelSound: string;
  scheduled: number;
  lastSyncAt: number | null;
  fcm: string;
  testAt: number | null;
  testOk: boolean | null;
  error: string;
  timezone: string;
}

function readDiag(): NativeDiag {
  const d: NativeDiag = {
    perm: 'unknown',
    channelSound: '',
    scheduled: 0,
    lastSyncAt: null,
    fcm: 'unknown',
    testAt: null,
    testOk: null,
    error: '',
    timezone: deviceTimeZone(),
  };
  try {
    const raw = localStorage.getItem(DIAG_KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch {}
  return d;
}

function writeDiag(patch: Partial<NativeDiag>) {
  try {
    localStorage.setItem(DIAG_KEY, JSON.stringify({ ...readDiag(), ...patch }));
  } catch {}
}

export function getNativeDiag(): NativeDiag {
  return readDiag();
}

/**
 * Android 8+ takes the sound from the notification CHANNEL, not from the
 * payload — and the system remembers channel settings after creation.
 * So the channel must be (re)created with the user's current sound.
 * We keep exactly two channel ids and delete+recreate them only when the
 * chosen sound changes (no unbounded channel growth).
 */
async function ensureChannels(): Promise<void> {
  const sound = (() => {
    try {
      return getNotifySound();
    } catch {
      return 'soft';
    }
  })();
  const res = sound === 'silent' ? undefined : soundResource() || undefined;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let prevSound: string | null = null;
  try {
    prevSound = localStorage.getItem(CHANNEL_SOUND_KEY);
  } catch {}
  if (prevSound !== null && prevSound !== sound) {
    // Sound changed (or first run after the sound-aware update): drop the
    // channels so they are recreated below with the new sound.
    await LocalNotifications.deleteChannel({ id: 'tf-reminders' }).catch(() => {});
    await LocalNotifications.deleteChannel({ id: 'tf-birthdays' }).catch(() => {});
  }
  // Importance: 4 = High (numeric union type in plugin v8).
  await LocalNotifications.createChannel({
    id: 'tf-reminders',
    name: 'Напоминания задач',
    description: 'Сроки и напоминания TaskFlow',
    importance: 4,
    sound: res,
    vibration: true,
    visibility: 1,
  }).catch(() => {});
  await LocalNotifications.createChannel({
    id: 'tf-birthdays',
    name: 'Дни рождения',
    description: 'Напоминания о днях рождения',
    importance: 4,
    sound: res,
    vibration: true,
    visibility: 1,
  }).catch(() => {});
  try {
    localStorage.setItem(CHANNEL_SOUND_KEY, sound);
  } catch {}
  writeDiag({ channelSound: sound });
}

export interface TestNotifResult {
  ok: boolean;
  system: 'native' | 'web' | 'none';
  error?: string;
}

/**
 * Guaranteed REAL system notification for the «Проверить уведомление»
 * button. On Android: an immediate native local notification (no toast,
 * no in-page alert). On web: the browser Notification API as before.
 */
export async function sendTestNotification(): Promise<TestNotifResult> {
  if (isNativeApp()) {
    try {
      const ok = await requestNativeNotifPermission();
      writeDiag({ perm: ok ? 'granted' : 'denied' });
      if (!ok) {
        writeDiag({ testAt: Date.now(), testOk: false, error: 'permission-denied' });
        return { ok: false, system: 'native', error: 'Разрешите уведомления в настройках Android' };
      }
      await ensureChannels();
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const testId = stableId(`test|${Date.now()}`);
      logN('test notification requested', { id: testId, sound: getNotifySound() });
      await LocalNotifications.schedule({
        notifications: [
          {
            id: testId,
            title: 'Задача началась',
            body: 'Проверочное уведомление TaskFlow',
            channelId: 'tf-reminders',
            sound: soundResource() || undefined,
            autoCancel: true,
            extra: { kind: 'test' },
          },
        ],
      });
      logN('native notification created', { id: testId, kind: 'test' });
      writeDiag({ testAt: Date.now(), testOk: true, error: '' });
      return { ok: true, system: 'native' };
    } catch (e: any) {
      const msg = String(e?.message || e || 'native-error');
      writeDiag({ testAt: Date.now(), testOk: false, error: msg.slice(0, 200) });
      return { ok: false, system: 'native', error: msg };
    }
  }
  try {
    const shown = showNotification('TaskFlow — проверка', {
      body: 'Если вы видите это сообщение и слышите звук — уведомления работают.',
      tag: 'tf-notif-test',
      sound: (() => {
        try {
          return getNotifySound();
        } catch {
          return 'soft';
        }
      })(),
    });
    return shown ? { ok: true, system: 'web' } : { ok: false, system: 'none', error: 'Разрешите уведомления в браузере' };
  } catch (e: any) {
    return { ok: false, system: 'none', error: String(e?.message || e) };
  }
}

export async function requestNativeNotifPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const cur = await LocalNotifications.checkPermissions().catch(() => null);
    logN('permission status', { display: cur?.display ?? 'unknown' });
    if (cur?.display === 'granted') {
      writeDiag({ perm: 'granted' });
      return true;
    }
    if (cur?.display === 'denied') {
      writeDiag({ perm: 'denied' });
      return false;
    }
    const res = await LocalNotifications.requestPermissions();
    const granted = res.display === 'granted';
    logN('permission requested', { display: res.display });
    writeDiag({ perm: granted ? 'granted' : 'denied' });
    return granted;
  } catch {
    return false;
  }
}

interface SyncInput {
  tasks: any[];
  birthdays: any[];
  userBirthday?: string | null;
}

/**
 * Mirror upcoming fires into exact Android alarms (AlarmManager behind
 * @capacitor/local-notifications). This is the primary offline mechanism:
 * alarms survive the app being closed. Called on start/resume/refresh —
 * NOT on a timer loop (no setInterval-based delivery).
 */
export async function syncNativeReminders(input: SyncInput): Promise<number> {
  if (!isNativeApp()) return 0;
  try {
    const ok = await requestNativeNotifPermission();
    if (!ok) {
      writeDiag({ error: 'permission-denied' });
      return 0;
    }
    await ensureChannels();
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    const now = Date.now();
    const horizon = now + 7 * 24 * 60 * 60 * 1000;
    const sound = soundResource();
    const tz = deviceTimeZone();
    logN('sync started', { timezone: tz, tasks: (input.tasks || []).length, sound });
    const list: any[] = [];

    for (const t of input.tasks || []) {
      if (!t || t.status === 'COMPLETED') continue;
      const dueMs = t.dueDate ? new Date(t.dueDate).getTime() : NaN;
      const startMs = t.startDate ? new Date(t.startDate).getTime() : NaN;
      const anchorMs = !Number.isNaN(dueMs) ? dueMs : startMs;
      const baseId = typeof t.baseId === 'string' ? t.baseId : String(t.id).split('@')[0];
      for (const at of reminderFireTimes(t)) {
        if (at <= now || at > horizon) continue;
        const taskTitle = String(t.title || 'TaskFlow');
        const isStartExact =
          !Number.isNaN(startMs) &&
          Math.abs(at - startMs) < 60000 &&
          (Number.isNaN(dueMs) || Math.abs(dueMs - startMs) >= 60000);
        const isDueExact = !Number.isNaN(dueMs) && Math.abs(at - dueMs) < 60000;
        const mins = Number.isNaN(anchorMs) ? null : Math.round((anchorMs - at) / 60000);
        const isMoment = isStartExact || isDueExact || mins === null || (mins !== null && mins <= 0);
        list.push({
          id: stableId(`task|${baseId}|${at}`),
          title: isMoment ? 'Задача началась' : taskTitle,
          body: isMoment ? taskTitle : `Начнётся через ${mins} мин`,
          at,
          channel: 'tf-reminders',
          extra: { kind: 'task', taskId: baseId },
        });
        if (list.length >= 50) break;
      }
      if (list.length >= 50) break;
    }

    // Birthdays (today and remindDays-ahead), fired at 09:00 local.
    const seenBday = new Set<string>();
    const pushBday = (name: string, key: string) => {
      if (seenBday.has(key)) return;
      seenBday.add(key);
      const fire = new Date();
      fire.setHours(9, 0, 0, 0);
      const at = fire.getTime();
      if (at <= now || at > horizon) return;
      if (list.length >= 60) return;
      list.push({
        id: stableId(`bday|${key}|${at}`),
        title: `День рождения: ${name}`,
        body: 'Не забудьте поздравить! 🎂',
        at,
        channel: 'tf-birthdays',
        extra: { kind: 'birthday' },
      });
    };
    try {
      const today = new Date();
      const sameMD = (iso: string, d: Date) => {
        const x = new Date(iso);
        return x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
      };
      for (const b of input.birthdays || []) {
        const target = new Date(b.date);
        target.setFullYear(today.getFullYear());
        const remindAt = new Date(target);
        remindAt.setDate(remindAt.getDate() - (Number(b.remindDays) || 0));
        if (sameMD(remindAt.toISOString(), today)) pushBday(String(b.name), String(b.id));
      }
      if (input.userBirthday && sameMD(String(input.userBirthday), today)) {
        pushBday('у вас', 'me');
      }
    } catch {}

    // Signature: skip rescheduling when nothing changed (sound included —
    // a sound change must recreate channels + reschedule).
    const sig = JSON.stringify([sound, list.map((n) => [n.id, n.at])]);
    let prevSig: string | null = null;
    let prevIds: number[] = [];
    try {
      prevSig = localStorage.getItem(SCHED_KEY + ':sig');
      prevIds = JSON.parse(localStorage.getItem(SCHED_KEY + ':ids') || '[]');
    } catch {}
    if (prevSig === sig) {
      writeDiag({ scheduled: list.length, lastSyncAt: Date.now(), error: '', timezone: tz });
      return list.length;
    }

    const nextIds = list.map((n) => n.id);
    const stale = prevIds.filter((id) => !nextIds.includes(id));
    if (stale.length) {
      logN('notification cancelled', { count: stale.length, ids: stale.slice(0, 20) });
      await LocalNotifications.cancel({ notifications: stale.map((id) => ({ id })) }).catch(() => {});
    }
    if (list.length) {
      logN('notification scheduled', {
        count: list.length,
        sample: list.slice(0, 5).map((n) => ({ id: n.id, at: new Date(n.at).toISOString() })),
        timezone: tz,
      });
      await LocalNotifications.schedule({
        notifications: list.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          schedule: { at: new Date(n.at), allowWhileIdle: true },
          channelId: n.channel,
          sound: sound || undefined,
          autoCancel: true,
          extra: n.extra,
        })),
      }).catch((e: any) => {
        logN('schedule error', { error: String(e?.message || e).slice(0, 200) });
      });
    }
    logN('sync finished', { tasksFound: (input.tasks || []).length, scheduled: list.length, timezone: tz });
    try {
      localStorage.setItem(SCHED_KEY + ':sig', sig);
      localStorage.setItem(SCHED_KEY + ':ids', JSON.stringify(nextIds));
      localStorage.setItem(SYNC_KEY, String(Date.now()));
    } catch {}
    writeDiag({ scheduled: list.length, lastSyncAt: Date.now(), error: '', timezone: tz });
    return list.length;
  } catch (e: any) {
    const msg = String(e?.message || e || 'sync-error').slice(0, 200);
    logN('sync error', { error: msg });
    writeDiag({ error: msg });
    return 0;
  }
}

export function lastNativeSyncAt(): number | null {
  try {
    const v = localStorage.getItem(SYNC_KEY);
    return v ? Number(v) || null : null;
  } catch {
    return null;
  }
}

interface BridgeOpts {
  onOpenTask: (id: string) => void;
}

/** Back button, notification taps, deep links, FCM token registration. */
export async function initCapacitorBridge(opts: BridgeOpts): Promise<() => void> {
  const cleanups: Array<() => void> = [];
  if (!isNativeApp()) return () => {};

  try {
    const { App } = await import('@capacitor/app');
    const back = await App.addListener('backButton', () => {
      try {
        if (window.history.length > 1) window.history.back();
        else App.minimizeApp().catch(() => {});
      } catch {}
    });
    cleanups.push(() => back.remove());

    const open = await App.addListener('appUrlOpen', (data: any) => {
      try {
        const url = String(data?.url || '');
        const m = url.match(/task\/([A-Za-z0-9_-]+)/);
        if (m) opts.onOpenTask(m[1]);
      } catch {}
    });
    cleanups.push(() => open.remove());
  } catch {}

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const tap = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action: any) => {
        try {
          const taskId = action?.notification?.extra?.taskId;
          if (taskId) {
            stashOpenTask(String(taskId));
            opts.onOpenTask(String(taskId));
          }
        } catch {}
      }
    );
    cleanups.push(() => tap.remove());
  } catch {}

  // FCM foreground display + tap handling (listeners are safe without
  // google-services.json — they simply never fire).
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const fg = await PushNotifications.addListener('pushNotificationReceived', async (n: any) => {
      try {
        await ensureChannels();
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const data = (n && n.data) || {};
        await LocalNotifications.schedule({
          notifications: [
            {
              id: stableId(`fcm|${String(data.tag || Date.now())}`),
              title: String(n.title || 'TaskFlow'),
              body: String(n.body || ''),
              schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
              channelId: data.type === 'birthday' ? 'tf-birthdays' : 'tf-reminders',
              sound: soundResource() || undefined,
              autoCancel: true,
              extra: { kind: String(data.type || 'task'), taskId: data.taskId },
            },
          ],
        }).catch(() => {});
      } catch {}
    });
    cleanups.push(() => fg.remove());
    const tap = await PushNotifications.addListener('pushNotificationActionPerformed', (a: any) => {
      try {
        const d = (a && a.notification && a.notification.data) || {};
        if (d.taskId) {
          stashOpenTask(String(d.taskId));
          opts.onOpenTask(String(d.taskId));
          return;
        }
        const m = String(d.url || '').match(/task\/([A-Za-z0-9_-]+)/);
        if (m) {
          stashOpenTask(m[1]);
          opts.onOpenTask(m[1]);
        }
      } catch {}
    });
    cleanups.push(() => tap.remove());
  } catch {}

  // FCM (graceful when google-services.json is absent): register token once
  // a logged-in session exists; backend stores it for server push.
  try {
    await registerFcmToken().catch(() => {});
  } catch {}

  return () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {}
    }
  };
}

export async function registerFcmToken(): Promise<boolean> {
  if (!isNativeApp()) return false;
  // Firebase is NOT configured in this build: no google-services.json and no
  // server credentials. Calling PushNotifications.register() would throw
  // IllegalStateException natively ("Default FirebaseApp is not initialized")
  // on the bridge thread, killing the whole app process — and that cannot be
  // caught from JS. So registration is intentionally skipped; local
  // notifications are the delivery mechanism. (checkPermissions /
  // requestPermissions / addListener never touch Firebase and stay safe.)
  // Re-enable the block below only together with google-services.json +
  // FIREBASE_SERVICE_ACCOUNT_JSON on the backend.
  writeDiag({ fcm: 'unavailable' });
  logN('fcm skipped', { reason: 'firebase-not-configured' });
  return false;
}
