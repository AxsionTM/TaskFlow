import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { AuthRequest } from '../../common/middleware/auth';

const router = Router();

const DEFAULT_TAGS = [
  { name: 'Работа', color: '#ef4444', icon: 'briefcase' },
  { name: 'Здоровье', color: '#22c55e', icon: 'dumbbell' },
  { name: 'Личное', color: '#a855f7', icon: 'sparkles' },
  { name: 'Развитие', color: '#3b82f6', icon: 'sprout' },
  { name: 'Быт', color: '#f59e0b', icon: 'shopping-cart' },
  { name: 'Дом', color: '#ec4899', icon: 'home' },
];

const TAG_PALETTE = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#22d3ee', '#fb7185'];

async function ensureDefaultTags(userId: string) {
  // Досеиваем недостающие базовые теги даже старым пользователям.
  for (const t of DEFAULT_TAGS) {
    const existing = await prisma.tag.findFirst({ where: { userId, name: t.name } });
    if (!existing) {
      await prisma.tag.create({ data: { ...t, userId } });
    }
  }
}

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    await ensureDefaultTags(req.userId!);
    const tags = await prisma.tag.findMany({
      where: { userId: req.userId },
      orderBy: { name: 'asc' },
    });
    res.json({ tags });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        name: z.string().min(1).max(60),
        color: z.string().max(32).optional(),
        icon: z.string().max(32).optional().nullable(),
      })
      .parse(req.body);

    const tag = await prisma.tag.create({
      data: {
        name: data.name,
        color:
          data.color ||
          TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)],
        icon: data.icon || null,
        userId: req.userId!,
      },
    });

    res.status(201).json({ tag });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!tag) {
      throw new AppError(404, 'Тег не найден');
    }

    await prisma.tag.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as tagsRouter };
