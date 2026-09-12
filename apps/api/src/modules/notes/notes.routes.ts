import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { AuthRequest } from '../../common/middleware/auth';

const router = Router();

export const NOTE_MAX_LENGTH = 20000;
export const NOTE_PREVIEW_LENGTH = 160;

export function notePreview(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > NOTE_PREVIEW_LENGTH ? flat.slice(0, NOTE_PREVIEW_LENGTH - 1).trimEnd() + '…' : flat;
}

const contentSchema = z
  .string()
  .min(1, 'Заметка не может быть пустой')
  .max(NOTE_MAX_LENGTH, `Заметка слишком большая (максимум ${NOTE_MAX_LENGTH} символов)`)
  .refine((s) => s.trim().length > 0, 'Заметка не может быть пустой');

async function requireOwnTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, creatorId: userId, isDeleted: false },
    select: { id: true, title: true },
  });
  if (!task) {
    throw new AppError(404, 'Задача не найдена');
  }
  return task;
}

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const notes = await prisma.note.findMany({
      where: {
        userId: req.userId,
        task: { isDeleted: false },
      },
      select: {
        id: true,
        taskId: true,
        content: true,
        updatedAt: true,
        task: { select: { title: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    res.json({
      notes: notes.map((n) => ({
        id: n.id,
        taskId: n.taskId,
        taskTitle: n.task.title,
        preview: notePreview(n.content),
        updatedAt: n.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { task: { select: { id: true, title: true } } },
    });
    if (!note || note.task === null) {
      throw new AppError(404, 'Заметка не найдена');
    }
    res.json({ note });
  } catch (err) {
    next(err);
  }
});

router.get('/by-task/:taskId', async (req: AuthRequest, res, next) => {
  try {
    await requireOwnTask(req.userId!, req.params.taskId);
    const note = await prisma.note.findFirst({
      where: { taskId: req.params.taskId, userId: req.userId },
    });
    res.json({ note });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        taskId: z.string().min(1, 'Некорректный taskId'),
        content: contentSchema,
      })
      .parse(req.body);

    await requireOwnTask(req.userId!, data.taskId);

    const existing = await prisma.note.findFirst({
      where: { taskId: data.taskId, userId: req.userId },
    });
    if (existing) {
      throw new AppError(409, 'У задачи уже есть заметка');
    }

    const note = await prisma.note.create({
      data: {
        userId: req.userId!,
        taskId: data.taskId,
        content: data.content,
      },
      include: { task: { select: { id: true, title: true } } },
    });
    res.status(201).json({ note });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = z.object({ content: contentSchema }).parse(req.body);
    const existing = await prisma.note.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) {
      throw new AppError(404, 'Заметка не найдена');
    }
    const note = await prisma.note.update({
      where: { id: existing.id },
      data: { content: data.content },
      include: { task: { select: { id: true, title: true } } },
    });
    res.json({ note });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.note.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) {
      throw new AppError(404, 'Заметка не найдена');
    }
    await prisma.note.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as notesRouter };
