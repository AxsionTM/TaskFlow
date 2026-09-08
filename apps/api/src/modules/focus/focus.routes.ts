import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AuthRequest } from '../../common/middleware/auth';

const router = Router();

router.get('/sessions', async (req: AuthRequest, res, next) => {
  try {
    const sessions = await prisma.focusSession.findMany({
      where: { userId: req.userId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        taskId: z.string().optional().nullable(),
        durationMin: z.number().min(0.1),
        type: z.string().optional(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime().optional().nullable(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const session = await prisma.focusSession.create({
      data: {
        userId: req.userId!,
        taskId: data.taskId,
        durationMin: data.durationMin,
        type: data.type || 'pomodoro',
        startedAt: new Date(data.startedAt),
        endedAt: data.endedAt ? new Date(data.endedAt) : null,
        notes: data.notes,
      },
    });

    res.status(201).json({ session });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (req: AuthRequest, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sessions = await prisma.focusSession.findMany({
      where: {
        userId: req.userId,
        startedAt: { gte: thirtyDaysAgo },
      },
    });

    const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMin, 0);
    const totalSessions = sessions.length;

    const byDay: Record<string, number> = {};
    for (const s of sessions) {
      const key = s.startedAt.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + s.durationMin;
    }

    res.json({
      totalMinutes,
      totalSessions,
      averageMinutes: totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0,
      byDay,
    });
  } catch (err) {
    next(err);
  }
});

export { router as focusRouter };
