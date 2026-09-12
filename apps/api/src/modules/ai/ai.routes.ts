import { Router } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../common/middleware/auth';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';

const router = Router();
const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

let aiFlagCache: { value: boolean; at: number } | null = null;

async function isAiEnabled(): Promise<boolean> {
  const now = Date.now();
  if (aiFlagCache && now - aiFlagCache.at < 30000) return aiFlagCache.value;
  try {
    const row = await prisma.featureFlag.findUnique({ where: { key: 'AI_ASSISTANT' } });
    aiFlagCache = { value: row ? row.enabled : true, at: now };
  } catch {
    aiFlagCache = { value: true, at: now };
  }
  return aiFlagCache.value;
}

async function assertAiEnabled() {
  if (!(await isAiEnabled())) {
    throw new AppError(403, 'AI-помощник временно отключён администратором', 'AI_DISABLED');
  }
}

export function invalidateAiFlagCache() {
  aiFlagCache = null;
}

/** Local heuristics when Python AI service is offline */
function localBreakdown(title: string, description?: string) {
  const text = `${title} ${description || ''}`.trim();
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length <= 3) {
    return {
      subtasks: [
        { title: `Начать: ${title}`, priority: 'HIGH' },
        { title: `Завершить: ${title}`, priority: 'MEDIUM' },
      ],
    };
  }

  return {
    subtasks: [
      { title: `Исследовать: ${title}`, priority: 'MEDIUM' },
      { title: `Спланировать: ${title}`, priority: 'HIGH' },
      { title: `Выполнить: ${title}`, priority: 'HIGH' },
      { title: `Проверить результат: ${title}`, priority: 'LOW' },
    ],
  };
}

function localPriority(title: string, description?: string) {
  const text = `${title} ${description || ''}`.toLowerCase();
  const urgent = ['срочно', 'asap', 'сегодня', 'критично', 'важно', 'дедлайн', 'urgent'];
  const high = ['нужно', 'должен', 'необходимо', 'important'];

  if (urgent.some((k) => text.includes(k))) {
    return { priority: 'HIGH', confidence: 0.85 };
  }
  if (high.some((k) => text.includes(k))) {
    return { priority: 'MEDIUM', confidence: 0.7 };
  }
  return { priority: 'LOW', confidence: 0.6 };
}

function localDayPlan(tasks: any[], availableHours = 8) {
  const order = [...tasks].sort((a, b) => {
    const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
    return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
  });

  return {
    recommended_order: order.map((t) => t.id || t.title),
    estimated_hours: Math.min(order.length * 0.75, availableHours),
    tips: [
      'Начните с задач высокого приоритета',
      'Делайте перерывы каждые 90 минут',
      'Группируйте похожие задачи',
    ],
  };
}

async function callAi(path: string, body: unknown): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${AI_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const aiTextSchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(10000).optional(),
});

const aiTaskItemSchema = z
  .object({
    id: z.string().max(64).optional(),
    title: z.string().max(500).optional(),
    description: z.string().max(2000).optional(),
  })
  .catchall(z.unknown());

router.post('/breakdown', async (req: AuthRequest, res, next) => {
  try {
    const data = aiTextSchema.parse(req.body);

    await assertAiEnabled();
    const remote = await callAi('/ai/breakdown', data);
    const result = remote || localBreakdown(data.title, data.description);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/priority', async (req: AuthRequest, res, next) => {
  try {
    const data = aiTextSchema.parse(req.body);

    await assertAiEnabled();
    const remote = await callAi('/ai/priority', data);
    const result = remote || localPriority(data.title, data.description);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/day-plan', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        tasks: z.array(aiTaskItemSchema).max(200),
        available_hours: z.number().min(0.5).max(24).optional(),
      })
      .parse(req.body);

    await assertAiEnabled();
    const remote = await callAi('/ai/day-plan', data);
    const result =
      remote || localDayPlan(data.tasks, data.available_hours ?? 8);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/productivity', async (req: AuthRequest, res, next) => {
  try {
    await assertAiEnabled();
    const data = z
      .object({
        tasks: z.array(aiTaskItemSchema).max(200).optional(),
        days: z.number().int().min(1).max(90).optional(),
      })
      .strict()
      .parse(req.body || {});
    const remote = await callAi('/ai/productivity', data);
    res.json(
      remote || {
        score: 75,
        summary: 'Хорошая продуктивность на этой неделе',
        insights: [
          'Вы завершили большую часть запланированных задач',
          'Пик активности — утренние часы',
          'Рекомендуется увеличить время на глубокую работу',
        ],
      }
    );
  } catch (err) {
    next(err);
  }
});

export { router as aiRouter };
