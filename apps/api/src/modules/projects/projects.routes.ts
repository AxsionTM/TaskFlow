import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { AuthRequest } from '../../common/middleware/auth';

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  color: z.string().max(32).optional(),
  icon: z.string().max(64).optional(),
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: req.userId },
      include: {
        project: {
          include: {
            sections: { orderBy: { sortOrder: 'asc' } },
            _count: { select: { tasks: { where: { isDeleted: false, status: { not: 'COMPLETED' } } } } },
          },
        },
      },
      orderBy: { project: { sortOrder: 'asc' } },
    });

    const projects = memberships.map((m) => ({
      ...m.project,
      role: m.role,
      taskCount: m.project._count.tasks,
    }));

    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createProjectSchema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        color: data.color || '#4A90D9',
        icon: data.icon,
        members: {
          create: {
            userId: req.userId!,
            role: 'OWNER',
          },
        },
      },
      include: {
        sections: true,
      },
    });

    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: req.params.id,
        userId: req.userId,
        role: { in: ['OWNER', 'EDITOR'] },
      },
    });

    if (!membership) {
      throw new AppError(403, 'Нет прав на редактирование проекта');
    }

    const data = createProjectSchema.partial().parse(req.body);

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ project });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: req.params.id,
        userId: req.userId,
        role: 'OWNER',
      },
    });

    if (!membership) {
      throw new AppError(403, 'Только владелец может удалить проект');
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
    });

    if (project?.isInbox) {
      throw new AppError(400, 'Нельзя удалить входящие');
    }

    await prisma.project.delete({ where: { id: req.params.id } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/sections', async (req: AuthRequest, res, next) => {
  try {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);

    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: req.params.id,
        userId: req.userId,
        role: { in: ['OWNER', 'EDITOR'] },
      },
    });

    if (!membership) {
      throw new AppError(403, 'Нет прав');
    }

    const section = await prisma.section.create({
      data: {
        name,
        projectId: req.params.id,
      },
    });

    res.status(201).json({ section });
  } catch (err) {
    next(err);
  }
});

export { router as projectsRouter };
