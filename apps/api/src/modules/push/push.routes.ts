import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { AuthRequest } from '../../common/middleware/auth';
import { getVapidPublicKey, isPushConfigured, dispatchDuePush } from './dispatch';

const router = Router();

// Public VAPID key + server readiness (client fetches at runtime, no rebuild needed).
router.get('/vapid-key', async (req: AuthRequest, res, next) => {
  try {
    void req;
    res.json({ key: getVapidPublicKey(), pushReady: isPushConfigured() });
  } catch (err) {
    next(err);
  }
});

const subscribeSchema = z.object({
  endpoint: z.string().min(1).max(2000).url(),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  userAgent: z.string().max(500).optional(),
});

router.post('/subscribe', async (req: AuthRequest, res, next) => {
  try {
    if (!isPushConfigured()) throw new AppError(500, 'Push не настроен на сервере (нет VAPID-ключей)');
    const data = subscribeSchema.parse(req.body);
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      update: { userId: req.userId!, p256dh: data.p256dh, auth: data.auth, userAgent: data.userAgent },
      create: { userId: req.userId!, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth, userAgent: data.userAgent },
    });
    res.status(201).json({ subscription: { id: sub.id } });
  } catch (err) {
    next(err);
  }
});

router.post('/unsubscribe', async (req: AuthRequest, res, next) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().min(1).max(2000) }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Server-side dispatch: called by Vercel Cron (or external cron) every minute.
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel adds it
// automatically when CRON_SECRET is set) or `?key=<secret>` for external crons.
// Mounted WITHOUT user auth in main.ts.
export const cronRouter = Router();

cronRouter.get('/dispatch', async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET || '';
    if (!secret) throw new AppError(500, 'CRON_SECRET не задан');
    const header = String(req.headers.authorization || '');
    const ok = header === `Bearer ${secret}` || req.query.key === secret;
    if (!ok) throw new AppError(401, 'Unauthorized');
    const result = await dispatchDuePush();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

export { router as pushRouter };
