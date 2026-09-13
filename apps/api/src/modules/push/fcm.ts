import { prisma } from '../../common/utils/prisma';
import type { PushPayload } from './dispatch';

// Firebase Cloud Messaging for the native Android app.
// Config: FIREBASE_SERVICE_ACCOUNT_JSON (one-line JSON of a service-account
// key) or a file path in GOOGLE_APPLICATION_CREDENTIALS. When unset, all
// functions below are silent no-ops and local notifications remain the
// delivery mechanism. firebase-admin is lazily required so the API boots
// fine without credentials.

let admin: any = null;
let initFailed = false;

function getAdmin(): any | null {
  if (admin) return admin;
  if (initFailed) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = require('firebase-admin');
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    if (inline) {
      const creds = JSON.parse(inline);
      req.initializeApp({ credential: req.credential.cert(creds) });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      req.initializeApp();
    } else {
      return null;
    }
    admin = req;
    return admin;
  } catch {
    initFailed = true;
    return null;
  }
}

export function isFcmConfigured(): boolean {
  return getAdmin() !== null;
}

/** Send a push to all Android tokens of a user. Returns delivered count. */
export async function sendFcm(userId: string, payload: PushPayload): Promise<number> {
  const a = getAdmin();
  if (!a) return 0;
  const rows = await prisma.fcmToken.findMany({ where: { userId } });
  if (!rows.length) return 0;
  let delivered = 0;
  const messaging = a.messaging();
  for (const row of rows) {
    try {
      await messaging.send({
        token: row.token,
        notification: { title: payload.title, body: payload.body || '' },
        data: {
          tag: payload.tag || 'taskflow',
          url: payload.url || '/app',
          type: payload.type || 'reminder',
          taskId: payload.taskId || '',
        },
        android: { priority: 'high', notification: { channelId: 'tf-reminders', sound: 'default', tag: payload.tag } },
      });
      delivered++;
    } catch (err: any) {
      const code = String(err?.code || err?.errorInfo?.code || '');
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        await prisma.fcmToken.delete({ where: { id: row.id } }).catch(() => {});
      }
    }
  }
  await prisma.fcmToken
    .updateMany({ where: { userId }, data: { updatedAt: new Date() } })
    .catch(() => {});
  return delivered;
}
