import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { AuthRequest } from '../../common/middleware/auth';

const router = Router();

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, 'Дата должна быть в формате YYYY-MM-DD');
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, 'Некорректная дата');
  }

  return date;
}

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  date: z.string(),
  note: z.string().max(2000).optional().nullable(),
  remindDays: z.number().int().min(0).max(30).optional(),
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const items = await prisma.birthday.findMany({
      where: { userId: req.userId },
      orderBy: [{ date: 'asc' }],
    });
    res.json({ birthdays: items });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = bodySchema.parse(req.body);
    const item = await prisma.birthday.create({
      data: {
        userId: req.userId!,
        name: data.name,
        date: parseDateOnly(data.date),
        note: data.note || null,
        remindDays: data.remindDays ?? 0,
      },
    });
    res.status(201).json({ birthday: item });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.birthday.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new AppError(404, 'Не найдено');
    const data = bodySchema.partial().parse(req.body);
    const item = await prisma.birthday.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.date !== undefined ? { date: parseDateOnly(data.date) } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
        ...(data.remindDays !== undefined ? { remindDays: data.remindDays } : {}),
      },
    });
    res.json({ birthday: item });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.birthday.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new AppError(404, 'Не найдено');
    await prisma.birthday.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as birthdaysRouter };
