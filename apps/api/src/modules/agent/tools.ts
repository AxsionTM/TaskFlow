/**
 * Инструменты AI-агента. Каждый выполняется на backend с userId из JWT:
 * все запросы scoped по владельцу, чужие данные недоступны по построению.
 * LLM никогда не получает userId и не может его подменить — параметра
 * userId нет ни в одной схеме.
 */
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { dayKeyInTz, formatInTz } from './nl-dates';

export interface AgentCtx {
  tz: string;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  data?: any;
  card?: any;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  dangerous?: boolean;
  execute: (userId: string, args: any, ctx: AgentCtx) => Promise<ToolResult>;
}

const str = (max: number, desc: string, optional = true) => {
  const s: any = { type: 'string', description: desc, maxLength: max };
  if (!optional) s.minLength = 1;
  return s;
};

function taskWhere(userId: string, extra: any = {}) {
  return { creatorId: userId, isDeleted: false, parentId: null, ...extra };
}

function serializeTask(t: any, tz: string) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    start: t.startDate || null,
    startLabel: t.startDate ? formatInTz(t.startDate, tz) : null,
    due: t.dueDate,
    dueLabel: formatInTz(t.dueDate, tz),
    project: t.project ? { id: t.project.id, name: t.project.name } : null,
    tags: (t.tags || []).map((x: any) => x.tag?.name).filter(Boolean),
    subtasksTotal: t._count?.children ?? (t.children ? t.children.length : 0),
    subtasksDone: t.children ? t.children.filter((c: any) => c.status === 'COMPLETED').length : undefined,
  };
}

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  startDate: true,
  projectId: true,
  project: { select: { id: true, name: true } },
  tags: { include: { tag: true } },
  _count: { select: { children: true } },
};

async function findTask(userId: string, taskId: string, full = false) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, creatorId: userId, isDeleted: false },
    include: full
      ? {
          tags: { include: { tag: true } },
          project: { select: { id: true, name: true } },
          children: { where: { isDeleted: false }, orderBy: { createdAt: 'asc' } },
          note: { select: { id: true, updatedAt: true } },
          _count: { select: { children: true } },
        }
      : { tags: { include: { tag: true } }, project: { select: { id: true, name: true } }, _count: { select: { children: true } } },
  });
  if (!task) throw new AppError(404, 'Задача не найдена');
  return task;
}

/** Поиск задачи по названию (нечёткий, регистронезависимый). */
async function searchTasksByTitle(userId: string, query: string, limit = 10) {
  const q = query.trim();
  if (!q) return [];
  return prisma.task.findMany({
    where: { creatorId: userId, isDeleted: false, parentId: null, title: { contains: q, mode: 'insensitive' } },
    select: TASK_SELECT,
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 20),
  });
}

function dayRange(tz: string, base: Date, offsetDays: number) {
  const key = dayKeyInTz(new Date(base.getTime() + offsetDays * 86400000), tz);
  return { from: new Date(`${key}T00:00:00.000Z`), to: new Date(`${key}T00:00:00.000Z`).getTime() + 86400000, key };
}

export const TOOLS: ToolDef[] = [
  {
    name: 'search_tasks',
    description: 'Найти задачи по названию и фильтрам. Возвращает максимум 20.',
    parameters: {
      type: 'object',
      properties: {
        query: str(200, 'Подстрока в названии'),
        status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'] },
        priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
        projectId: str(64, 'ID проекта'),
        noDueDate: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
    execute: async (userId, a, ctx) => {
      const where: any = taskWhere(userId);
      if (a.query) where.title = { contains: String(a.query), mode: 'insensitive' };
      if (a.status) where.status = a.status;
      if (a.priority) where.priority = a.priority;
      if (a.projectId) where.projectId = String(a.projectId);
      if (a.noDueDate) where.dueDate = null;
      const tasks = await prisma.task.findMany({
        where,
        select: TASK_SELECT,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(Math.max(Number(a.limit) || 10, 1), 20),
      });
      const total = await prisma.task.count({ where });
      const serialized = tasks.map((t) => serializeTask(t, ctx.tz));
      return {
        ok: true,
        summary: total > tasks.length ? `Найдено ${total}, показываю ${tasks.length}` : `Найдено: ${total}`,
        data: { total, tasks: serialized },
        card: serialized.length ? { type: 'tasklist', title: 'Найдено', tasks: serialized.slice(0, 8) } : undefined,
      };
    },
  },
  {
    name: 'get_task',
    description: 'Полная карточка задачи: подзадачи, заметка, теги, проект.',
    parameters: { type: 'object', properties: { taskId: { type: 'string', minLength: 1 } }, required: ['taskId'] },
    execute: async (userId, a, ctx) => {
      const t: any = await findTask(userId, String(a.taskId), true);
      return {
        ok: true,
        summary: `Задача «${t.title}»`,
        data: {
          ...serializeTask(t, ctx.tz),
          description: t.description,
          subtasks: (t.children || []).map((c: any) => ({ id: c.id, title: c.title, status: c.status })),
          hasNote: Boolean(t.note),
        },
        card: { type: 'task', task: serializeTask(t, ctx.tz) },
      };
    },
  },
  {
    name: 'today_tasks',
    description: 'Задачи на сегодня (по timezone пользователя).',
    parameters: { type: 'object', properties: {} },
    execute: async (userId, _a, ctx) => {
      const r = dayRange(ctx.tz, new Date(), 0);
      const tasks = await prisma.task.findMany({
        where: { ...taskWhere(userId), dueDate: { gte: new Date(r.from), lt: new Date(r.to) } },
        select: TASK_SELECT,
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        take: 50,
      });
      return { ok: true, summary: `На сегодня: ${tasks.length}`, data: { tasks: tasks.map((t) => serializeTask(t, ctx.tz)) } };
    },
  },
  {
    name: 'tomorrow_tasks',
    description: 'Задачи на завтра.',
    parameters: { type: 'object', properties: {} },
    execute: async (userId, _a, ctx) => {
      const r = dayRange(ctx.tz, new Date(), 1);
      const tasks = await prisma.task.findMany({
        where: { ...taskWhere(userId), dueDate: { gte: new Date(r.from), lt: new Date(r.to) } },
        select: TASK_SELECT,
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        take: 50,
      });
      return { ok: true, summary: `На завтра: ${tasks.length}`, data: { tasks: tasks.map((t) => serializeTask(t, ctx.tz)) } };
    },
  },
  {
    name: 'week_tasks',
    description: 'Задачи на ближайшие 7 дней.',
    parameters: { type: 'object', properties: {} },
    execute: async (userId, _a, ctx) => {
      const now = Date.now();
      const tasks = await prisma.task.findMany({
        where: { ...taskWhere(userId), dueDate: { gte: new Date(now - 86400000), lt: new Date(now + 7 * 86400000) } },
        select: TASK_SELECT,
        orderBy: { dueDate: 'asc' },
        take: 100,
      });
      return { ok: true, summary: `На неделю: ${tasks.length}`, data: { tasks: tasks.map((t) => serializeTask(t, ctx.tz)) } };
    },
  },
  {
    name: 'overdue_tasks',
    description: 'Просроченные задачи.',
    parameters: { type: 'object', properties: {} },
    execute: async (userId, _a, ctx) => {
      const tasks = await prisma.task.findMany({
        where: { ...taskWhere(userId), status: { not: 'COMPLETED' }, dueDate: { lt: new Date() } },
        select: TASK_SELECT,
        orderBy: { dueDate: 'asc' },
        take: 100,
      });
      return { ok: true, summary: `Просрочено: ${tasks.length}`, data: { tasks: tasks.map((t) => serializeTask(t, ctx.tz)) } };
    },
  },
  {
    name: 'tasks_by_project',
    description: 'Незавершённые задачи проекта.',
    parameters: {
      type: 'object',
      properties: { projectId: { type: 'string', minLength: 1 }, includeCompleted: { type: 'boolean' } },
      required: ['projectId'],
    },
    execute: async (userId, a, ctx) => {
      const membership = await prisma.projectMember.findFirst({ where: { projectId: String(a.projectId), userId } });
      if (!membership) throw new AppError(404, 'Проект не найден');
      const where: any = { projectId: String(a.projectId), isDeleted: false, parentId: null };
      if (!a.includeCompleted) where.status = { not: 'COMPLETED' };
      const tasks = await prisma.task.findMany({ where, select: TASK_SELECT, orderBy: { updatedAt: 'desc' }, take: 50 });
      return { ok: true, summary: `В проекте: ${tasks.length}`, data: { tasks: tasks.map((t) => serializeTask(t, ctx.tz)) } };
    },
  },
  {
    name: 'create_task',
    description: 'Создать задачу. Даты передавать ISO. startDateISO — начало диапазона, dueDateISO — конец/срок.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 500 },
        description: str(10000, 'Описание'),
        priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
        startDateISO: str(64, 'Начало ISO'),
        dueDateISO: str(64, 'Срок/конец ISO'),
        projectId: str(64, 'ID проекта'),
        tagNames: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 10 },
      },
      required: ['title'],
    },
    execute: async (userId, a, ctx) => {
      if (a.projectId) {
        const m = await prisma.projectMember.findFirst({ where: { projectId: String(a.projectId), userId } });
        if (!m) throw new AppError(404, 'Проект не найден');
      }
      let tagIds: string[] | undefined;
      if (Array.isArray(a.tagNames) && a.tagNames.length) {
        const found = await prisma.tag.findMany({ where: { userId, name: { in: a.tagNames.map(String) } } });
        tagIds = found.map((t) => t.id);
      }
      const task = await prisma.task.create({
        data: {
          title: String(a.title).slice(0, 500),
          description: a.description ? String(a.description).slice(0, 10000) : undefined,
          priority: ['HIGH', 'MEDIUM', 'LOW'].includes(a.priority) ? a.priority : 'NONE',
          startDate: a.startDateISO ? new Date(String(a.startDateISO)) : null,
          dueDate: a.dueDateISO ? new Date(String(a.dueDateISO)) : null,
          isAllDay: !a.dueDateISO && !a.startDateISO,
          projectId: a.projectId ? String(a.projectId) : undefined,
          status: 'TODO',
          creatorId: userId,
          tags: tagIds?.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
        },
        select: TASK_SELECT,
      });
      return { ok: true, summary: `Создана задача «${task.title}»`, data: { task: serializeTask(task, ctx.tz) }, card: { type: 'task', task: serializeTask(task, ctx.tz) } };
    },
  },
  {
    name: 'update_task',
    description: 'Изменить ТОЛЬКО указанные поля задачи: название, описание, приоритет, начало, срок, проект, статус.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1 },
        title: str(500, 'Новое название'),
        description: { type: ['string', 'null'] },
        priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
        startDateISO: str(64, 'Новое начало ISO'),
        dueDateISO: str(64, 'Новый срок/конец ISO'),
        clearDueDate: { type: 'boolean' },
        projectId: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'] },
      },
      required: ['taskId'],
    },
    execute: async (userId, a, ctx) => {
      const existing = await findTask(userId, String(a.taskId));
      const patch: any = {};
      if (a.title !== undefined) patch.title = String(a.title).slice(0, 500);
      if (a.description !== undefined) patch.description = a.description === null ? null : String(a.description).slice(0, 10000);
      if (a.priority !== undefined) patch.priority = a.priority;
      if (a.startDateISO !== undefined) patch.startDate = new Date(String(a.startDateISO));
      if (a.clearDueDate) patch.dueDate = null;
      else if (a.dueDateISO !== undefined) patch.dueDate = new Date(String(a.dueDateISO));
      if (a.projectId !== undefined) {
        if (a.projectId === null) patch.projectId = null;
        else {
          const m = await prisma.projectMember.findFirst({ where: { projectId: String(a.projectId), userId } });
          if (!m) throw new AppError(404, 'Проект не найден');
          patch.projectId = String(a.projectId);
        }
      }
      if (a.status !== undefined) {
        patch.status = a.status;
        patch.completedAt = a.status === 'COMPLETED' ? new Date() : null;
      }
      const updated = await prisma.task.update({ where: { id: existing.id }, data: patch, select: TASK_SELECT });
      return { ok: true, summary: `Задача «${updated.title}» обновлена`, data: { task: serializeTask(updated, ctx.tz) } };
    },
  },
  {
    name: 'delete_task',
    description: 'Удалить задачу (в корзину). ТРЕБУЕТ подтверждения пользователя.',
    parameters: { type: 'object', properties: { taskId: { type: 'string', minLength: 1 } }, required: ['taskId'] },
    dangerous: true,
    execute: async (userId, a) => {
      const existing = await findTask(userId, String(a.taskId));
      await prisma.task.update({ where: { id: existing.id }, data: { isDeleted: true, deletedAt: new Date() } });
      return { ok: true, summary: `Задача «${existing.title}» удалена` };
    },
  },
  {
    name: 'complete_task',
    description: 'Завершить задачу (или снять завершение при completed=false).',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string', minLength: 1 }, completed: { type: 'boolean' } },
      required: ['taskId'],
    },
    execute: async (userId, a, ctx) => {
      const existing = await findTask(userId, String(a.taskId));
      const done = a.completed !== false;
      const updated = await prisma.task.update({
        where: { id: existing.id },
        data: { status: done ? 'COMPLETED' : 'TODO', completedAt: done ? new Date() : null },
        select: TASK_SELECT,
      });
      return { ok: true, summary: done ? `«${updated.title}» завершена` : `«${updated.title}» возвращена в работу`, data: { task: serializeTask(updated, ctx.tz) } };
    },
  },
  {
    name: 'restore_task',
    description: 'Восстановить задачу из корзины.',
    parameters: { type: 'object', properties: { taskId: { type: 'string', minLength: 1 } }, required: ['taskId'] },
    execute: async (userId, a) => {
      const existing = await prisma.task.findFirst({ where: { id: String(a.taskId), creatorId: userId, isDeleted: true } });
      if (!existing) throw new AppError(404, 'Задача не найдена в корзине');
      await prisma.task.update({ where: { id: existing.id }, data: { isDeleted: false, deletedAt: null } });
      return { ok: true, summary: `«${existing.title}» восстановлена` };
    },
  },
  {
    name: 'get_subtasks',
    description: 'Подзадачи задачи.',
    parameters: { type: 'object', properties: { taskId: { type: 'string', minLength: 1 } }, required: ['taskId'] },
    execute: async (userId, a) => {
      const parent = await findTask(userId, String(a.taskId));
      const subs = await prisma.task.findMany({
        where: { parentId: parent.id, creatorId: userId, isDeleted: false },
        orderBy: { createdAt: 'asc' },
      });
      return {
        ok: true,
        summary: `Подзадач: ${subs.length}`,
        data: { subtasks: subs.map((s) => ({ id: s.id, title: s.title, status: s.status, priority: s.priority })) },
      };
    },
  },
  {
    name: 'create_subtask',
    description: 'Создать подзадачу.',
    parameters: {
      type: 'object',
      properties: {
        parentId: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1, maxLength: 500 },
        priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
      },
      required: ['parentId', 'title'],
    },
    execute: async (userId, a) => {
      const parent = await findTask(userId, String(a.parentId));
      const sub = await prisma.task.create({
        data: {
          title: String(a.title).slice(0, 500),
          parentId: parent.id,
          priority: 'NONE',
          projectId: parent.projectId,
          status: 'TODO',
          isAllDay: true,
          creatorId: userId,
        },
      });
      void a.priority;
      return { ok: true, summary: `Подзадача «${sub.title}» создана`, data: { subtask: { id: sub.id, title: sub.title, status: sub.status } } };
    },
  },
  {
    name: 'update_subtask',
    description: 'Переименовать подзадачу.',
    parameters: {
      type: 'object',
      properties: { subtaskId: { type: 'string', minLength: 1 }, title: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['subtaskId', 'title'],
    },
    execute: async (userId, a) => {
      const sub = await prisma.task.findFirst({ where: { id: String(a.subtaskId), creatorId: userId, isDeleted: false, parentId: { not: null } } });
      if (!sub) throw new AppError(404, 'Подзадача не найдена');
      const updated = await prisma.task.update({ where: { id: sub.id }, data: { title: String(a.title).slice(0, 500) } });
      return { ok: true, summary: `Подзадача переименована в «${updated.title}»` };
    },
  },
  {
    name: 'complete_subtask',
    description: 'Завершить/снять завершение подзадачи.',
    parameters: {
      type: 'object',
      properties: { subtaskId: { type: 'string', minLength: 1 }, completed: { type: 'boolean' } },
      required: ['subtaskId'],
    },
    execute: async (userId, a) => {
      const sub = await prisma.task.findFirst({ where: { id: String(a.subtaskId), creatorId: userId, isDeleted: false, parentId: { not: null } } });
      if (!sub) throw new AppError(404, 'Подзадача не найдена');
      const done = a.completed !== false;
      await prisma.task.update({ where: { id: sub.id }, data: { status: done ? 'COMPLETED' : 'TODO' } });
      return { ok: true, summary: done ? `«${sub.title}» завершена` : `«${sub.title}» возвращена в работу` };
    },
  },
  {
    name: 'delete_subtask',
    description: 'Удалить подзадачу. ТРЕБУЕТ подтверждения.',
    parameters: { type: 'object', properties: { subtaskId: { type: 'string', minLength: 1 } }, required: ['subtaskId'] },
    dangerous: true,
    execute: async (userId, a) => {
      const sub = await prisma.task.findFirst({ where: { id: String(a.subtaskId), creatorId: userId, isDeleted: false, parentId: { not: null } } });
      if (!sub) throw new AppError(404, 'Подзадача не найдена');
      await prisma.task.update({ where: { id: sub.id }, data: { isDeleted: true, deletedAt: new Date() } });
      return { ok: true, summary: `Подзадача «${sub.title}» удалена` };
    },
  },
  {
    name: 'get_note',
    description: 'Прочитать заметку задачи.',
    parameters: { type: 'object', properties: { taskId: { type: 'string', minLength: 1 } }, required: ['taskId'] },
    execute: async (userId, a) => {
      await findTask(userId, String(a.taskId));
      const note = await prisma.note.findFirst({ where: { taskId: String(a.taskId), userId } });
      if (!note) return { ok: true, summary: 'У задачи пока нет заметки', data: { note: null } };
      return { ok: true, summary: 'Заметка получена', data: { note: { id: note.id, content: note.content } } };
    },
  },
  {
    name: 'create_note',
    description: 'Создать заметку (если её нет).',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string', minLength: 1 }, content: { type: 'string', minLength: 1, maxLength: 20000 } },
      required: ['taskId', 'content'],
    },
    execute: async (userId, a) => {
      await findTask(userId, String(a.taskId));
      const existing = await prisma.note.findFirst({ where: { taskId: String(a.taskId), userId } });
      if (existing) throw new AppError(409, 'У задачи уже есть заметка');
      const note = await prisma.note.create({ data: { userId, taskId: String(a.taskId), content: String(a.content) } });
      return { ok: true, summary: 'Заметка создана', data: { note: { id: note.id } } };
    },
  },
  {
    name: 'update_note',
    description: 'Заменить текст заметки.',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string', minLength: 1 }, content: { type: 'string', minLength: 1, maxLength: 20000 } },
      required: ['taskId', 'content'],
    },
    execute: async (userId, a) => {
      await findTask(userId, String(a.taskId));
      const existing = await prisma.note.findFirst({ where: { taskId: String(a.taskId), userId } });
      if (!existing) throw new AppError(404, 'У задачи нет заметки');
      await prisma.note.update({ where: { id: existing.id }, data: { content: String(a.content) } });
      return { ok: true, summary: 'Заметка обновлена' };
    },
  },
  {
    name: 'append_note',
    description: 'Добавить текст в конец заметки (создаст, если нет).',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string', minLength: 1 }, text: { type: 'string', minLength: 1, maxLength: 20000 } },
      required: ['taskId', 'text'],
    },
    execute: async (userId, a) => {
      await findTask(userId, String(a.taskId));
      const existing = await prisma.note.findFirst({ where: { taskId: String(a.taskId), userId } });
      const add = String(a.text);
      if (existing) {
        const next = `${existing.content}\n${add}`.slice(0, 20000);
        await prisma.note.update({ where: { id: existing.id }, data: { content: next } });
        return { ok: true, summary: 'Текст добавлен в заметку' };
      }
      await prisma.note.create({ data: { userId, taskId: String(a.taskId), content: add } });
      return { ok: true, summary: 'Заметка создана' };
    },
  },
  {
    name: 'delete_note',
    description: 'Удалить заметку (задача остаётся). ТРЕБУЕТ подтверждения.',
    parameters: { type: 'object', properties: { taskId: { type: 'string', minLength: 1 } }, required: ['taskId'] },
    dangerous: true,
    execute: async (userId, a) => {
      await findTask(userId, String(a.taskId));
      const existing = await prisma.note.findFirst({ where: { taskId: String(a.taskId), userId } });
      if (!existing) throw new AppError(404, 'У задачи нет заметки');
      await prisma.note.delete({ where: { id: existing.id } });
      return { ok: true, summary: 'Заметка удалена, задача осталась' };
    },
  },
  {
    name: 'tasks_by_tag',
    description: 'Задачи с тегом по его названию.',
    parameters: {
      type: 'object',
      properties: { tagName: { type: 'string', minLength: 1, maxLength: 60 } },
      required: ['tagName'],
    },
    execute: async (userId, a, ctx) => {
      const tag = await prisma.tag.findFirst({ where: { userId, name: { equals: String(a.tagName).trim(), mode: 'insensitive' } } });
      if (!tag) return { ok: true, summary: `Тег «${a.tagName}» не найден`, data: { tasks: [], total: 0 } };
      const links = await prisma.taskTag.findMany({
        where: { tagId: tag.id, task: { creatorId: userId, isDeleted: false, parentId: null } },
        include: { task: { select: TASK_SELECT } },
        take: 50,
      });
      const tasks = links.map((l) => l.task);
      return { ok: true, summary: `С тегом «${tag.name}»: ${tasks.length}`, data: { tasks: tasks.map((t) => serializeTask(t, ctx.tz)) } };
    },
  },
  {
    name: 'get_projects',
    description: 'Список проектов пользователя.',
    parameters: { type: 'object', properties: {} },
    execute: async (userId) => {
      const members = await prisma.projectMember.findMany({
        where: { userId },
        include: { project: { include: { _count: { select: { tasks: { where: { isDeleted: false, status: { not: 'COMPLETED' } } } } } } } },
      });
      return {
        ok: true,
        summary: `Проектов: ${members.length}`,
        data: { projects: members.map((m) => ({ id: m.project.id, name: m.project.name, openTasks: m.project._count.tasks })) },
      };
    },
  },
  {
    name: 'create_project',
    description: 'Создать проект.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
    },
    execute: async (userId, a) => {
      const project = await prisma.project.create({
        data: { name: String(a.name).slice(0, 200), members: { create: { userId, role: 'OWNER' } } },
      });
      return { ok: true, summary: `Проект «${project.name}» создан`, data: { project: { id: project.id, name: project.name } } };
    },
  },
  {
    name: 'get_tags',
    description: 'Теги пользователя.',
    parameters: { type: 'object', properties: {} },
    execute: async (userId) => {
      const tags = await prisma.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
      return { ok: true, summary: `Тегов: ${tags.length}`, data: { tags: tags.map((t) => ({ id: t.id, name: t.name })) } };
    },
  },
  {
    name: 'attach_tag',
    description: 'Добавить тег задаче (тег создастся, если нет).',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string', minLength: 1 }, tagName: { type: 'string', minLength: 1, maxLength: 60 } },
      required: ['taskId', 'tagName'],
    },
    execute: async (userId, a) => {
      const task = await findTask(userId, String(a.taskId));
      const name = String(a.tagName).trim().slice(0, 60);
      let tag = await prisma.tag.findFirst({ where: { userId, name } });
      if (!tag) tag = await prisma.tag.create({ data: { userId, name } });
      await prisma.taskTag.upsert({
        where: { taskId_tagId: { taskId: task.id, tagId: tag.id } },
        update: {},
        create: { taskId: task.id, tagId: tag.id },
      });
      return { ok: true, summary: `Тег «${name}» добавлен` };
    },
  },
  {
    name: 'detach_tag',
    description: 'Убрать тег с задачи.',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string', minLength: 1 }, tagName: { type: 'string', minLength: 1, maxLength: 60 } },
      required: ['taskId', 'tagName'],
    },
    execute: async (userId, a) => {
      const task = await findTask(userId, String(a.taskId));
      const tag = await prisma.tag.findFirst({ where: { userId, name: String(a.tagName).trim() } });
      if (!tag) throw new AppError(404, 'Тег не найден');
      await prisma.taskTag.deleteMany({ where: { taskId: task.id, tagId: tag.id } });
      return { ok: true, summary: `Тег «${tag.name}» убран` };
    },
  },
  {
    name: 'get_habits',
    description: 'Привычки и выполнение сегодня.',
    parameters: { type: 'object', properties: {} },
    execute: async (userId) => {
      const habits = await prisma.habit.findMany({ where: { userId, isArchived: false }, include: { logs: { orderBy: { date: 'desc' }, take: 30 } } });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const data = habits.map((h) => {
        const todayLog = h.logs.find((l) => new Date(l.date).getTime() === today.getTime());
        let streak = 0;
        for (let i = 0; i < 365; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const found = h.logs.find((l) => new Date(l.date).getTime() === d.getTime());
          if (found && found.count > 0) streak++;
          else if (i === 0) continue;
          else break;
        }
        return { id: h.id, name: h.name, doneToday: Boolean(todayLog && todayLog.count > 0), streak };
      });
      return { ok: true, summary: `Привычек: ${data.length}`, data: { habits: data } };
    },
  },
  {
    name: 'complete_habit',
    description: 'Отметить привычку выполненной сегодня.',
    parameters: { type: 'object', properties: { habitId: { type: 'string', minLength: 1 } }, required: ['habitId'] },
    execute: async (userId, a) => {
      const habit = await prisma.habit.findFirst({ where: { id: String(a.habitId), userId } });
      if (!habit) throw new AppError(404, 'Привычка не найдена');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.habitLog.upsert({
        where: { habitId_date: { habitId: habit.id, date: today } },
        update: { count: 1 },
        create: { habitId: habit.id, date: today, count: 1 },
      });
      return { ok: true, summary: `«${habit.name}» отмечена` };
    },
  },
  {
    name: 'get_goals',
    description: 'Цели пользователя.',
    parameters: { type: 'object', properties: {} },
    execute: async (userId) => {
      const goals = await prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 });
      return {
        ok: true,
        summary: `Целей: ${goals.length}`,
        data: { goals: goals.map((g) => ({ id: g.id, name: g.name, current: g.currentValue, target: g.targetValue, unit: g.unit, deadline: g.deadline, done: g.isCompleted })) },
      };
    },
  },
  {
    name: 'create_goal',
    description: 'Создать цель.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        target: { type: 'number' },
        unit: str(32, 'Единица'),
        deadlineISO: str(64, 'Дедлайн ISO'),
      },
      required: ['name'],
    },
    execute: async (userId, a) => {
      const goal = await prisma.goal.create({
        data: {
          userId,
          name: String(a.name).slice(0, 200),
          targetValue: typeof a.target === 'number' ? a.target : null,
          unit: a.unit ? String(a.unit).slice(0, 32) : null,
          deadline: a.deadlineISO ? new Date(String(a.deadlineISO)) : null,
        },
      });
      return { ok: true, summary: `Цель «${goal.name}» создана`, data: { goal: { id: goal.id, name: goal.name } } };
    },
  },
  {
    name: 'focus_summary',
    description: 'Статистика фокуса за N дней.',
    parameters: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90 } } },
    execute: async (userId, a) => {
      const days = Math.min(Math.max(Number(a.days) || 7, 1), 90);
      const since = new Date(Date.now() - days * 86400000);
      const sessions = await prisma.focusSession.findMany({ where: { userId, startedAt: { gte: since } } });
      const minutes = sessions.reduce((s, x) => s + (x.durationMin || 0), 0);
      const byDay: Record<string, number> = {};
      for (const s of sessions) {
        const k = new Date(s.startedAt).toISOString().slice(0, 10);
        byDay[k] = (byDay[k] || 0) + (s.durationMin || 0);
      }
      const best = Object.entries(byDay).sort((x, y) => y[1] - x[1])[0];
      return { ok: true, summary: `Фокус: ${sessions.length} сессий, ${minutes} мин за ${days} дн.`, data: { sessions: sessions.length, minutes, bestDay: best ? { date: best[0], minutes: best[1] } : null } };
    },
  },
  {
    name: 'day_summary',
    description: 'Итоги дня: завершено/в работе/осталось/просрочено + фокус.',
    parameters: { type: 'object', properties: { offsetDays: { type: 'integer', minimum: -30, maximum: 30 } } },
    execute: async (userId, a, ctx) => {
      const offset = Number(a.offsetDays) || 0;
      const r = dayRange(ctx.tz, new Date(), offset);
      const [dayTasks, overdue, focus] = await Promise.all([
        prisma.task.findMany({ where: { ...taskWhere(userId), dueDate: { gte: new Date(r.from), lt: new Date(r.to) } }, select: TASK_SELECT }),
        prisma.task.count({ where: { ...taskWhere(userId), status: { not: 'COMPLETED' }, dueDate: { lt: new Date() } } }),
        prisma.focusSession.findMany({ where: { userId, startedAt: { gte: new Date(r.from), lt: new Date(r.to) } } }),
      ]);
      const done = dayTasks.filter((t) => t.status === 'COMPLETED').length;
      const inProg = dayTasks.filter((t) => t.status === 'IN_PROGRESS').length;
      const left = dayTasks.length - done;
      const focusMin = focus.reduce((s, x) => s + (x.durationMin || 0), 0);
      return {
        ok: true,
        summary: `Завершено: ${done}, в работе: ${inProg}, осталось: ${left}, просрочено: ${overdue}, фокус: ${focusMin} мин`,
        data: {
          done, inProgress: inProg, left, overdue, focusMin,
          tasks: dayTasks.map((t) => serializeTask(t, ctx.tz)),
        },
      };
    },
  },
  {
    name: 'productivity_stats',
    description: 'Продуктивность за период: создано/завершено по дням.',
    parameters: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90 } } },
    execute: async (userId, a) => {
      const days = Math.min(Math.max(Number(a.days) || 7, 1), 90);
      const since = new Date(Date.now() - days * 86400000);
      const [created, completed] = await Promise.all([
        prisma.task.count({ where: { creatorId: userId, createdAt: { gte: since } } }),
        prisma.task.count({ where: { creatorId: userId, status: 'COMPLETED', completedAt: { gte: since } } }),
      ]);
      return { ok: true, summary: `За ${days} дн.: создано ${created}, завершено ${completed}`, data: { days, created, completed } };
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function toolSchemasForLlm() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}
