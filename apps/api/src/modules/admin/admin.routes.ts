import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { authMiddleware, AuthRequest, invalidateMaintenanceCache } from '../../common/middleware/auth';
import { requireAdmin } from '../../common/middleware/admin';
import { invalidateAiFlagCache } from '../ai/ai.routes';

const router = Router();

// Все endpoints ниже: сначала authentication, затем проверка роли ADMIN на backend.
router.use(authMiddleware, requireAdmin);

const PLANS = ['FREE', 'PRO', 'BUSINESS'] as const;
const ROLES = ['USER', 'ADMIN'] as const;

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

function clientIp(req: AuthRequest): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim().slice(0, 64);
  return req.ip?.slice(0, 64);
}

async function logAction(
  req: AuthRequest,
  action: string,
  targetUserId: string | null,
  description?: string,
  oldValue?: unknown,
  newValue?: unknown
) {
  const admin = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { email: true },
  });
  await prisma.adminLog.create({
    data: {
      adminId: req.userId!,
      adminEmail: admin?.email || '',
      action,
      targetUserId,
      description,
      oldValue: oldValue === undefined ? undefined : JSON.stringify(oldValue),
      newValue: newValue === undefined ? undefined : JSON.stringify(newValue),
      ip: clientIp(req),
    },
  });
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function daySeries(days: number): { key: string; from: Date; to: Date }[] {
  const out: { key: string; from: Date; to: Date }[] = [];
  const today = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const from = new Date(today);
    from.setDate(from.getDate() - i);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    out.push({ key: from.toISOString().slice(0, 10), from, to });
  }
  return out;
}

// --- Dashboard stats ---

router.get('/stats', async (_req, res, next) => {
  try {
    const now = new Date();
    const today = startOfDay(now);
    const week = new Date(today);
    week.setDate(week.getDate() - 7);
    const month = new Date(today);
    month.setDate(month.getDate() - 30);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newToday,
      newWeek,
      newMonth,
      activeUsers,
      freeUsers,
      proUsers,
      businessUsers,
      balanceAgg,
      activeSubs,
      revenueTotal,
      revenueToday,
      revenueWeek,
      revenueMonth,
      totalTasks,
      tasksToday,
      tasksCompletedToday,
      openTasks,
      unresolvedErrors,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: week } } }),
      prisma.user.count({ where: { createdAt: { gte: month } } }),
      prisma.user.count({ where: { lastActiveAt: { gte: dayAgo } } }),
      prisma.user.count({ where: { plan: 'FREE' } }),
      prisma.user.count({ where: { plan: 'PRO' } }),
      prisma.user.count({ where: { plan: 'BUSINESS' } }),
      prisma.user.aggregate({ _sum: { balance: true } }),
      prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
      }),
      prisma.transaction.aggregate({
        where: { status: 'COMPLETED', amount: { gt: 0 }, type: { in: ['DEPOSIT', 'SUBSCRIPTION'] } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { status: 'COMPLETED', amount: { gt: 0 }, type: { in: ['DEPOSIT', 'SUBSCRIPTION'] }, createdAt: { gte: today } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { status: 'COMPLETED', amount: { gt: 0 }, type: { in: ['DEPOSIT', 'SUBSCRIPTION'] }, createdAt: { gte: week } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { status: 'COMPLETED', amount: { gt: 0 }, type: { in: ['DEPOSIT', 'SUBSCRIPTION'] }, createdAt: { gte: month } },
        _sum: { amount: true },
      }),
      prisma.task.count({ where: { isDeleted: false } }),
      prisma.task.count({ where: { createdAt: { gte: today } } }),
      prisma.task.count({ where: { status: 'COMPLETED', completedAt: { gte: today } } }),
      prisma.task.count({ where: { isDeleted: false, status: { not: 'COMPLETED' } } }),
      prisma.errorLog.count({ where: { resolved: false } }),
    ]);

    const series = daySeries(30);
    const registrationsByDay: { date: string; count: number }[] = [];
    const revenueByDay: { date: string; amount: number }[] = [];
    const activityByDay: { date: string; count: number }[] = [];
    for (const d of series) {
      const [regs, rev, act] = await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: d.from, lt: d.to } } }),
        prisma.transaction.aggregate({
          where: {
            status: 'COMPLETED',
            amount: { gt: 0 },
            type: { in: ['DEPOSIT', 'SUBSCRIPTION'] },
            createdAt: { gte: d.from, lt: d.to },
          },
          _sum: { amount: true },
        }),
        prisma.task.count({ where: { createdAt: { gte: d.from, lt: d.to } } }),
      ]);
      registrationsByDay.push({ date: d.key, count: regs });
      revenueByDay.push({ date: d.key, amount: rev._sum.amount || 0 });
      activityByDay.push({ date: d.key, count: act });
    }

    res.json({
      totalUsers,
      activeUsers,
      newToday,
      newWeek,
      newMonth,
      freeUsers,
      proUsers,
      businessUsers,
      totalBalance: balanceAgg._sum.balance || 0,
      activeSubscriptions: activeSubs,
      revenueTotal: revenueTotal._sum.amount || 0,
      revenueToday: revenueToday._sum.amount || 0,
      revenueWeek: revenueWeek._sum.amount || 0,
      revenueMonth: revenueMonth._sum.amount || 0,
      totalTasks,
      tasksToday,
      tasksCompletedToday,
      openTasks,
      unresolvedErrors,
      registrationsByDay,
      revenueByDay,
      activityByDay,
    });
  } catch (err) {
    next(err);
  }
});

// --- Users ---

const usersQuerySchema = pageSchema.extend({
  search: z.string().max(100).optional(),
  plan: z.enum(['FREE', 'PRO', 'BUSINESS']).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  status: z.enum(['active', 'blocked', 'unverified']).optional(),
  subscription: z.enum(['active', 'expired', 'none']).optional(),
  sort: z.enum(['createdAt', 'email', 'balance', 'lastActiveAt']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

router.get('/users', async (req, res, next) => {
  try {
    const q = usersQuerySchema.parse(req.query);
    const now = new Date();

    const where: any = {};
    if (q.search) {
      const s = q.search.trim();
      where.OR = [
        { email: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { id: s },
      ];
    }
    if (q.plan) where.plan = q.plan;
    if (q.role) where.role = q.role;
    if (q.status === 'active') where.isBlocked = false;
    if (q.status === 'blocked') where.isBlocked = true;
    if (q.status === 'unverified') where.emailVerified = false;
    if (q.subscription === 'active') {
      where.subscriptions = {
        some: { status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      };
    }
    if (q.subscription === 'expired') {
      where.subscriptions = { some: { status: { in: ['EXPIRED', 'CANCELLED'] } } };
      where.NOT = {
        subscriptions: { some: { status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gt: now } }] } },
      };
    }
    if (q.subscription === 'none') {
      where.subscriptions = { none: {} };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          plan: true,
          balance: true,
          isBlocked: true,
          emailVerified: true,
          planExpiresAt: true,
          lastActiveAt: true,
          createdAt: true,
          _count: { select: { createdTasks: true } },
        },
        orderBy: { [q.sort]: q.order },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({
      users: users.map((u) => ({
        ...u,
        taskCount: u._count.createdTasks,
        _count: undefined,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        plan: true,
        balance: true,
        isBlocked: true,
        emailVerified: true,
        emailVerifiedAt: true,
        planStartedAt: true,
        planExpiresAt: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new AppError(404, 'Пользователь не найден');

    const [txIn, txOut, transactions, subscriptions, counts, recentTasks, projectCount] =
      await Promise.all([
        prisma.transaction.aggregate({
          where: { userId: user.id, status: 'COMPLETED', amount: { gt: 0 } },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { userId: user.id, status: 'COMPLETED', amount: { lt: 0 } },
          _sum: { amount: true },
        }),
        prisma.transaction.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.subscription.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        Promise.all([
          prisma.task.count({ where: { creatorId: user.id } }),
          prisma.habit.count({ where: { userId: user.id } }),
          prisma.goal.count({ where: { userId: user.id } }),
          prisma.focusSession.count({ where: { userId: user.id } }),
          prisma.birthday.count({ where: { userId: user.id } }),
        ]),
        prisma.task.findMany({
          where: { creatorId: user.id },
          select: { id: true, title: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.projectMember.count({ where: { userId: user.id } }),
      ]);

    res.json({
      user,
      finance: {
        balance: user.balance,
        totalIn: txIn._sum.amount || 0,
        totalOut: Math.abs(txOut._sum.amount || 0),
        transactions,
      },
      subscriptions,
      activity: {
        tasks: counts[0],
        projects: projectCount,
        habits: counts[1],
        goals: counts[2],
        focusSessions: counts[3],
        birthdays: counts[4],
        recentTasks,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Пользователь не найден');

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { name: data.name },
      select: { id: true, name: true },
    });
    await logAction(req, 'USER_RENAME', existing.id, `Имя: ${existing.name} → ${data.name}`, existing.name, data.name);
    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
});

// --- Balance (только через транзакции) ---

const balanceSchema = z.object({
  amount: z.number().positive('Сумма должна быть положительной').max(10000000),
  comment: z.string().max(500).optional(),
});

async function changeBalance(
  req: AuthRequest,
  userId: string,
  amount: number,
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT',
  description?: string
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'Пользователь не найден');
    const next = user.balance + amount;
    if (next < 0) throw new AppError(400, 'Недостаточно средств на балансе');
    const updated = await tx.user.update({ where: { id: userId }, data: { balance: next } });
    const record = await tx.transaction.create({
      data: {
        userId,
        type: type as any,
        amount,
        balanceBefore: user.balance,
        balanceAfter: next,
        description,
        status: 'COMPLETED',
        adminId: req.userId!,
      },
    });
    return { user: updated, transaction: record };
  });
}

router.post('/users/:id/balance', async (req: AuthRequest, res, next) => {
  try {
    const data = balanceSchema.parse(req.body);
    const { user, transaction } = await changeBalance(req, req.params.id, data.amount, 'DEPOSIT', data.comment || 'Пополнение администратором');
    await logAction(req, 'BALANCE_DEPOSIT', user.id, data.comment, transaction.balanceBefore, transaction.balanceAfter);
    res.json({ balance: user.balance, transaction });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/withdraw', async (req: AuthRequest, res, next) => {
  try {
    const data = balanceSchema.parse(req.body);
    const { user, transaction } = await changeBalance(req, req.params.id, -data.amount, 'WITHDRAWAL', data.comment || 'Списание администратором');
    await logAction(req, 'BALANCE_WITHDRAW', user.id, data.comment, transaction.balanceBefore, transaction.balanceAfter);
    res.json({ balance: user.balance, transaction });
  } catch (err) {
    next(err);
  }
});

// --- Plan ---

router.post('/users/:id/plan', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        plan: z.enum(PLANS),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().nullable().optional(),
        price: z.number().min(0).max(10000000).optional().default(0),
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Пользователь не найден');

    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    const endsAt = data.endsAt === null ? null : data.endsAt ? new Date(data.endsAt) : null;

    const result = await prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { userId: existing.id, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
      const sub = await tx.subscription.create({
        data: {
          userId: existing.id,
          plan: data.plan,
          price: data.price,
          startedAt: startsAt,
          endsAt,
          status: 'ACTIVE',
          createdBy: req.userId!,
        },
      });
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: { plan: data.plan, planStartedAt: startsAt, planExpiresAt: endsAt },
      });
      return { sub, updated };
    });

    await logAction(
      req,
      'PLAN_CHANGE',
      existing.id,
      `Тариф ${existing.plan} → ${data.plan}`,
      { plan: existing.plan, expiresAt: existing.planExpiresAt },
      { plan: data.plan, expiresAt: endsAt }
    );
    res.json({ user: { id: result.updated.id, plan: result.updated.plan, planExpiresAt: result.updated.planExpiresAt }, subscription: result.sub });
  } catch (err) {
    next(err);
  }
});

// --- Block / role ---

router.post('/users/:id/block', async (req: AuthRequest, res, next) => {
  try {
    if (req.params.id === req.userId) throw new AppError(400, 'Нельзя заблокировать самого себя');
    const data = z.object({ reason: z.string().max(500).optional() }).parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Пользователь не найден');
    if (existing.role === 'ADMIN') throw new AppError(400, 'Нельзя заблокировать администратора');

    await prisma.user.update({ where: { id: existing.id }, data: { isBlocked: true } });
    await logAction(req, 'USER_BLOCK', existing.id, data.reason || 'Блокировка администратором', false, true);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/unblock', async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Пользователь не найден');
    await prisma.user.update({ where: { id: existing.id }, data: { isBlocked: false } });
    await logAction(req, 'USER_UNBLOCK', existing.id, 'Разблокировка администратором', true, false);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/role', async (req: AuthRequest, res, next) => {
  try {
    // Свою роль изменить нельзя — только чужую. Самоповышение невозможно:
    // endpoint требует ADMIN, а роль может менять только существующий ADMIN.
    if (req.params.id === req.userId) throw new AppError(400, 'Нельзя изменить собственную роль');
    const data = z.object({ role: z.enum(ROLES) }).parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Пользователь не найден');

    await prisma.user.update({ where: { id: existing.id }, data: { role: data.role } });
    await logAction(req, 'ROLE_CHANGE', existing.id, `Роль ${existing.role} → ${data.role}`, existing.role, data.role);
    res.json({ ok: true, role: data.role });
  } catch (err) {
    next(err);
  }
});

// --- Subscriptions ---

router.get('/subscriptions', async (req, res, next) => {
  try {
    const q = pageSchema
      .extend({
        search: z.string().max(100).optional(),
        plan: z.enum(['FREE', 'PRO', 'BUSINESS']).optional(),
        status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
      })
      .parse(req.query);

    const where: any = {};
    if (q.plan) where.plan = q.plan;
    if (q.status) where.status = q.status;
    // Связи Subscription→User в схеме нет — ищем пользователей отдельно, фильтруем по userId.
    if (q.search) {
      const matched = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: q.search, mode: 'insensitive' } },
            { name: { contains: q.search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      const userIds = matched.map((u) => u.id);
      where.userId = { in: userIds.length ? userIds : ['__none__'] };
    }

    const [total, subs, stats] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      Promise.all([
        prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      ]),
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: subs.map((s) => s.userId) } },
      select: { id: true, email: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    res.json({
      subscriptions: subs.map((s) => ({ ...s, user: userMap.get(s.userId) || null })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      stats: { active: stats[0], expired: stats[1] },
    });
  } catch (err) {
    next(err);
  }
});

// --- Transactions ---

router.get('/transactions', async (req, res, next) => {
  try {
    const q = pageSchema
      .extend({
        search: z.string().max(100).optional(),
        type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'SUBSCRIPTION', 'REFUND', 'ADJUSTMENT']).optional(),
        userId: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(req.query);

    const where: any = {};
    if (q.type) where.type = q.type;
    if (q.userId) where.userId = q.userId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    if (q.search) {
      const matched = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: q.search, mode: 'insensitive' } },
            { name: { contains: q.search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      const ids = matched.map((u) => u.id);
      where.userId = { in: ids.length ? ids : ['__none__'] };
    }

    const [total, txs] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: txs.map((t) => t.userId) } },
      select: { id: true, email: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    res.json({
      transactions: txs.map((t) => ({ ...t, user: userMap.get(t.userId) || null })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (err) {
    next(err);
  }
});

// --- Revenue ---

router.get('/revenue', async (_req, res, next) => {
  try {
    const now = new Date();
    const today = startOfDay(now);
    const week = new Date(today);
    week.setDate(week.getDate() - 7);
    const month = new Date(today);
    month.setDate(month.getDate() - 30);
    const year = new Date(today);
    year.setFullYear(year.getFullYear() - 1);
    const base = {
      status: 'COMPLETED' as const,
      amount: { gt: 0 },
      type: { in: ['DEPOSIT', 'SUBSCRIPTION'] as ('DEPOSIT' | 'SUBSCRIPTION')[] },
    };

    const [total, tToday, tWeek, tMonth, tYear, byPlan] = await Promise.all([
      prisma.transaction.aggregate({ where: { ...base }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { ...base, createdAt: { gte: today } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { ...base, createdAt: { gte: week } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { ...base, createdAt: { gte: month } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { ...base, createdAt: { gte: year } }, _sum: { amount: true } }),
      prisma.subscription.groupBy({
        by: ['plan'],
        where: { price: { gt: 0 } },
        _sum: { price: true },
        _count: { plan: true },
      }),
    ]);

    const revenueByDay: { date: string; amount: number }[] = [];
    for (const d of daySeries(30)) {
      const r = await prisma.transaction.aggregate({
        where: { ...base, createdAt: { gte: d.from, lt: d.to } },
        _sum: { amount: true },
      });
      revenueByDay.push({ date: d.key, amount: r._sum.amount || 0 });
    }

    res.json({
      total: total._sum.amount || 0,
      today: tToday._sum.amount || 0,
      week: tWeek._sum.amount || 0,
      month: tMonth._sum.amount || 0,
      year: tYear._sum.amount || 0,
      byPlan: byPlan.map((p) => ({ plan: p.plan, amount: p._sum.price || 0, count: p._count.plan })),
      revenueByDay,
    });
  } catch (err) {
    next(err);
  }
});

// --- Logs ---

router.get('/logs', async (req, res, next) => {
  try {
    const q = pageSchema
      .extend({
        search: z.string().max(100).optional(),
        action: z.string().max(50).optional(),
        admin: z.string().max(100).optional(),
        success: z.enum(['true', 'false']).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(req.query);

    const where: any = {};
    if (q.action) where.action = q.action;
    if (q.admin) where.adminEmail = { contains: q.admin, mode: 'insensitive' };
    if (q.success !== undefined) where.success = q.success === 'true';
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    if (q.search) {
      where.OR = [
        { description: { contains: q.search, mode: 'insensitive' } },
        { adminEmail: { contains: q.search, mode: 'insensitive' } },
        { targetUserId: q.search },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.adminLog.count({ where }),
      prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({ logs, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

// --- Settings / status (без секретов) ---

router.get('/settings', async (_req, res, next) => {
  try {
    let dbStatus: 'ok' | 'error' = 'ok';
    let dbLatencyMs: number | null = null;
    try {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
    } catch {
      dbStatus = 'error';
    }
    // Redis в проекте не используется (пакет ioredis установлен, обращений из src нет).
    const redisStatus = 'not_used';
    // AI-сервис: лёгкий health-check с коротким таймаутом.
    let aiStatus: 'ok' | 'error' | 'unconfigured' = 'unconfigured';
    if (process.env.AI_SERVICE_URL) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const r = await fetch(`${process.env.AI_SERVICE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        aiStatus = r.ok ? 'ok' : 'error';
      } catch {
        aiStatus = 'error';
      }
    }
    const [users, activeSubs] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    ]);
    let version = '1.0.0';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path');
      const candidates = [
        path.join(process.cwd(), 'package.json'),
        path.join(__dirname, '..', '..', '..', '..', 'package.json'),
      ];
      for (const p of candidates) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (parsed?.version) {
            version = parsed.version;
            break;
          }
        } catch {
          // try next candidate
        }
      }
    } catch {
      // ignore — fallback version above
    }
    res.json({
      environment: process.env.NODE_ENV || 'development',
      apiStatus: 'ok',
      dbStatus,
      dbLatencyMs,
      redisStatus,
      aiStatus,
      authStatus: 'ok',
      uptimeSec: Math.round(process.uptime()),
      version,
      emailConfigured: Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USERNAME),
      totalUsers: users,
      activeSubscriptions: activeSubs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// --- Create user ---

router.post('/users', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        email: z.string().email('Некорректный email'),
        password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
        name: z.string().min(1).max(100).optional(),
      })
      .parse(req.body);

    const email = data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'Пользователь с таким email уже существует');

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: data.name || email.split('@')[0],
        emailVerified: true,
        emailVerifiedAt: new Date(),
        lastActiveAt: new Date(),
      },
      select: { id: true, email: true, name: true, role: true, plan: true, createdAt: true },
    });
    await logAction(req, 'USER_CREATE', user.id, `Создан администратором: ${email}`);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

// --- Full delete user (необратимо, с каскадом по связям) ---

router.delete('/users/:id', async (req: AuthRequest, res, next) => {
  try {
    if (req.params.id === req.userId) throw new AppError(400, 'Нельзя удалить самого себя');
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, role: true },
    });
    if (!existing) throw new AppError(404, 'Пользователь не найден');
    if (existing.role === 'ADMIN') throw new AppError(400, 'Нельзя удалить администратора');

    await prisma.$transaction(async (tx) => {
      // Задачи пользователя удаляем явно (у creatorId нет onDelete Cascade),
      // чтобы не оставить сломанных references; вложенности каскадируются.
      const ownTaskIds = (
        await tx.task.findMany({ where: { creatorId: existing.id }, select: { id: true } })
      ).map((t) => t.id);
      if (ownTaskIds.length) {
        await tx.task.deleteMany({ where: { id: { in: ownTaskIds } } });
      }
      // Чужие задачи, назначенные пользователю, — снимаем назначение.
      await tx.task.updateMany({ where: { assigneeId: existing.id }, data: { assigneeId: null } });
      // Коды верификации привязаны к email строкой — чистим, чтобы не мешались.
      await tx.verificationCode.deleteMany({ where: { email: existing.email } });
      // Остальное (аккаунты OAuth, дни рождения, сессии, проекты-участия,
      // теги, привычки, цели, списки, фокус-сессии, уведомления, подписки,
      // транзакции) удаляется через onDelete: Cascade в схеме.
      await tx.user.delete({ where: { id: existing.id } });
    });

    await logAction(req, 'USER_DELETE', existing.id, `Удалён навсегда: ${existing.email}`, existing.email, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Admin password change (тот же bcrypt, инвалидация старых токенов) ---

router.post('/users/:id/password', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
        confirmPassword: z.string().min(1, 'Повторите пароль'),
      })
      .parse(req.body);
    if (data.password !== data.confirmPassword) throw new AppError(400, 'Пароли не совпадают');

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Пользователь не найден');

    const passwordHash = await bcrypt.hash(data.password, 12);
    await prisma.user.update({
      where: { id: existing.id },
      // passwordChangedAt отклоняет все токены, выпущенные раньше (см. authMiddleware).
      data: { passwordHash, passwordChangedAt: new Date() },
    });
    await logAction(req, 'USER_PASSWORD_CHANGED', existing.id, `Пароль изменён администратором: ${existing.email}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Tasks management ---

const adminTasksQuerySchema = pageSchema.extend({
  search: z.string().max(100).optional(),
  userId: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
  sort: z.enum(['createdAt', 'dueDate', 'updatedAt']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

router.get('/tasks', async (req, res, next) => {
  try {
    const q = adminTasksQuerySchema.parse(req.query);
    const where: any = { isDeleted: false };
    if (q.userId) where.creatorId = q.userId;
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
        { id: q.search },
      ];
    }
    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          startDate: true,
          creatorId: true,
          createdAt: true,
          creator: { select: { email: true, name: true } },
        },
        orderBy: { [q.sort]: q.order },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    res.json({ tasks, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

router.get('/tasks/:id', async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        tags: { include: { tag: true } },
        checklist: { orderBy: { sortOrder: 'asc' } },
        project: { select: { id: true, name: true, color: true } },
        creator: { select: { id: true, email: true, name: true } },
        assignee: { select: { id: true, email: true, name: true } },
        _count: { select: { children: true } },
      },
    });
    if (!task) throw new AppError(404, 'Задача не найдена');
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.patch('/tasks/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(10000).nullable().optional(),
        status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
        priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
        dueDate: z.string().datetime().nullable().optional(),
        startDate: z.string().datetime().nullable().optional(),
      })
      .parse(req.body);

    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Задача не найдена');

    const patch: any = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.completedAt = data.status === 'COMPLETED' ? new Date() : null;
    }
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.dueDate !== undefined) patch.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.startDate !== undefined) patch.startDate = data.startDate ? new Date(data.startDate) : null;

    const updated = await prisma.task.update({ where: { id: existing.id }, data: patch });
    await logAction(req, 'TASK_UPDATE', existing.creatorId, `Задача «${existing.title}» изменена`, { title: existing.title }, { title: updated.title, status: updated.status });
    res.json({ task: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/tasks/:id', async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Задача не найдена');
    await prisma.task.delete({ where: { id: existing.id } });
    await logAction(req, 'TASK_DELETE', existing.creatorId, `Задача удалена: «${existing.title}»`, existing.title, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Global search (backend, с лимитами — всю БД во frontend не тянем) ---

router.get('/search', async (req, res, next) => {
  try {
    const q = z.object({ q: z.string().min(1).max(100) }).parse(req.query);
    const s = q.q.trim();
    const [users, tasks] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: s, mode: 'insensitive' } },
            { name: { contains: s, mode: 'insensitive' } },
            { id: s },
          ],
        },
        select: { id: true, email: true, name: true, role: true, isBlocked: true },
        take: 5,
      }),
      prisma.task.findMany({
        where: {
          isDeleted: false,
          OR: [
            { title: { contains: s, mode: 'insensitive' } },
            { id: s },
          ],
        },
        select: { id: true, title: true, status: true, creatorId: true },
        take: 5,
      }),
    ]);
    res.json({ users, tasks });
  } catch (err) {
    next(err);
  }
});

// --- Impersonation log (сам просмотр — read-only, данные через /tasks?userId=) ---

router.post('/users/:id/impersonate', async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, name: true },
    });
    if (!existing) throw new AppError(404, 'Пользователь не найден');
    await logAction(req, 'IMPERSONATE', existing.id, `Просмотр аккаунта: ${existing.email}`);
    res.json({ ok: true, user: existing });
  } catch (err) {
    next(err);
  }
});

// --- Error Center ---

router.get('/errors', async (req, res, next) => {
  try {
    const q = pageSchema
      .extend({
        search: z.string().max(200).optional(),
        status: z.coerce.number().int().optional(),
        resolved: z.enum(['true', 'false']).optional(),
        sort: z.enum(['lastSeen', 'count', 'firstSeen']).optional().default('lastSeen'),
        order: z.enum(['asc', 'desc']).optional().default('desc'),
      })
      .parse(req.query);
    const where: any = {};
    if (q.status !== undefined) where.statusCode = q.status;
    if (q.resolved !== undefined) where.resolved = q.resolved === 'true';
    if (q.search) {
      where.OR = [
        { message: { contains: q.search, mode: 'insensitive' } },
        { endpoint: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const [total, errors, unresolved] = await Promise.all([
      prisma.errorLog.count({ where }),
      prisma.errorLog.findMany({
        where,
        orderBy: { [q.sort]: q.order },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.errorLog.count({ where: { resolved: false } }),
    ]);
    res.json({ errors, total, page: q.page, pageSize: q.pageSize, unresolved });
  } catch (err) {
    next(err);
  }
});

router.patch('/errors/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = z.object({ resolved: z.boolean() }).parse(req.body);
    const existing = await prisma.errorLog.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Ошибка не найдена');
    const updated = await prisma.errorLog.update({
      where: { id: existing.id },
      data: { resolved: data.resolved, resolvedAt: data.resolved ? new Date() : null },
    });
    await logAction(req, data.resolved ? 'ERROR_RESOLVE' : 'ERROR_REOPEN', null, `${existing.method} ${existing.endpoint}: ${existing.message.slice(0, 120)}`);
    res.json({ error: updated });
  } catch (err) {
    next(err);
  }
});

// --- Broadcast notifications (существующая модель Notification) ---

router.post('/notifications', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        title: z.string().min(1).max(200),
        message: z.string().min(1).max(2000),
        userIds: z.array(z.string()).max(500).optional(),
        all: z.boolean().optional(),
      })
      .parse(req.body);

    let targets: string[];
    if (data.all) {
      const all = await prisma.user.findMany({ where: { isBlocked: false }, select: { id: true }, take: 10000 });
      targets = all.map((u) => u.id);
    } else if (data.userIds?.length) {
      const found = await prisma.user.findMany({
        where: { id: { in: data.userIds } },
        select: { id: true },
      });
      targets = found.map((u) => u.id);
    } else {
      throw new AppError(400, 'Укажите получателей: all или userIds');
    }
    if (!targets.length) throw new AppError(400, 'Нет получателей');

    // Пакетами, чтобы не превышать лимиты драйвера.
    const BATCH = 500;
    for (let i = 0; i < targets.length; i += BATCH) {
      await prisma.notification.createMany({
        data: targets.slice(i, i + BATCH).map((userId) => ({
          userId,
          title: data.title,
          body: data.message,
          type: 'ADMIN_BROADCAST',
          data: { fromAdmin: req.userId },
        })),
      });
    }
    await logAction(req, 'NOTIFICATION_SEND', null, `«${data.title}» → ${targets.length} получателей`);
    res.json({ ok: true, recipients: targets.length });
  } catch (err) {
    next(err);
  }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const q = pageSchema.parse(req.query);
    // История рассылок: группируем по заголовку+тексту+времени создания.
    const groups = await prisma.notification.groupBy({
      by: ['title', 'body', 'type', 'createdAt'],
      where: { type: 'ADMIN_BROADCAST' },
      _count: { title: true },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    const total = await prisma.notification.groupBy({
      by: ['title', 'body', 'type', 'createdAt'],
      where: { type: 'ADMIN_BROADCAST' },
    }).then((g) => g.length);
    res.json({
      broadcasts: groups.map((g, i) => ({
        id: `${g.createdAt.toISOString()}-${i}`,
        title: g.title,
        message: g.body,
        recipients: g._count.title,
        createdAt: g.createdAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (err) {
    next(err);
  }
});

// --- Feature flags (только реальные возможности) ---

const KNOWN_FLAGS: { key: string; description: string }[] = [
  { key: 'AI_ASSISTANT', description: 'AI-помощник: разбор задач, приоритеты, план дня (/ai/*)' },
];

router.get('/feature-flags', async (_req, res, next) => {
  try {
    for (const f of KNOWN_FLAGS) {
      await prisma.featureFlag.upsert({
        where: { key: f.key },
        update: {},
        create: { key: f.key, description: f.description, enabled: true },
      });
    }
    const flags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    res.json({ flags });
  } catch (err) {
    next(err);
  }
});

router.put('/feature-flags/:key', async (req: AuthRequest, res, next) => {
  try {
    const data = z.object({ enabled: z.boolean() }).parse(req.body);
    const key = req.params.key;
    if (!KNOWN_FLAGS.some((f) => f.key === key)) throw new AppError(404, 'Неизвестный флаг');
    const before = await prisma.featureFlag.findUnique({ where: { key } });
    const updated = await prisma.featureFlag.upsert({
      where: { key },
      update: { enabled: data.enabled },
      create: { key, enabled: data.enabled },
    });
    if (key === 'AI_ASSISTANT') invalidateAiFlagCache();
    await logAction(req, data.enabled ? 'FLAG_ENABLE' : 'FLAG_DISABLE', null, `Флаг ${key}`, before?.enabled, data.enabled);
    res.json({ flag: updated });
  } catch (err) {
    next(err);
  }
});

// --- Maintenance mode ---

router.get('/system/maintenance', async (_req, res, next) => {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'MAINTENANCE_MODE' } });
    const parsed = row ? (JSON.parse(row.value) as { enabled?: boolean; message?: string }) : null;
    res.json({ enabled: Boolean(parsed?.enabled), message: parsed?.message || '' });
  } catch (err) {
    next(err);
  }
});

router.post('/system/maintenance', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({ enabled: z.boolean(), message: z.string().max(500).optional() })
      .parse(req.body);
    await prisma.systemSetting.upsert({
      where: { key: 'MAINTENANCE_MODE' },
      update: { value: JSON.stringify({ enabled: data.enabled, message: data.message || '' }) },
      create: { key: 'MAINTENANCE_MODE', value: JSON.stringify({ enabled: data.enabled, message: data.message || '' }) },
    });
    invalidateMaintenanceCache();
    await logAction(
      req,
      data.enabled ? 'MAINTENANCE_ENABLE' : 'MAINTENANCE_DISABLE',
      null,
      data.enabled ? `Включён: ${data.message || ''}` : 'Выключен',
      !data.enabled,
      data.enabled
    );
    res.json({ ok: true, enabled: data.enabled });
  } catch (err) {
    next(err);
  }
});

export { router as adminRouter };
