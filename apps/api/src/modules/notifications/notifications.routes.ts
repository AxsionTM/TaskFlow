import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { AuthRequest } from '../../common/middleware/auth';

const router = Router();

// Все endpoints — только свои уведомления (userId из сессии, не из body).
router.get('/unread-count', async (req: AuthRequest, res, next) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.userId, isRead: false },
    });
    res.set('Cache-Control', 'no-store');
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        unreadOnly: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.userId,
        ...(q.unreadOnly === 'true' ? { isRead: false } : {}),
      },
      select: { id: true, title: true, body: true, type: true, isRead: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new AppError(404, 'Уведомление не найдено');
    const notification = await prisma.notification.update({
      where: { id: existing.id },
      data: { isRead: true },
      select: { id: true, isRead: true },
    });
    res.json({ notification });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req: AuthRequest, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ ok: true, marked: result.count });
  } catch (err) {
    next(err);
  }
});

export { router as notificationsRouter };
