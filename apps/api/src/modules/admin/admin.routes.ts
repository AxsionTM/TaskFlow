import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { authMiddleware, AuthRequest } from '../../common/middleware/auth';
import { requireAdmin } from '../../common/middleware/admin';

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
      })
      .parse(req.query);

    const where: any = {};
    if (q.action) where.action = q.action;
    if (q.admin) where.adminEmail = { contains: q.admin, mode: 'insensitive' };
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
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
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

export { router as adminRouter };
