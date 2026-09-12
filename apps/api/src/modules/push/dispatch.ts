import webpush from 'web-push';
import { prisma } from '../../common/utils/prisma';

export interface PushPayload {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
  type?: string;
}

function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@taskflow.app';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return vapid() !== null;
}

export function getVapidPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

/** Send one push, deleting dead (410/404) subscriptions. Returns true if sent. */
export async function sendPush(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  const keys = vapid();
  if (!keys) return false;
  try {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ ...payload, url: payload.url ?? '/app' }),
      { TTL: 3600, urgency: 'normal' }
    );
    return true;
  } catch (err: any) {
    const code = err?.statusCode;
    if (code === 404 || code === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    }
    return false;
  }
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Server-side push dispatch for due reminders and today's birthdays.
 * Idempotent: reminders are marked isSent, birthdays guarded by inbox rows.
 * Safe to run every minute from Vercel Cron or an in-process interval.
 */
export async function dispatchDuePush(now = new Date()) {
  if (!isPushConfigured()) return { skipped: 'vapid-not-configured' as const };
  const result = { reminders: 0, pushes: 0, birthdays: 0, errors: 0 };

  // 1. Due explicit reminders.
  const due = await prisma.reminder.findMany({
    where: { isSent: false, remindAt: { lte: new Date(now.getTime() + 30_000) } },
    include: {
      task: { select: { id: true, title: true, dueDate: true, status: true, isDeleted: true, creatorId: true } },
    },
    orderBy: { remindAt: 'asc' },
    take: 50,
  });
  for (const r of due) {
    try {
      const t = r.task;
      if (!t || t.status === 'COMPLETED' || t.isDeleted) {
        await prisma.reminder.update({ where: { id: r.id }, data: { isSent: true } });
        continue;
      }
      const subs = await prisma.pushSubscription.findMany({ where: { userId: t.creatorId } });
      if (subs.length > 0) {
        const payload: PushPayload = {
          title: t.title,
          body: t.dueDate ? `Срок: ${new Date(t.dueDate).toLocaleString('ru-RU')}` : 'Пора выполнить задачу',
          tag: `reminder-${r.id}`,
          url: '/app',
          type: 'reminder',
        };
        for (const s of subs) {
          if (await sendPush(s, payload)) result.pushes++;
        }
      }
      await prisma.reminder.update({ where: { id: r.id }, data: { isSent: true } });
      result.reminders++;
    } catch {
      result.errors++;
    }
  }

  // 2. Birthdays (on the day or remindDays ahead), once per day per birthday.
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const birthdays = await prisma.birthday.findMany({ take: 500 });
  const todayRows = await prisma.notification.findMany({
    where: { type: 'birthday-push', createdAt: { gte: todayStart } },
    select: { userId: true, data: true },
    take: 500,
  });
  const sentKeys = new Set(
    todayRows.map((n) => {
      const d = n.data as { birthdayId?: string; date?: string } | null;
      return `${n.userId}|${d?.birthdayId}|${d?.date}`;
    })
  );
  for (const b of birthdays) {
    try {
      const target = new Date(b.date);
      target.setFullYear(now.getFullYear());
      const remindAt = new Date(target);
      remindAt.setDate(remindAt.getDate() - (b.remindDays || 0));
      if (!sameDay(remindAt, now)) continue;
      const key = `${b.userId}|${b.id}|${dayKey(now)}`;
      if (sentKeys.has(key)) continue;
      const age = now.getFullYear() - new Date(b.date).getFullYear();
      const body = `${age} лет · ${b.note || 'Не забудьте поздравить!'}`;
      await prisma.notification.create({
        data: {
          userId: b.userId,
          title: `День рождения: ${b.name}`,
          body,
          type: 'birthday-push',
          data: { birthdayId: b.id, date: dayKey(now) },
        },
      });
      sentKeys.add(key);
      const subs = await prisma.pushSubscription.findMany({ where: { userId: b.userId } });
      for (const s of subs) {
        if (await sendPush(s, { title: `День рождения: ${b.name}`, body, tag: `bday-${b.id}`, url: '/app', type: 'birthday' })) {
          result.pushes++;
        }
      }
      result.birthdays++;
    } catch {
      result.errors++;
    }
  }

  return result;
}
