/**
 * Rule-based движок агента (работает без LLM-ключа).
 * Понимает русские команды, выполняет TOOLS через backend,
 * цифры берёт только из результатов tools.
 */
import { TOOL_MAP } from './tools';
import { parseRuDateTime, formatInTz, dayKeyInTz, zonedTomorrowNoon, zonedToISO } from './nl-dates';
import { chatText, isLlmConfigured } from './llm';

export interface AgentContext {
  tz: string;
  lastTaskId?: string | null;
  lastTaskTitle?: string | null;
  pendingChoice?: { candidates: { id: string; title: string; sub?: string }[] } | null;
}

export interface TurnStep {
  label: string;
  status: 'done' | 'active';
}

export interface PendingOp {
  tool: string;
  args: Record<string, any>;
}

export interface TurnResult {
  reply: string;
  steps: TurnStep[];
  cards: any[];
  options?: { key: string; label: string; sub?: string }[];
  confirm?: { token: string; summary: string; kind: 'delete' | 'mass' };
  pendingOps?: PendingOp[];
  lastTaskId?: string | null;
  lastTaskTitle?: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

// \b в JS не работает с кириллицей, поэтому для русских слов используем
// явную границу: (^|[^а-яa-z0-9_]) слева и (?![а-яa-z0-9_]) справа.
const L = '(?:^|[^а-яa-z0-9_])';
const R = '(?![а-яa-z0-9_])';

function extractQuoted(text: string): string | null {
  const m = text.match(/["«»„“”'']([^"«»„“”'']{2,120})["«»„“”'']/);
  return m ? m[1].trim() : null;
}

const ORDINALS: [RegExp, number][] = [
  [/перв/, 0], [/втор/, 1], [/трет/, 2], [/четверт/, 3], [/пят/, 4],
  [/шест/, 5], [/седьм/, 6], [/восьм/, 7], [/девят/, 8], [/десят/, 9],
];

function parseOrdinal(text: string, count: number): number | null {
  const t = norm(text);
  if (/последн/.test(t)) return count - 1;
  for (const [re, i] of ORDINALS) {
    if (re.test(t) && i < count) return i;
  }
  const m = t.match(/(\d+)\s*(?:[.\)-]|ю|й|ю\s+подзадачу|й\s+подзадачу)?/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= count) return n - 1;
  }
  return null;
}

async function callTool(userId: string, name: string, args: any, ctx: { tz: string }, steps: TurnStep[]) {
  const tool = TOOL_MAP.get(name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  const started = steps.length;
  steps.push({ label: toolLabel(name, args), status: 'active' });
  try {
    if (JSON.stringify(args || {}).length > 4000) throw new Error('Слишком большие аргументы');
    const r = await tool.execute(userId, args || {}, ctx);
    steps[started] = { label: toolLabel(name, args), status: 'done' };
    return r;
  } catch (e: any) {
    steps[started] = { label: toolLabel(name, args), status: 'done' };
    throw e;
  }
}

function toolLabel(name: string, args: any): string {
  const map: Record<string, string> = {
    search_tasks: 'Ищу задачи',
    get_task: 'Открываю задачу',
    today_tasks: 'Смотрю задачи на сегодня',
    tomorrow_tasks: 'Смотрю задачи на завтра',
    week_tasks: 'Смотрю задачи на неделю',
    overdue_tasks: 'Ищу просроченные',
    tasks_by_project: 'Смотрю проект',
    tasks_by_tag: 'Ищу по тегу',
    create_task: 'Создаю задачу',
    update_task: 'Обновляю задачу',
    complete_task: 'Завершаю задачу',
    get_subtasks: 'Смотрю подзадачи',
    create_subtask: 'Создаю подзадачу',
    update_subtask: 'Обновляю подзадачу',
    complete_subtask: 'Завершаю подзадачу',
    get_note: 'Читаю заметку',
    create_note: 'Создаю заметку',
    update_note: 'Обновляю заметку',
    append_note: 'Дописываю в заметку',
    get_projects: 'Смотрю проекты',
    create_project: 'Создаю проект',
    get_tags: 'Смотрю теги',
    attach_tag: 'Добавляю тег',
    detach_tag: 'Убираю тег',
    get_habits: 'Смотрю привычки',
    complete_habit: 'Отмечаю привычку',
    get_goals: 'Смотрю цели',
    create_goal: 'Создаю цель',
    focus_summary: 'Считаю фокус',
    day_summary: 'Подвожу итоги дня',
    productivity_stats: 'Считаю статистику',
  };
  void args;
  return map[name] || name;
}

/** Резолв "её/эту/по названию" в задачу. */
async function resolveTask(
  userId: string,
  text: string,
  context: AgentContext,
  steps: TurnStep[]
): Promise<{ task: any } | { candidates: { id: string; title: string; sub?: string }[] } | null> {
  const t = norm(text);
  const quoted = extractQuoted(text);
  if (/(ее|его|ею|ей|ему|им|ней|эту|этот|этой|также|ту же)/.test(t) && context.lastTaskId) {
    try {
      const r = await callTool(userId, 'get_task', { taskId: context.lastTaskId }, { tz: context.tz }, steps);
      return { task: (r.data as any)?.task || r.data };
    } catch {
      // задача могла быть удалена — ищем дальше по названию
    }
  }
  // "вторую подзадачу" здесь не обрабатываем (это уровень subtasks)
  const query = quoted || stripVerbs(text);
  if (!query || query.length < 2) return null;
  const r = await callTool(userId, 'search_tasks', { query: query.slice(0, 120), limit: 6 }, { tz: context.tz }, steps);
  const list = (r.data as any)?.tasks || [];
  if (list.length === 0) return null;
  if (list.length === 1) return { task: list[0] };
  // Точное совпадение — берём сразу
  const exact = list.find((x: any) => norm(x.title) === norm(query));
  if (exact) return { task: exact };
  return {
    candidates: list.slice(0, 5).map((x: any) => ({
      id: x.id,
      title: x.title,
      sub: `${x.project?.name || 'Без проекта'} · ${x.status === 'COMPLETED' ? 'завершена' : x.dueLabel}`,
    })),
  };
}

function stripVerbs(text: string): string {
  let t = ` ${norm(text)} `;
  const verbs = [
    'пожалуйста', 'создай', 'создать', 'добавь', 'добавить', 'новую задачу', 'новая задача', 'задачу',
    'напомни', 'запланируй', 'найди', 'найти', 'покажи', 'показать', 'ищу', 'где',
    'перенеси', 'перенести', 'поставь', 'поставить', 'измени', 'изменить', 'поменяй',
    'заверши', 'завершить', 'удали', 'удалить', 'открой', 'открыть',
  ];
  for (const v of verbs) t = t.replace(new RegExp(`${L}(?:${v})${R}`, 'g'), ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/** Мусорные вводные обороты, не относящиеся к сути задачи. */
const FILLER = [
  'мне', 'тебе', 'нам', 'пожалуйста', 'давай', 'надо', 'нужно будет', 'нужно', 'надо будет',
  'сесть и', 'сядь и', 'просто', 'немного', 'как следует', 'обязательно',
];

function stripFiller(s: string): string {
  let t = ` ${s} `;
  for (const f of FILLER) t = t.replace(new RegExp(`${L}${f}${R}`, 'g'), ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function stripDateTimeProjectTags(s: string): string {
  return s
    .replace(/(завтра|послезавтра|сегодня|утром|вечером|днем|днём|с\s+\S+\s+до\s+\S+|в\s+\d{1,2}(?::\d{2})?|на\s+следующей\s+неделе|через\s+\d+\s+\S+|на\s+\d+\s+подзадач[а-я]*|в\s+понедельник|во\s+вторник|в\s+среду|в\s+четверг|в\s+пятницу|в\s+субботу|в\s+воскресенье|понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресенье)(?![а-я])/gi, ' ')
    .replace(/с\s+(высоким|средним|низким)\s+приоритетом(?![а-я])/gi, ' ')
    .replace(/с\s+(высоким|средним|низким|обычным)(?![а-я])/gi, ' ')
    .replace(/высокий\s+приоритет|средний\s+приоритет|низкий\s+приоритет/gi, ' ')
    .replace(/в\s+проект[а-я]*\s+[а-яa-z0-9 _-]+/gi, ' ')
    .replace(/с\s+тегом\s+[а-яa-z0-9_-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Умное название: глагол-действие + объект.
 * "мне завтра нужно будет сесть и доделать frontend" -> "Доделать frontend".
 */
function extractActionTitle(rawText: string): string {
  const first = rawText.split(/[.!?\n]+/)[0] || '';
  let t = stripFiller(norm(first));
  t = stripVerbs(t);
  t = stripDateTimeProjectTags(t);
  t = stripFiller(t);
  t = t.replace(/^[,:\-–—\s]+|[,:\-–—\s]+$/g, '').trim();
  if (!t) return '';
  // Обрезаем на границах клауз: двоеточие, "и + глагол", "на N подзадач".
  // ("Подготовить встречу и сделай три подзадачи" -> "Подготовить встречу").
  const clause = t.split(/:|\s+и\s+(?=[а-я]{2,})|\s+на\s+\d+\s+подзадач/i)[0];
  // Инфинитив + объект (до 8 слов)
  const m = clause.match(/((?:созвон|позвон|подготов|сдела|додела|исправ|провер|напиш|отправ|встрет|обсуд|заверш|нач|продолж|разработ|настро|подключ|провед|собр|заплан|организ|выполн|узна|назнач|добав|удали|купи|закажи|оплати|прочита|изучи|повтори|поздрав)[а-я]*)\s+((?:[а-яa-z0-9_«»"'-]+\s*){0,7}[а-яa-z0-9_«»"'-]+)/i);
  if (m) {
    return capitalize(m[0].trim().slice(0, 120));
  }
  return capitalize(clause.split(/\s+/).slice(0, 8).join(' ').slice(0, 120));
}

function capitalize(s: string): string {
  const t = s.trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Остаток после первого предложения — кандидат в описание (без дат/времени). */
function extractDescription(rawText: string, titleUsed: string): string {
  const parts = rawText.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const rest = parts.slice(1).join('. ');
  // Убираем перечисления подзадач из описания
  const noLists = rest.replace(/(?:^|[.!?]\s*)(?:нужно|необходимо|надо)\s*:[^.!?]*[.!?]?/gi, ' ');
  let d = stripDateTimeProjectTags(norm(noLists));
  d = stripFiller(d);
  // Убираем маркеры перечислений
  d = d.replace(/(?:^|\s)(?:\d+[.)]|-|\*|сначала|потом|после этого|затем)\s+/gi, ' ');
  return capitalize(d.replace(/\s+/g, ' ').trim().slice(0, 2000));
}

/**
 * Пункты подзадач из явных перечислений:
 * "1. ... 2. ...", маркеры, "сначала..., потом...", "нужно: a, b и c".
 * Обычные предложения без маркеров НЕ делим (защита от бессмысленных сплитов).
 */
function extractSubtaskItems(rawText: string): string[] {
  const items: string[] = [];
  // Нумерованные / маркированные списки
  for (const line of rawText.split('\n')) {
    const m = line.trim().match(/^(?:\d+[.)\-:]|[-*•])\s*(.+)$/);
    if (m && m[1].trim().length > 1) items.push(m[1].trim());
  }
  if (items.length >= 2) return normalizeItems(items).slice(0, 20);
  // Явный список после "подзадачи: a, b, c"
  const inlineM = rawText.match(/подзадач[а-я]*\s*:\s*(.+)$/i);
  if (inlineM) {
    const parts = inlineM[1].split(/[,;\n]+/).map((s) => s.trim()).filter((s) => s.length > 1);
    if (parts.length >= 2) return normalizeItems(parts).slice(0, 20);
  }
  // Инлайн "1. xxx 2. yyy"
  const inlineNum = [...rawText.matchAll(/(?:^|[\s;])(\d+)\.\s*([^;.\n]{3,150}?)(?=\s*\d+\.|$)/g)].map((m) => m[2].trim());
  if (inlineNum.length >= 2) return normalizeItems(inlineNum).slice(0, 20);
  // Последовательности "сначала..., потом..., затем..."
  const seq = rawText.match(/сначала\s+([^.;\n]+?)(?:,?\s*(?:потом|после этого|затем|после|в конце)\s+([^.;\n]+))+[^.;\n]*/i);
  if (seq) {
    const parts = seq[0].split(/,?\s*(?:потом|после этого|затем|после|в конце)\s+/i).map((s) => s.replace(/^сначала\s+/i, '').trim()).filter((s) => s.length > 1);
    if (parts.length >= 2) return normalizeItems(parts).slice(0, 20);
  }
  // "Нужно/необходимо: a, b и c" — перечисление через запятые.
  // Чтобы не дробить обычные предложения (§8), требуем инфинитив в начале.
  const needM = rawText.match(/(?:нужно|необходимо|надо)\s+([^.!?\n]{5,400})/i);
  if (needM) {
    // Делим по запятым и по "и + инфинитив": "имя, возраст и назначить встречу".
    const parts = needM[1]
      .split(/[,;]|\s+и\s+(?=[а-я]+(?:ать|ять|еть|ить|ти|чь|сти|овать|евать)(?![а-я]))/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 1);
    const firstVerb = parts.length >= 2
      ? (parts[0].match(/^([а-я]+(?:ать|ять|еть|ить|ти|чь|сти|овать|евать))(?![а-я])/i) || [])[1]
      : null;
    if (firstVerb) {
      // Наследование глагола: "возраст" -> "Узнать возраст"
      const fixed = parts.map((p, i) => {
        if (i > 0 && !/^[а-я]+(?:ать|ять|еть|ить|ти|чь|сти|овать|евать)(?![а-я])/i.test(p)) {
          return `${firstVerb} ${p.charAt(0).toLowerCase() + p.slice(1)}`;
        }
        return p;
      });
      return normalizeItems(fixed).slice(0, 20);
    }
  }
  return [];
}

function normalizeItems(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    let t = raw.replace(/\s+/g, ' ').trim().replace(/[.!\s]+$/, '');
    if (t.length < 2 || t.length > 200) continue;
    // Глагол в начало: "его имя" после "узнать" уже обработано выше; чистим местоимения-хвосты
    t = capitalize(t);
    // Убираем вопросы-обрывки без смысла
    if (/^(как|сколько|что|где|когда|почему|зачем)\b/i.test(t) && t.length < 40) {
      // "как его зовут" -> "Узнать имя", "сколько ему лет" -> "Узнать возраст"
      t = humanizeQuestion(t);
    }
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function humanizeQuestion(q: string): string {
  const t = q.toLowerCase();
  if (/как.*зовут|имя/.test(t)) return 'Узнать имя';
  if (/сколько.*лет|возраст/.test(t)) return 'Узнать возраст';
  if (/встреч|созвон|позвон/.test(t)) return capitalize(t.replace(/\?/g, ''));
  return capitalize(q);
}

function detectPriority(text: string): 'HIGH' | 'MEDIUM' | 'LOW' | null {
  const t = norm(text);
  if (/высок|срочн|важн|критич/.test(t)) return 'HIGH';
  if (/средн/.test(t)) return 'MEDIUM';
  if (/низк/.test(t)) return 'LOW';
  return null;
}

function priorityRu(p: string): string {
  return p === 'HIGH' ? 'высокий' : p === 'MEDIUM' ? 'средний' : p === 'LOW' ? 'низкий' : 'обычный';
}

function taskLine(t: any): string {
  const box = t.status === 'COMPLETED' ? '✓' : t.status === 'IN_PROGRESS' ? '◷' : '○';
  return `${box} ${t.title} (${priorityRu(t.priority)}${t.due && t.dueLabel !== 'без срока' ? ` · ${t.dueLabel}` : ''})`;
}

/** Базовая чистка текста без LLM (честно помечается в ответе). */
function basicCleanup(s: string): string {
  let t = s.replace(/\s+/g, ' ').trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?…]$/.test(t)) t += '.';
  return t;
}

async function smartRewrite(kind: 'fix' | 'professional' | 'shorter' | 'longer' | 'clearer', text: string): Promise<{ result: string; viaLlm: boolean }> {
  if (isLlmConfigured()) {
    try {
      const prompts: Record<string, string> = {
        fix: 'Исправь орфографию и пунктуацию, сохрани смысл. Верни только исправленный текст.',
        professional: 'Перепиши деловым профессиональным стилем, сохрани смысл. Верни только текст.',
        shorter: 'Сократи, сохранив суть. Верни только текст.',
        longer: 'Расширь и детализируй, сохранив суть. Верни только текст.',
        clearer: 'Сделай понятнее и структурированнее. Верни только текст.',
      };
      const r = await chatText('Ты редактор. Отвечай только результатом, без комментариев.', `${prompts[kind]}\n\nТекст:\n${text.slice(0, 6000)}`, 800);
      if (r.trim()) return { result: r.trim(), viaLlm: true };
    } catch {
      // fallback ниже
    }
  }
  return { result: basicCleanup(text), viaLlm: false };
}

/** Разбить текст на пункты: нумерация, маркеры, предложения. */
export function splitToItems(text: string, maxN: number): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(?:\d+[.)\-:]|[-*•✓✔]|(?:шаг|этап)\s*\d+[.:]?)\s*(.+)$/i);
    if (m && m[1].length > 1) items.push(m[1].trim());
  }
  if (items.length === 0) {
    // Абзацы / предложения
    const parts = text.split(/(?:\n+|(?<=[.!?])\s+(?=[А-ЯA-Z]))/).map((s) => s.trim()).filter((s) => s.length > 2);
    for (const p of parts) items.push(p.replace(/\s+/g, ' ').slice(0, 200));
  }
  return items.slice(0, Math.max(1, Math.min(maxN, 20)));
}

function numWordsRu(n: number, one: string, few: string, many: string): string {
  const m = Math.abs(n) % 100;
  const d = m % 10;
  if (m > 10 && m < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}

export async function runRuleTurn(
  userId: string,
  rawText: string,
  context: AgentContext,
  now: Date = new Date(),
  history: { role: string; content: string }[] = []
): Promise<TurnResult> {
  const steps: TurnStep[] = [];
  const cards: any[] = [];
  const text = rawText.trim();
  const t = norm(text);
  const ctx = { tz: context.tz || 'UTC' };
  const fail = (reply: string): TurnResult => ({ reply, steps, cards });

  // 0. Выбор из кандидатов ("вторую", "последнюю", точное название)
  if (context.pendingChoice?.candidates?.length) {
    const cands = context.pendingChoice.candidates;
    const idx = parseOrdinal(text, cands.length);
    const byTitle = cands.find((c) => norm(c.title).includes(t) || t.includes(norm(c.title)));
    const picked = byTitle || (idx !== null ? cands[idx] : null);
    if (picked) {
      try {
        const r = await callTool(userId, 'get_task', { taskId: picked.id }, ctx, steps);
        const task = (r.data as any)?.task || r.data;
        cards.push({ type: 'task', task });
        return {
          reply: `Выбрал «${task.title}». Что с ней сделать?`,
          steps, cards,
          lastTaskId: task.id, lastTaskTitle: task.title,
        };
      } catch {
        return fail('Не смог открыть задачу. Попробуй ещё раз.');
      }
    }
    if (t.length < 60) {
      return {
        reply: 'Какую именно выбрать? Напиши номер или название.',
        steps, cards,
        options: cands.map((c, i) => ({ key: String(i), label: `${i + 1}. ${c.title}`, sub: c.sub })),
      };
    }
  }

  // 1. Создание задачи (но не заметки — их разбирает §11).
  // Сначала понимаем структуру, и только потом вызываем tools.
  if (!/заметк/.test(t) && (/^(создай|создать|добавь|добавить|новая задача|новую задачу|напомни|запланируй)(?![а-я])/.test(t) || (/задач[ау]\s+(на|с|к|о)(?![а-я])/.test(t) && /создай|добавь|нужна|нужно/.test(t)))) {
    const quotedTitle = extractQuoted(text);
    const dt = parseRuDateTime(text, ctx.tz, now);
    const priority = detectPriority(text);
    const projM = text.match(/в\s+проект[а-я]*\s+["«]?([^"»\n]{2,60})/i);
    let projectId: string | undefined;
    if (projM) {
      const pr = await callTool(userId, 'get_projects', {}, ctx, steps);
      const found = ((pr.data as any)?.projects || []).find((p: any) => norm(p.name).includes(norm(projM[1].trim())));
      if (!found) return fail(`Не нашёл проект «${projM[1].trim()}». Создать его? Напиши: «Создай проект ${projM[1].trim()}».`);
      projectId = found.id;
    }
    const tagM = [...text.matchAll(/с\s+тегом\s+([а-яa-z0-9_-]+)/gi)].map((m) => m[1]);

    // Название: quoted > умное извлечение действия. Сырой текст — никогда.
    const title = (quotedTitle || extractActionTitle(text)).slice(0, 200);
    if (!title || title.length < 2) {
      return fail('Как назвать задачу? Напиши, например: «Создай задачу Позвонить клиенту завтра в 15:00».');
    }
    // Время есть, а даты нет — уточняем, а не выдумываем.
    if (!dt && /(?:в|к|на)\s+\d{1,2}(?::\d{2})?/.test(t) && !/подзадач/.test(t)) {
      return fail(`Во сколько — понял, а на какой день поставить «${title}»? Напиши «сегодня» или «завтра».`);
    }
    // Описание — остаток смысла (без дат, которые уже в полях).
    const description = extractDescription(text, title);
    const created = await callTool(
      userId, 'create_task',
      {
        title,
        description: description || undefined,
        priority: priority || undefined,
        startDateISO: dt?.hasTime ? dt.iso : undefined,
        dueDateISO: dt?.endISO || dt?.iso,
        projectId,
        tagNames: tagM.length ? tagM : undefined,
      },
      ctx, steps
    );
    const task = (created.data as any)?.task;
    // Подзадачи прямо в запросе на создание ("...и сделай три подзадачи: ...").
    let madeSubs: string[] = [];
    if (task) {
      const inlineItems = extractSubtaskItems(text);
      if (inlineItems.length >= 2) {
        for (const st of inlineItems) {
          try {
            await callTool(userId, 'create_subtask', { parentId: task.id, title: st.slice(0, 200) }, ctx, steps);
            madeSubs.push(st);
          } catch { /* одна не создалась — остальные пробуем */ }
        }
        const full = await callTool(userId, 'get_task', { taskId: task.id }, ctx, steps).catch(() => null);
        const fresh = (full?.data as any) || task;
        cards.push({ type: 'task', task: fresh });
      } else if (task) {
        cards.push({ type: 'task', task });
      }
    }
    let when = '';
    if (dt) {
      const timeOf = (iso: string) => formatInTz(iso, ctx.tz).split(',')[1]?.trim() || '';
      when = dt.endISO
        ? ` на ${formatInTz(dt.iso, ctx.tz).split(',')[0]}, ${timeOf(dt.iso)} — ${timeOf(dt.endISO)}`
        : dt.hasTime
          ? ` на ${formatInTz(dt.iso, ctx.tz)}`
          : `, ${dt.label}`;
    }
    let reply = `Готово. Создал задачу «${title}»${when}${priority ? `, приоритет ${priorityRu(priority)}` : ''}.`;
    if (madeSubs.length) {
      reply += `\n\nПодзадачи (${madeSubs.length}):\n${madeSubs.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    }
    return {
      reply, steps, cards, lastTaskId: task?.id, lastTaskTitle: task?.title,
    };
  }

  // 2. Создание проекта
  if (/создай\s+проект/i.test(t)) {
    const name = extractQuoted(text) || stripVerbs(text).replace(/проект/i, '').trim();
    if (!name) return fail('Как назвать проект?');
    const r = await callTool(userId, 'create_project', { name: name.slice(0, 200) }, ctx, steps);
    return { reply: `Проект «${(r.data as any)?.project?.name}» создан.`, steps, cards };
  }

  // 3. Списки: сегодня / завтра / неделя / просроченные / завершённые / в работе / без срока / высокий приоритет
  if (/что\s+осталось|осталось\s+на\s+сегодня|что\s+на\s+сегодня|мои\s+задачи\s+на\s+сегодня|задачи\s+на\s+сегодня/.test(t)) {
    const r = await callTool(userId, 'today_tasks', {}, ctx, steps);
    const list = (r.data as any)?.tasks || [];
    if (!list.length) return { reply: 'На сегодня задач нет. Отдыхай или создай новую — просто напиши.', steps, cards };
    cards.push({ type: 'tasklist', title: 'Сегодня', tasks: list.slice(0, 10) });
    return { reply: `На сегодня ${list.length} ${numWordsRu(list.length, 'задача', 'задачи', 'задач')}:\n${list.slice(0, 10).map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
  }
  // Массовые операции с просроченными обрабатываются ниже (§просроченные),
  // поэтому списки их пропускают при глаголах действия.
  const massOverdue = /просрочен/.test(t) && /перенес|перенести|заверши|поставь|измени/.test(t);
  if (/завтра/.test(t) && /что|какие|покажи|список|осталось|задачи/.test(t) && !massOverdue) {
    const r = await callTool(userId, 'tomorrow_tasks', {}, ctx, steps);
    const list = (r.data as any)?.tasks || [];
    if (!list.length) return { reply: 'На завтра ничего не запланировано.', steps, cards };
    cards.push({ type: 'tasklist', title: 'Завтра', tasks: list.slice(0, 10) });
    return { reply: `На завтра:\n${list.slice(0, 10).map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
  }
  if (/недел|понедельник|календар/.test(t) && /что|какие|покажи|запланировано|план/.test(t)) {
    const r = await callTool(userId, 'week_tasks', {}, ctx, steps);
    const list = (r.data as any)?.tasks || [];
    if (!list.length) return { reply: 'На неделю ничего не запланировано.', steps, cards };
    cards.push({ type: 'tasklist', title: 'Неделя', tasks: list.slice(0, 10) });
    return { reply: `На неделю:\n${list.slice(0, 10).map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
  }
  if (/просрочен/.test(t)) {
    if (/покажи|какие|список|что/.test(t) && !/перенеси|перенести/.test(t)) {
      const r = await callTool(userId, 'overdue_tasks', {}, ctx, steps);
      const list = (r.data as any)?.tasks || [];
      if (!list.length) return { reply: 'Просроченных задач нет. Так держать!', steps, cards };
      cards.push({ type: 'tasklist', title: 'Просроченные', tasks: list.slice(0, 10) });
      return { reply: `Просрочено ${list.length}:\n${list.slice(0, 10).map((x: any) => `• ${taskLine(x)}`).join('\n')}\n\nМогу перенести всё на завтра — напиши «перенеси все просроченные на завтра».`, steps, cards };
    }
    // массовый перенос — через подтверждение
    const dt = parseRuDateTime(text, ctx.tz, now) || { iso: undefined as string | undefined };
    const r = await callTool(userId, 'overdue_tasks', {}, ctx, steps);
    const list = (r.data as any)?.tasks || [];
    if (!list.length) return { reply: 'Просроченных задач нет — переносить нечего.', steps, cards };
    const targetISO = dt.iso || zonedTomorrowNoon(ctx.tz, now);
    return {
      reply: `Нашёл ${list.length} ${numWordsRu(list.length, 'просроченную задачу', 'просроченные задачи', 'просроченных задач')}. Перенести все${dt.iso ? ` на ${formatInTz(dt.iso, ctx.tz)}` : ' на завтра'}?`,
      steps, cards,
      confirm: {
        token: '',
        kind: 'mass',
        summary: `Перенос ${list.length} задач`,
      },
      pendingOps: list.map((x: any) => ({ tool: 'update_task', args: { taskId: x.id, dueDateISO: targetISO } })),
    };
  }
  // "готов" не должен матчить "подготовить": только отдельные слова
  if (/(завершен|выполнен|сделан|готов)(?![а-я])/.test(t) && /покажи|какие|список|что/.test(t) && !/заметк|подзадач/.test(t)) {
    const r = await callTool(userId, 'search_tasks', { status: 'COMPLETED', limit: 10 }, ctx, steps);
    const list = (r.data as any)?.tasks || [];
    if (!list.length) return { reply: 'Завершённых задач пока нет.', steps, cards };
    return { reply: `Завершённые:\n${list.map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
  }
  if (/в\s+работе/.test(t) && /покажи|какие|что|список/.test(t)) {
    const r = await callTool(userId, 'search_tasks', { status: 'IN_PROGRESS', limit: 10 }, ctx, steps);
    const list = (r.data as any)?.tasks || [];
    if (!list.length) return { reply: 'Нет задач в работе.', steps, cards };
    return { reply: `В работе:\n${list.map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
  }
  if (/без\s+(срока|дедлайна|даты)/.test(t)) {
    const r = await callTool(userId, 'search_tasks', { noDueDate: true, limit: 10 }, ctx, steps);
    const list = (r.data as any)?.tasks || [];
    if (!list.length) return { reply: 'Все задачи имеют срок.', steps, cards };
    return { reply: `Без срока:\n${list.map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
  }
  if (/высок.*приоритет/.test(t) && /покажи|какие|найди|список/.test(t)) {
    const r = await callTool(userId, 'search_tasks', { priority: 'HIGH', limit: 10 }, ctx, steps);
    const list = (r.data as any)?.tasks || [];
    if (!list.length) return { reply: 'Задач с высоким приоритетом нет.', steps, cards };
    return { reply: `Высокий приоритет:\n${list.map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
  }

  // 4. Проекты: список / задачи проекта
  if (/какие.*проекты|список\s+проектов|мои\s+проекты|покажи\s+проекты/.test(t)) {
    const r = await callTool(userId, 'get_projects', {}, ctx, steps);
    const list = (r.data as any)?.projects || [];
    if (!list.length) return { reply: 'Проектов пока нет. Создать? Напиши: «Создай проект Название».', steps, cards };
    return { reply: `Проекты:\n${list.map((p: any) => `• ${p.name} — открыто задач: ${p.openTasks}`).join('\n')}`, steps, cards };
  }
  {
    const pm = text.match(/задач[аи]?\s+проекта\s+["«]?([^"»\n?]{2,60})/i) || text.match(/проект[ае]?\s+["«]?([^"»\n?]{2,60})\s+(?:ещ[её]|не\s+заверш|открыт|покажи)/i);
    if (pm || (/проекта\s+\S/.test(t) && /покажи|какие|не\s+заверш|открыт/.test(t))) {
      const name = (pm?.[1] || extractQuoted(text) || '').trim();
      const pr = await callTool(userId, 'get_projects', {}, ctx, steps);
      const found = ((pr.data as any)?.projects || []).find((p: any) => (name ? norm(p.name).includes(norm(name)) : false));
      if (!found) {
        if (name) return fail(`Не нашёл проект «${name}».`);
      } else {
        const r = await callTool(userId, 'tasks_by_project', { projectId: found.id }, ctx, steps);
        const list = (r.data as any)?.tasks || [];
        if (!list.length) return { reply: `В проекте «${found.name}» незавершённых задач нет.`, steps, cards };
        cards.push({ type: 'tasklist', title: found.name, tasks: list.slice(0, 10) });
        return { reply: `«${found.name}» — не завершено: ${list.length}\n${list.slice(0, 10).map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
      }
    }
  }

  // 5. Теги: список / поиск по тегу
  if (/с\s+тегом\s+([а-яa-z0-9_-]+)/i.test(t) && /найди|покажи|какие|задачи/.test(t)) {
    const tagName = text.match(/с\s+тегом\s+([а-яa-z0-9_-]+)/i)![1];
    const r = await callTool(userId, 'tasks_by_tag', { tagName }, ctx, steps);
    const list = (r.data as any)?.tasks || [];
    if (!list.length) return { reply: `С тегом «${tagName}» задач нет.`, steps, cards };
    return { reply: `С тегом «${tagName}»:\n${list.slice(0, 10).map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
  }

  // 6. Поиск задачи (заметки — в §11).
  // Чужие данные ("пользователя B") — явный отказ, не поиск.
  if (/пользовател[яь]\s+[a-zа-я]/i.test(t) && /покажи|найди|задачи/.test(t)) {
    return {
      reply: 'Нет доступа к чужим данным. Могу показать только твои задачи — например: «Что осталось на сегодня?»',
      steps, cards,
    };
  }
  if (/^(найди|найти|покажи|ищи|где)(?![а-я])/.test(t) && !/заметк/.test(t)) {
    const resolved = await resolveTask(userId, text, context, steps);
    if (!resolved) return fail(`Не нашёл задачу «${stripVerbs(text).slice(0, 80)}». Уточни название.`);
    if ('candidates' in resolved) {
      return {
        reply: `Нашёл несколько. Какую выбрать?`,
        steps, cards,
        options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })),
      };
    }
    const full = await callTool(userId, 'get_task', { taskId: resolved.task.id }, ctx, steps);
    const task = (full.data as any);
    cards.push({ type: 'task', task: task });
    return {
      reply: `Нашёл задачу «${task.title}».`,
      steps, cards, lastTaskId: task.id, lastTaskTitle: task.title,
    };
  }

  // 7. Завершить (подзадачи — в §10)
  if (/заверши|выполни|готово|сделано|отметь\s+выполненной|закрыть\s+задачу/.test(t) && !/подзадач/.test(t)) {
    const resolved = await resolveTask(userId, text, context, steps);
    if (!resolved) return fail('Какую задачу завершить? Напиши название.');
    if ('candidates' in resolved) {
      return { reply: 'Какую именно завершить?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) };
    }
    await callTool(userId, 'complete_task', { taskId: resolved.task.id }, ctx, steps);
    return { reply: `Готово — «${resolved.task.title}» завершена.`, steps, cards, lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title };
  }

  // 8. Удалить задачу (confirm; подзадачи/заметки — в своих ветках)
  if (/удали|удалить|сотри/.test(t) && !/подзадач/.test(t) && !/заметк/.test(t)) {
    const resolved = await resolveTask(userId, text, context, steps);
    if (!resolved) return fail('Какую задачу удалить? Напиши название.');
    if ('candidates' in resolved) {
      return { reply: 'Какую именно удалить?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) };
    }
    return {
      reply: `Нашёл задачу «${resolved.task.title}». Удалить её?`,
      steps, cards,
      confirm: { token: '', kind: 'delete', summary: `Удаление «${resolved.task.title}»` },
      pendingOps: [{ tool: 'delete_task', args: { taskId: resolved.task.id } }],
      lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title,
    };
  }

  // 9. Перенос срока / время / приоритет / проект / теги / название / описание
  const hasTarget = /(ее|его|ею|ей|ему|им|ней|эту|этот|этой|задач[ауе]|^перенеси|^поставь|^измени|^сделай|^поменяй)/.test(t);
  if (/перенес|перенести|поставь\s+срок|срок\s+на|измени\s+время|время\s+на|дедлайн/.test(t) || (/на\s+(завтра|сегодня|понедельник|следующей)/.test(t) && hasTarget)) {
    const resolved = await resolveTask(userId, text, context, steps);
    if (!resolved) return fail('Какую задачу перенести? Напиши название.');
    if ('candidates' in resolved) {
      return { reply: 'Какую именно перенести?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) };
    }
    const dt = parseRuDateTime(text, ctx.tz, now);
    if (!dt) return fail('На когда перенести? Например: «на завтра в 16:00».');
    // TEST 3: дата без времени — сохраняем исходное время задачи, а не 12:00.
    let dueISO = dt.iso;
    let startISO: string | undefined;
    if (dt.endISO) {
      startISO = dt.iso;
      dueISO = dt.endISO;
    } else if (!dt.hasTime) {
      const full = await callTool(userId, 'get_task', { taskId: resolved.task.id }, ctx, steps).catch(() => null);
      const cur = (full?.data as any) || {};
      if (cur.due) {
        const oldT = new Date(cur.due);
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: ctx.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(oldT);
        const [hh, mm] = parts.split(':').map(Number);
        const day = dt.iso.slice(0, 10);
        // Собираем wall-time старой задачи на новой дате в timezone пользователя
        const [Y, M, D] = day.split('-').map(Number);
        dueISO = zonedToISO(ctx.tz, Y, M, D, hh, mm);
      }
      if (cur.start) {
        const day = dueISO.slice(0, 10);
        const ot = new Date(cur.start);
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: ctx.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(ot);
        const [hh, mm] = parts.split(':').map(Number);
        const [Y, M, D] = day.split('-').map(Number);
        startISO = zonedToISO(ctx.tz, Y, M, D, hh, mm);
      }
    }
    const upd = await callTool(userId, 'update_task', { taskId: resolved.task.id, dueDateISO: dueISO, startDateISO: startISO }, ctx, steps);
    const task = (upd.data as any)?.task;
    if (task) cards.push({ type: 'task', task });
    return {
      reply: `Готово — «${resolved.task.title}» перенесена на ${formatInTz(dueISO, ctx.tz)}.`,
      steps, cards, lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title,
    };
  }
  // TEST 4/5: только начало или только конец — остальные поля не трогаем.
  {
    const startM = text.match(/(?:поставь|сделай|измени|поменяй)\s+(начало|старт)\s+(?:в\s+)?(\d{1,2})(?::(\d{2}))?/i);
    const endM = text.match(/(?:поставь|сделай|измени|поменяй)\s+(конец|окончание|финиш)\s+(?:в\s+|на\s+)?(\d{1,2})(?::(\d{2}))?/i);
    if ((startM || endM) && (hasTarget || context.lastTaskId)) {
      let resolved = await resolveTask(userId, text, context, steps);
      if (!resolved && context.lastTaskId) {
        try {
          const gr = await callTool(userId, 'get_task', { taskId: context.lastTaskId }, ctx, steps);
          resolved = { task: (gr.data as any)?.task || gr.data };
        } catch { /* ниже */ }
      }
      if (!resolved || 'candidates' in resolved) {
        return resolved && 'candidates' in resolved
          ? { reply: 'Какую именно?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
          : fail('Какую задачу изменить? Напиши название.');
      }
      const full = await callTool(userId, 'get_task', { taskId: resolved.task.id }, ctx, steps).catch(() => null);
      const cur = (full?.data as any) || {};
      // База: текущий день задачи (или сегодня), время из команды
      const baseISO = cur.start || cur.due || new Date().toISOString();
      const baseDay = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(baseISO)).split('-').map(Number);
      const patch: any = { taskId: resolved.task.id };
      let what = '';
      if (startM) {
        patch.startDateISO = zonedToISO(ctx.tz, baseDay[0], baseDay[1], baseDay[2], Number(startM[2]), Number(startM[3] || 0));
        what = `начало в ${startM[2]}:${String(startM[3] || '00').padStart(2, '0')}`;
      }
      if (endM) {
        patch.dueDateISO = zonedToISO(ctx.tz, baseDay[0], baseDay[1], baseDay[2], Number(endM[2]), Number(endM[3] || 0));
        what = what ? `${what}, конец в ${endM[2]}:${String(endM[3] || '00').padStart(2, '0')}` : `конец в ${endM[2]}:${String(endM[3] || '00').padStart(2, '0')}`;
      }
      await callTool(userId, 'update_task', patch, ctx, steps);
      return { reply: `Готово — «${resolved.task.title}»: ${what}. Остальное не трогал.`, steps, cards, lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title };
    }
  }
  // Массовый приоритет: "поставь всем задачам проекта X высокий приоритет" (confirm)
  {
    const massP = t.match(/всем\s+задачам\s+проекта\s+["«]?([^"»\n?]{2,60})/);
    if (massP) {
      const pr = await callTool(userId, 'get_projects', {}, ctx, steps);
      const found = ((pr.data as any)?.projects || []).find((p: any) => norm(p.name).includes(norm(massP[1].trim())));
      if (!found) return fail(`Не нашёл проект «${massP[1].trim()}».`);
      const lr = await callTool(userId, 'tasks_by_project', { projectId: found.id }, ctx, steps);
      const list = (lr.data as any)?.tasks || [];
      if (!list.length) return fail(`В проекте «${found.name}» нет открытых задач.`);
      const p = detectPriority(text) || 'HIGH';
      return {
        reply: `В проекте «${found.name}» открытых задач: ${list.length}. Поставить всем приоритет «${priorityRu(p)}»?`,
        steps, cards,
        confirm: { token: '', kind: 'mass', summary: `Приоритет ${priorityRu(p)} для ${list.length} задач` },
        pendingOps: list.map((x: any) => ({ tool: 'update_task', args: { taskId: x.id, priority: p } })),
      };
    }
  }
  if (/приоритет/.test(t) && hasTarget) {
    const resolved = await resolveTask(userId, text, context, steps);
    if (!resolved || 'candidates' in resolved) {
      return resolved && 'candidates' in resolved
        ? { reply: 'Какой именно?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
        : fail('Какой задаче поставить приоритет?');
    }
    const p = detectPriority(text) || 'HIGH';
    await callTool(userId, 'update_task', { taskId: resolved.task.id, priority: p }, ctx, steps);
    return { reply: `Готово — «${resolved.task.title}», приоритет: ${priorityRu(p)}.`, steps, cards, lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title };
  }
  {
    const mv = text.match(/в\s+проект\w*\s+["«]?([^"»\n?]{2,60})/i);
    if ((/перемести|перенеси\s+в\s+проект|в\s+проект/.test(t)) && hasTarget) {
      const resolved = await resolveTask(userId, text, context, steps);
      if (!resolved || 'candidates' in resolved) {
        return resolved && 'candidates' in resolved
          ? { reply: 'Какую именно?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
          : fail('Какую задачу переместить?');
      }
      const name = (mv?.[1] || '').trim();
      const pr = await callTool(userId, 'get_projects', {}, ctx, steps);
      const found = ((pr.data as any)?.projects || []).find((p: any) => norm(p.name).includes(norm(name)));
      if (!found) return fail(`Не нашёл проект «${name}».`);
      await callTool(userId, 'update_task', { taskId: resolved.task.id, projectId: found.id }, ctx, steps);
      return { reply: `Готово — «${resolved.task.title}» теперь в проекте «${found.name}».`, steps, cards, lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title };
    }
  }
  {
    const tagAdd = text.match(/(?:добавь|добавить)\s+тег\w*\s+([а-яa-z0-9_-]+)/i);
    const tagDel = text.match(/(?:удали|убери|удалить|убрать)\s+тег\w*\s+([а-яa-z0-9_-]+)/i);
    if ((tagAdd || tagDel) && hasTarget) {
      const resolved = await resolveTask(userId, text, context, steps);
      if (!resolved || 'candidates' in resolved) {
        return resolved && 'candidates' in resolved
          ? { reply: 'Какой именно?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
          : fail('Какой задаче изменить теги?');
      }
      if (tagAdd) {
        await callTool(userId, 'attach_tag', { taskId: resolved.task.id, tagName: tagAdd[1] }, ctx, steps);
        return { reply: `Тег «${tagAdd[1]}» добавлен к «${resolved.task.title}».`, steps, cards, lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title };
      }
      await callTool(userId, 'detach_tag', { taskId: resolved.task.id, tagName: tagDel![1] }, ctx, steps);
      return { reply: `Тег «${tagDel![1]}» убран с «${resolved.task.title}».`, steps, cards, lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title };
    }
  }
  if (/переименуй|назови|поменяй\s+название|сделай\s+название|нормальное\s+название/.test(t) && hasTarget) {
    const resolved = await resolveTask(userId, text, context, steps);
    if (!resolved || 'candidates' in resolved) {
      return resolved && 'candidates' in resolved
        ? { reply: 'Какую именно?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
        : fail('Какую задачу переименовать?');
    }
    // "переименуй её в X" — X и есть новое название
    const renameIn = text.match(/(?:переименуй|назови|поменяй\s+название|сделай\s+название)\s+(?:е[её]\s+)?в\s+(.+)$/i);
    const quoted = extractQuoted(text);
    let newTitle = (renameIn?.[1] || quoted || '').trim();
    if (!newTitle) {
      // "сделай название профессиональнее" — генерируем из старого
      const { result, viaLlm } = await smartRewrite('professional', resolved.task.title);
      newTitle = result;
      void viaLlm;
    }
    await callTool(userId, 'update_task', { taskId: resolved.task.id, title: newTitle.slice(0, 200) }, ctx, steps);
    return { reply: `Готово — новое название: «${newTitle.slice(0, 200)}».`, steps, cards, lastTaskId: resolved.task.id, lastTaskTitle: newTitle.slice(0, 200) };
  }
  // Ветка подзадач (§10) имеет приоритет: "сделай из этапов подзадачи" — не описание
  if (/описани/.test(t) && hasTarget && !/подзадач/.test(t)) {
    const resolved = await resolveTask(userId, text, context, steps);
    if (!resolved || 'candidates' in resolved) {
      return resolved && 'candidates' in resolved
        ? { reply: 'Чьё описание изменить?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
        : fail('Чьё описание изменить? Напиши название задачи.');
    }
    const full = await callTool(userId, 'get_task', { taskId: resolved.task.id }, ctx, steps);
    const current = ((full.data as any)?.description || '') as string;
    if (!current) return fail(`У задачи «${resolved.task.title}» пока нет описания. Напиши, что добавить.`);
    let kind: 'fix' | 'professional' | 'shorter' | 'longer' | 'clearer' = 'fix';
    if (/профессиональн|делов/.test(t)) kind = 'professional';
    else if (/короче|сократи/.test(t)) kind = 'shorter';
    else if (/длиннее|расширь|подробнее/.test(t)) kind = 'longer';
    else if (/понятн|структур/.test(t)) kind = 'clearer';
    const { result } = await smartRewrite(kind, current);
    await callTool(userId, 'update_task', { taskId: resolved.task.id, description: result.slice(0, 10000) }, ctx, steps);
    return { reply: `Готово, описание обновлено:\n\n${result.slice(0, 1500)}`, steps, cards, lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title };
  }

  // 10. Подзадачи
  {
    // "разбей на 5", "сделай подзадачи", "из этапов сделай подзадачи"
    const splitM = t.match(/разбей|раздели|подели|разбить/) || (/подзадач/.test(t) && /сделай|создай|из\s+этапов|этапы/.test(t) ? ['сделай'] : null);
    const countM = text.match(/на\s+(\d+)\s+подзадач/i);
    if (splitM && (hasTarget || context.lastTaskId)) {
      let resolved = await resolveTask(userId, text, context, steps);
      if (!resolved && context.lastTaskId) {
        try {
          const r = await callTool(userId, 'get_task', { taskId: context.lastTaskId }, ctx, steps);
          resolved = { task: (r.data as any)?.task || r.data };
        } catch { /* ниже */ }
      }
      if (!resolved || 'candidates' in resolved) {
        return resolved && 'candidates' in resolved
          ? { reply: 'Какую именно разбить?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
          : fail('Какую задачу разбить на подзадачи?');
      }
      const full = await callTool(userId, 'get_task', { taskId: resolved.task.id }, ctx, steps);
      const noteR = await callTool(userId, 'get_note', { taskId: resolved.task.id }, ctx, steps);
      const noteText = ((noteR.data as any)?.note?.content || '') as string;
      const source = [((full.data as any)?.description || ''), noteText].filter(Boolean).join('\n');
      // Явный список в сообщении: "разбей на подзадачи: A, B, C"
      const inlineM = text.match(/подзадач[а-я]*\s*:\s*(.+)$/i);
      let items = inlineM
        ? inlineM[1].split(/[,;\n]+/).map((s) => s.trim()).filter((s) => s.length > 1)
        : splitToItems(source, countM ? Number(countM[1]) : 5);
      if (countM) items = items.slice(0, Number(countM[1]));
      if (!items.length) {
        // Структура не найдена — делим умным способом
        if (isLlmConfigured()) {
          try {
            const r = await chatText(
              'Разбей задачу на конкретные короткие шаги. Верни только строки через перенос, без нумерации.',
              `Задача: ${resolved.task.title}\nОписание: ${((full.data as any)?.description || '').slice(0, 2000)}\nНужно шагов: ${countM ? countM[1] : 5}`
            );
            items = splitToItems(r, countM ? Number(countM[1]) : 5);
          } catch { /* fallback ниже */ }
        }
        if (!items.length) items = ['Подготовка', 'Основная работа', 'Проверка результата'].slice(0, countM ? Number(countM[1]) : 3);
      }
      const created: string[] = [];
      for (const title of items) {
        const r = await callTool(userId, 'create_subtask', { parentId: resolved.task.id, title }, ctx, steps);
        created.push(((r.data as any)?.subtask?.title || title) as string);
      }
      return {
        reply: `Готово, создано ${created.length} ${numWordsRu(created.length, 'подзадача', 'подзадачи', 'подзадач')}:\n${created.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
        steps, cards,
        lastTaskId: resolved.task.id, lastTaskTitle: resolved.task.title,
      };
    }
  }
  if (/подзадач/.test(t) && /какие|покажи|список|осталось|остались/.test(t)) {
    const resolved = await resolveTask(userId, text, context, steps);
    const target = resolved && !('candidates' in resolved) ? resolved.task : (context.lastTaskId ? { id: context.lastTaskId, title: context.lastTaskTitle || '' } : null);
    if (!target?.id) return fail('Чьи подзадачи показать? Напиши название задачи.');
    const r = await callTool(userId, 'get_subtasks', { taskId: target.id }, ctx, steps);
    const list = (r.data as any)?.subtasks || [];
    if (!list.length) return { reply: 'Подзадач пока нет.', steps, cards };
    const left = list.filter((s: any) => s.status !== 'COMPLETED');
    return {
      reply: `Подзадачи (${left.length} осталось из ${list.length}):\n${list.map((s: any, i: number) => `${i + 1}. ${s.status === 'COMPLETED' ? '✓' : '○'} ${s.title}`).join('\n')}`,
      steps, cards, lastTaskId: target.id, lastTaskTitle: target.title,
    };
  }
  {
    const subVerb = /подзадач/.test(t) && (/заверши|выполни|переименуй|удали|создай|добавь/.test(t));
    if (subVerb && hasTarget) {
      let resolved = await resolveTask(userId, text, context, steps);
      if (!resolved && context.lastTaskId) {
        try {
          const gr = await callTool(userId, 'get_task', { taskId: context.lastTaskId }, ctx, steps);
          resolved = { task: (gr.data as any)?.task || gr.data };
        } catch { /* ниже */ }
      }
      const target = resolved && !('candidates' in resolved) ? resolved.task : null;
      if (!target) {
        return resolved && 'candidates' in resolved
          ? { reply: 'Какой именно?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
          : fail('Для какой задачи? Напиши название.');
      }
      const r = await callTool(userId, 'get_subtasks', { taskId: target.id }, ctx, steps);
      const list = (r.data as any)?.subtasks || [];
      if (/создай|добавь/.test(t)) {
        const title = extractQuoted(text) || stripVerbs(text).replace(/подзадач\w*/gi, '').trim();
        if (!title) return fail('Как назвать подзадачу?');
        await callTool(userId, 'create_subtask', { parentId: target.id, title: title.slice(0, 200) }, ctx, steps);
        return { reply: `Подзадача «${title.slice(0, 200)}» создана.`, steps, cards, lastTaskId: target.id, lastTaskTitle: target.title };
      }
      if (!list.length) return fail('У задачи нет подзадач.');
      const idx = parseOrdinal(text, list.length);
      if (idx === null) {
        return {
          reply: `Какую именно? Всего: ${list.length}\n${list.map((s: any, i: number) => `${i + 1}. ${s.title}`).join('\n')}`,
          steps, cards, lastTaskId: target.id, lastTaskTitle: target.title,
        };
      }
      const sub = list[idx];
      if (/заверши|выполни/.test(t)) {
        await callTool(userId, 'complete_subtask', { subtaskId: sub.id }, ctx, steps);
        return { reply: `«${sub.title}» завершена.`, steps, cards, lastTaskId: target.id, lastTaskTitle: target.title };
      }
      if (/переименуй/.test(t)) {
        const nt = extractQuoted(text);
        if (!nt) return fail('В какое название переименовать? Напиши в кавычках.');
        await callTool(userId, 'update_subtask', { subtaskId: sub.id, title: nt }, ctx, steps);
        return { reply: `Переименована в «${nt}».`, steps, cards, lastTaskId: target.id, lastTaskTitle: target.title };
      }
      if (/удали/.test(t)) {
        return {
          reply: `Удалить подзадачу «${sub.title}»?`,
          steps, cards,
          confirm: { token: '', kind: 'delete', summary: `Удаление подзадачи «${sub.title}»` },
          pendingOps: [{ tool: 'delete_subtask', args: { subtaskId: sub.id } }],
          lastTaskId: target.id, lastTaskTitle: target.title,
        };
      }
    }
  }

  // 11. Заметки
  if (/заметк/.test(t)) {
    let resolved = await resolveTask(userId, text, context, steps);
    if (!resolved && context.lastTaskId) {
      try {
        const gr = await callTool(userId, 'get_task', { taskId: context.lastTaskId }, ctx, steps);
        resolved = { task: (gr.data as any)?.task || gr.data };
      } catch { /* ниже */ }
    }
    const target = resolved && !('candidates' in resolved) ? resolved.task : null;
    if (!target) {
      return resolved && 'candidates' in resolved
        ? { reply: 'Заметку какой задачи?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
        : fail('Заметку какой задачи? Напиши название.');
    }
    if (/покажи|прочитай|прочти|что\s+в|открой/.test(t)) {
      const r = await callTool(userId, 'get_note', { taskId: target.id }, ctx, steps);
      const content = (r.data as any)?.note?.content;
      if (!content) return { reply: `У «${target.title}» заметки пока нет.`, steps, cards, lastTaskId: target.id, lastTaskTitle: target.title };
      return { reply: `Заметка «${target.title}»:\n\n${content.slice(0, 3000)}`, steps, cards, lastTaskId: target.id, lastTaskTitle: target.title };
    }
    if (/удали|очисти|удалить/.test(t)) {
      return {
        reply: `Удалить заметку задачи «${target.title}»? Сама задача останется.`,
        steps, cards,
        confirm: { token: '', kind: 'delete', summary: `Удаление заметки «${target.title}»` },
        pendingOps: [{ tool: 'delete_note', args: { taskId: target.id } }],
        lastTaskId: target.id, lastTaskTitle: target.title,
      };
    }
    const addM = text.match(/(?:добавь|допиши|в\s+конец)[^:]*:\s*(.+)$/i) || text.match(/добавь\s+в\s+заметку[^,]*,?\s*(что\s+)?(.+)/i);
    const addText = addM ? (addM[2] || addM[1] || '').trim() : '';
    if (/добавь|допиши|в\s+конец/.test(t) && addText.length > 1) {
      await callTool(userId, 'append_note', { taskId: target.id, text: addText.slice(0, 5000) }, ctx, steps);
      return { reply: 'Добавил в заметку.', steps, cards, lastTaskId: target.id, lastTaskTitle: target.title };
    }
    if (/замени|перезапиши|обнови|исправь/.test(t)) {
      const quoted = extractQuoted(text);
      const afterColon = (text.match(/:\s*(.+)$/) || [])[1];
      const newText = (quoted || afterColon || '').trim();
      if (!newText) return fail('Какой текст записать в заметку? Напиши после двоеточия.');
      const ex = await callTool(userId, 'get_note', { taskId: target.id }, ctx, steps);
      if ((ex.data as any)?.note) {
        await callTool(userId, 'update_note', { taskId: target.id, content: newText.slice(0, 20000) }, ctx, steps);
      } else {
        await callTool(userId, 'create_note', { taskId: target.id, content: newText.slice(0, 20000) }, ctx, steps);
      }
      return { reply: 'Заметка обновлена.', steps, cards, lastTaskId: target.id, lastTaskTitle: target.title };
    }
    return fail('Что сделать с заметкой? Например: «покажи», «добавь: текст», «замени: текст», «удали».');
  }

  // Анализ задачи (§27) и умное улучшение (§28)
  if (/посмотри|проанализируй|что.*не хватает|чего.*не хватает|разбери\s+задачу/.test(t) && hasTarget) {
    const resolved = await resolveTask(userId, text, context, steps);
    if (!resolved || 'candidates' in resolved) {
      return resolved && 'candidates' in resolved
        ? { reply: 'Какую именно?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
        : fail('Какую задачу проанализировать?');
    }
    const full = await callTool(userId, 'get_task', { taskId: resolved.task.id }, ctx, steps);
    const fd = (full.data as any) || {};
    const gaps: string[] = [];
    if (!fd.due && !fd.start) gaps.push('нет срока');
    if (!fd.description) gaps.push('нет описания');
    if (!(fd.subtasksTotal > 0)) {
      const stages = splitToItems(fd.description || '', 6);
      gaps.push(stages.length >= 2 ? `можно разделить на ${stages.length} этапов: ${stages.slice(0, 4).join('; ')}` : 'нет подзадач');
    } else {
      gaps.push(`подзадач: ${fd.subtasksTotal}`);
    }
    if (!fd.project) gaps.push('без проекта');
    if (fd.priority === 'NONE') gaps.push('без приоритета');
    cards.push({ type: 'task', task: fd });
    return {
      reply: `Посмотрел «${fd.title}»:\n${gaps.map((g) => `• ${g}`).join('\n')}`,
      steps, cards, lastTaskId: fd.id, lastTaskTitle: fd.title,
    };
  }
  if (/сделай.*нормально|улучши|улучшить\s+задачу|доведи\s+до\s+ума/.test(t) && hasTarget) {
    const resolved = await resolveTask(userId, text, context, steps);
    if (!resolved || 'candidates' in resolved) {
      return resolved && 'candidates' in resolved
        ? { reply: 'Какую именно?', steps, cards, options: resolved.candidates.map((c, i) => ({ key: c.id, label: `${i + 1}. ${c.title}`, sub: c.sub })) }
        : fail('Какую задачу улучшить?');
    }
    const full = await callTool(userId, 'get_task', { taskId: resolved.task.id }, ctx, steps);
    const fd = (full.data as any) || {};
    const { result: newTitle } = await smartRewrite('professional', fd.title || '');
    const stages = splitToItems(fd.description || '', 5);
    const ops: { tool: string; args: any }[] = [];
    if (newTitle && newTitle !== fd.title) ops.push({ tool: 'update_task', args: { taskId: fd.id, title: newTitle.slice(0, 200) } });
    const subsRes = await callTool(userId, 'get_subtasks', { taskId: fd.id }, ctx, steps).catch(() => null);
    const existingSubs = ((subsRes?.data as any)?.subtasks?.length || 0) as number;
    let subNote = '';
    if (!existingSubs && stages.length >= 2) {
      for (const s of stages.slice(0, 5)) ops.push({ tool: 'create_subtask', args: { parentId: fd.id, title: s.slice(0, 200) } });
      subNote = `\nПодзадачи (${Math.min(stages.length, 5)}):\n${stages.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    }
    if (!ops.length) return { reply: 'Задача уже в хорошем состоянии — менять нечего.', steps, cards, lastTaskId: fd.id, lastTaskTitle: fd.title };
    return {
      reply: `Предлагаю так:\n\nНазвание:\n${newTitle}${subNote}\n\nПрименить изменения?`,
      steps, cards,
      confirm: { token: '', kind: 'mass', summary: `Улучшение «${fd.title}»` },
      pendingOps: ops,
      lastTaskId: fd.id, lastTaskTitle: fd.title,
    };
  }

  // 12. Аналитика: день / неделя / рекомендации
  // TEST 10: что сделано сегодня — только завершённые
  if (/что\s+я\s+сегодня\s+сделал|что\s+сделано\s+сегодня|мои\s+заверш[её]нные\s+сегодня/.test(t)) {
    const r = await callTool(userId, 'today_tasks', {}, ctx, steps);
    const list = ((r.data as any)?.tasks || []).filter((x: any) => x.status === 'COMPLETED');
    if (!list.length) return { reply: 'Сегодня пока ничего не завершено.', steps, cards };
    cards.push({ type: 'tasklist', title: 'Завершено сегодня', tasks: list.slice(0, 10) });
    return { reply: `Сегодня завершено (${list.length}):\n${list.slice(0, 10).map((x: any) => `✓ ${x.title}`).join('\n')}`, steps, cards };
  }
  // TEST 11: что осталось / не выполнено
  if (/что\s+осталось|что\s+не\s+выполнено|невыполнен|остаток\s+на\s+сегодня|мои\s+незаверш/.test(t)) {
    const r = await callTool(userId, 'today_tasks', {}, ctx, steps);
    const list = ((r.data as any)?.tasks || []).filter((x: any) => x.status !== 'COMPLETED');
    if (!list.length) return { reply: 'Всё выполнено, остатка нет. Отличный день!', steps, cards };
    cards.push({ type: 'tasklist', title: 'Осталось', tasks: list.slice(0, 10) });
    return { reply: `Осталось (${list.length}):\n${list.slice(0, 10).map((x: any) => `• ${taskLine(x)}`).join('\n')}`, steps, cards };
  }
  // §34: что мы только что сделали — по истории разговора
  if (/что\s+мы\s+(только\s+что\s+)?(сделали|делали|выполнили|создали)/.test(t)) {
    const done = (history || [])
      .filter((m) => m.role === 'assistant' && m.content && !/не (совсем )?понял|как (назвать|ую)/i.test(m.content))
      .slice(-3)
      .map((m) => m.content.replace(/[#*`_]/g, '').trim().split('\n')[0].slice(0, 160));
    if (!done.length) return { reply: 'Пока ничего не делали — с чего начнём?', steps, cards };
    return { reply: `Что мы сделали:\n${done.map((d) => `• ${d}`).join('\n')}`, steps, cards };
  }
  if (/как\s+прош[её]л|итоги\s+дня|мой\s+день|подведи\s+итог/.test(t)) {
    const r = await callTool(userId, 'day_summary', {}, ctx, steps);
    const d = (r.data as any) || {};
    const top = (d.tasks || []).filter((x: any) => x.status !== 'COMPLETED' && x.priority === 'HIGH').slice(0, 5);
    cards.push({ type: 'summary', summary: d });
    let reply = `Итоги дня\n\n✓ Завершено: ${d.done}\n◷ В работе: ${d.inProgress}\n○ Осталось: ${d.left}\n⚠ Просрочено: ${d.overdue}\n\nФокус: ${Math.floor((d.focusMin || 0) / 60)} ч ${((d.focusMin || 0) % 60)} мин`;
    if (top.length) reply += `\n\nИз важных осталось:\n${top.map((x: any) => `• ${x.title}`).join('\n')}`;
    else if (d.left === 0) reply += '\n\nВсё сделано. Отличный результат!';
    return { reply, steps, cards };
  }
  if (/как\s+прошла\s+недел|итоги\s+недели|анализ\s+недели/.test(t)) {
    const r = await callTool(userId, 'productivity_stats', { days: 7 }, ctx, steps);
    const d = (r.data as any) || {};
    return { reply: `Неделя: создано ${d.created}, завершено ${d.completed}.`, steps, cards };
  }
  if (/продуктивн|статистик|сколько\s+сделал|за\s+месяц/.test(t)) {
    const r = await callTool(userId, 'productivity_stats', { days: 30 }, ctx, steps);
    const d = (r.data as any) || {};
    return { reply: `За 30 дней: создано ${d.created}, завершено ${d.completed}.`, steps, cards };
  }
  if (/что\s+лучше|рекомендац|что\s+сделать|с\s+чего\s+начать|посоветуй/.test(t)) {
    const [day, over] = await Promise.all([
      callTool(userId, 'day_summary', {}, ctx, steps),
      callTool(userId, 'overdue_tasks', {}, ctx, steps),
    ]);
    const d = (day.data as any) || {};
    const ol = ((over.data as any)?.tasks || []).slice(0, 3);
    let reply = 'Смотри, что важно:\n';
    if (ol.length) reply += `\nСначала закрой просроченное:\n${ol.map((x: any) => `• ${x.title}`).join('\n')}\n`;
    const top = (d.tasks || []).filter((x: any) => x.status !== 'COMPLETED' && x.priority === 'HIGH').slice(0, 3);
    if (top.length) reply += `\nЗатем высокое по приоритету:\n${top.map((x: any) => `• ${x.title}`).join('\n')}\n`;
    if (!ol.length && !top.length) reply += '\nНичего срочного нет — хороший момент для планирования.';
    return { reply, steps, cards };
  }

  // 13. Привычки / цели / фокус / календарь
  if (/привычк/.test(t)) {
    if (/выполнил|сегодня|какие/.test(t)) {
      const r = await callTool(userId, 'get_habits', {}, ctx, steps);
      const list = (r.data as any)?.habits || [];
      if (!list.length) return { reply: 'Привычек пока нет.', steps, cards };
      const done = list.filter((h: any) => h.doneToday);
      return { reply: `Привычки сегодня: ${done.length} из ${list.length}\n${list.map((h: any) => `${h.doneToday ? '✓' : '○'} ${h.name} (стрик ${h.streak})`).join('\n')}`, steps, cards };
    }
    if (/стрик|дней\s+подряд/.test(t)) {
      const r = await callTool(userId, 'get_habits', {}, ctx, steps);
      const list = (r.data as any)?.habits || [];
      if (!list.length) return { reply: 'Привычек пока нет.', steps, cards };
      const best = [...list].sort((a, b) => b.streak - a.streak)[0];
      return { reply: `Лучший стрик: «${best.name}» — ${best.streak} ${numWordsRu(best.streak, 'день', 'дня', 'дней')}.`, steps, cards };
    }
    if (/создай/.test(t)) {
      const name = extractQuoted(text) || stripVerbs(text).replace(/привычк\w*/gi, '').trim();
      if (!name) return fail('Как назвать привычку?');
      // create_habit нет в tools — используем прямой вызов через get_habits? Нет: честно говорим
      return fail('Создание привычек голосом пока недоступно — создай её во вкладке «Привычки», а отмечать могу я.');
    }
    return fail('Что с привычками? Могу показать сегодняшние или лучший стрик.');
  }
  if (/цел[ьи]/.test(t)) {
    if (/создай/.test(t)) {
      const name = extractQuoted(text) || stripVerbs(text).replace(/цел\w*/gi, '').replace(/на\s+месяц/gi, '').trim();
      if (!name) return fail('Как назвать цель?');
      await callTool(userId, 'create_goal', { name: name.slice(0, 200) }, ctx, steps);
      return { reply: `Цель «${name.slice(0, 200)}» создана.`, steps, cards };
    }
    const r = await callTool(userId, 'get_goals', {}, ctx, steps);
    const list = (r.data as any)?.goals || [];
    if (!list.length) return { reply: 'Целей пока нет.', steps, cards };
    return { reply: `Цели:\n${list.slice(0, 10).map((g: any) => `• ${g.name}${g.target ? ` — ${g.current}/${g.target}${g.unit ? ` ${g.unit}` : ''}` : ''}`).join('\n')}`, steps, cards };
  }
  if (/фокус|работал|поработал|продуктивн.*день|самый\s+продуктивн/.test(t)) {
    const days = /недел/.test(t) ? 7 : /месяц/.test(t) ? 30 : 1;
    const r = await callTool(userId, 'focus_summary', { days }, ctx, steps);
    const d = (r.data as any) || {};
    return {
      reply: `Фокус за ${days === 1 ? 'сегодня' : `${days} дн.`}: ${d.sessions} ${numWordsRu(d.sessions || 0, 'сессия', 'сессии', 'сессий')}, ${d.minutes} мин.${d.bestDay ? ` Лучший день: ${d.bestDay.date} — ${d.bestDay.minutes} мин.` : ''}`,
      steps, cards,
    };
  }

  // 14. Fallback
  return {
    reply: 'Не совсем понял. Могу: найти/создать/перенести/завершить задачи, разбить на подзадачи, работать с заметками, показать итоги дня. Попробуй, например: «Что осталось на сегодня?»',
    steps, cards,
  };
}
