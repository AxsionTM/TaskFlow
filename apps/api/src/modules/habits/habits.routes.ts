import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { AuthRequest } from '../../common/middleware/auth';

const router = Router();

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 60, 1), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const habits = await prisma.habit.findMany({
      where: { userId: req.userId, isArchived: false },
      include: {
        logs: {
          where: { date: { gte: since } },
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const enriched = habits.map((h) => {
      const sortedLogs = [...h.logs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const found = sortedLogs.find(
          (l) => new Date(l.date).toISOString().slice(0, 10) === key
        );
        if (found && found.count > 0) {
          streak++;
        } else if (i === 0) {
          continue; // today not done yet — don't break streak
        } else {
          break;
        }
      }

      const todayKey = today.toISOString().slice(0, 10);
      const todayLog = sortedLogs.find(
        (l) => new Date(l.date).toISOString().slice(0, 10) === todayKey
      );

      return {
        ...h,
        streak,
        completedToday: !!(todayLog && todayLog.count > 0),
        todayCount: todayLog?.count || 0,
      };
    });

    res.json({ habits: enriched });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        name: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        color: z.string().max(32).optional(),
        icon: z.string().max(64).optional(),
        frequency: z.enum(['DAILY', 'WEEKLY', 'CUSTOM']).optional(),
        targetDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        targetCount: z.number().int().min(1).max(1000).optional(),
        reminderTime: z.string().max(16).optional(),
      })
      .parse(req.body);

    const habit = await prisma.habit.create({
      data: {
        name: data.name,
        description: data.description,
        color: data.color || '#4A90D9',
        icon: data.icon,
        frequency: data.frequency || 'DAILY',
        targetDays: data.targetDays || [],
        targetCount: data.targetCount || 1,
        reminderTime: data.reminderTime,
        userId: req.userId!,
      },
    });

    res.status(201).json({ habit });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional().nullable(),
        color: z.string().max(32).optional(),
        frequency: z.enum(['DAILY', 'WEEKLY', 'CUSTOM']).optional(),
        targetDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        targetCount: z.number().int().min(1).max(1000).optional(),
        reminderTime: z.string().max(16).optional().nullable(),
        isArchived: z.boolean().optional(),
      })
      .parse(req.body);

    const existing = await prisma.habit.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new AppError(404, 'Привычка не найдена');

    const habit = await prisma.habit.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ habit });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.habit.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new AppError(404, 'Привычка не найдена');

    await prisma.habit.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/log', async (req: AuthRequest, res, next) => {
  try {
    const { date, count, note } = z
      .object({
        date: z.string().max(64).optional(),
        count: z.number().int().min(0).max(100000).optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const habit = await prisma.habit.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!habit) throw new AppError(404, 'Привычка не найдена');

    const logDate = date ? new Date(date) : new Date();
    logDate.setHours(0, 0, 0, 0);

    const log = await prisma.habitLog.upsert({
      where: {
        habitId_date: { habitId: req.params.id, date: logDate },
      },
      create: {
        habitId: req.params.id,
        date: logDate,
        count: count ?? 1,
        note,
      },
      update: {
        count: count ?? 1,
        note,
      },
    });

    res.json({ log });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/log', async (req: AuthRequest, res, next) => {
  try {
    const { date } = z.object({ date: z.string().optional() }).parse(req.body);

    const habit = await prisma.habit.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!habit) throw new AppError(404, 'Привычка не найдена');

    const logDate = date ? new Date(date) : new Date();
    logDate.setHours(0, 0, 0, 0);

    await prisma.habitLog.deleteMany({
      where: { habitId: req.params.id, date: logDate },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as habitsRouter };
