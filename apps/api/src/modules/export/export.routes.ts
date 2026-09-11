import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../../common/utils/prisma';
import { AppError } from '../../common/middleware/error-handler';
import { AuthRequest } from '../../common/middleware/auth';
import { importLimiter } from '../../common/middleware/rate-limits';

const router = Router();

// Лимиты импорта: stored-only ZIP (без распаковки — zip-bomb невозможен
// через декомпрессию), плюс жёсткие крышки на количество и размеры.
const MAX_IMPORT_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 1 * 1024 * 1024;
const MAX_IMPORTED_TASKS = 2000;
const MAX_IMPORT_TITLE = 500;
const MAX_IMPORT_DESC = 10000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.zip') || name.endsWith('.md')) cb(null, true);
    else cb(new AppError(400, 'Разрешены только .zip и .md файлы'));
  },
});

function parseImportDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}


function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32(n: number) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }
function makeZip(entries: Array<{ name: string; data: Buffer }>) {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8'); const data = entry.data; const crc = crc32(data);
    const local = Buffer.concat([Buffer.from('504b0304','hex'), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    locals.push(local);
    const central = Buffer.concat([Buffer.from('504b0102','hex'), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    centrals.push(central); offset += local.length;
  }
  const centralData = Buffer.concat(centrals); const localData = Buffer.concat(locals);
  const eocd = Buffer.concat([Buffer.from('504b0506','hex'), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralData.length), u32(localData.length), u16(0)]);
  return Buffer.concat([localData, centralData, eocd]);
}

function readStoredZip(buffer: Buffer) {
  const out: Array<{ name: string; data: Buffer }> = [];
  let pos = 0;
  while (pos + 4 <= buffer.length) {
    const sig = buffer.readUInt32LE(pos);
    if (sig === 0x04034b50) {
      const method = buffer.readUInt16LE(pos + 8); const compressed = buffer.readUInt32LE(pos + 18); const nameLen = buffer.readUInt16LE(pos + 26); const extraLen = buffer.readUInt16LE(pos + 28);
      if (method !== 0) throw new Error('Поддерживается ZIP без сжатия. Используйте экспортированный TaskFlow vault.');
      const name = buffer.subarray(pos + 30, pos + 30 + nameLen).toString('utf8');
      const start = pos + 30 + nameLen + extraLen; out.push({ name, data: buffer.subarray(start, start + compressed) }); pos = start + compressed; continue;
    }
    break;
  }
  return out;
}

function safeFileName(name: string) { return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 120) || 'task'; }
function taskMarkdown(task: any) {
  const tags = (task.tags || []).map((t: any) => `#${t.tag?.name || t.tagId}`).join(' ');
  const lines = [
    `---`, `taskId: ${task.id}`, `status: ${task.status}`, `priority: ${task.priority}`,
    task.startDate ? `startDate: ${task.startDate.toISOString()}` : '', task.dueDate ? `dueDate: ${task.dueDate.toISOString()}` : '',
    task.parentId ? `parentId: ${task.parentId}` : '', tags ? `tags: ${tags}` : '', `---`, '', `# ${task.title}`,
    task.description || '', '',
  ].filter(Boolean);
  for (const item of task.checklist || []) lines.push(`- [${item.isCompleted ? 'x' : ' '}] ${item.title}`);
  return lines.join('\n') + '\n';
}


router.get('/obsidian', async (req: AuthRequest, res, next) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { creatorId: req.userId, isDeleted: false },
      include: { tags: { include: { tag: true } }, checklist: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const entries: Array<{ name: string; data: Buffer }> = [];
    entries.push({ name: '.obsidian/app.json', data: Buffer.from(JSON.stringify({ alwaysUpdateLinks: true, newLinkFormat: 'shortest', showLineNumber: false }, null, 2)) });
    entries.push({ name: '.obsidian/graph.json', data: Buffer.from(JSON.stringify({ showAttachments: false, showOrphans: true, showTags: true, showArrow: true }, null, 2)) });
    entries.push({ name: 'README.md', data: Buffer.from('# TaskFlow Obsidian Vault\n\nЭкспортировано из TaskFlow.\n') });
    for (const task of tasks) {
      const folder = task.parentId ? 'Tasks/Subtasks' : 'Tasks';
      entries.push({ name: `${folder}/${safeFileName(task.title)}-${task.id.slice(0, 8)}.md`, data: Buffer.from(taskMarkdown(task)) });
    }
    const zip = makeZip(entries);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="taskflow-obsidian-${new Date().toISOString().slice(0,10)}.zip"`);
    res.send(zip);
  } catch (err) { next(err); }
});

router.post('/obsidian/import', importLimiter, upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Файл не найден' });
    const rawEntries = req.file.originalname.toLowerCase().endsWith('.md')
      ? [{ name: req.file.originalname, data: req.file.buffer }]
      : readStoredZip(req.file.buffer);
    if (rawEntries.length > MAX_IMPORT_ENTRIES) {
      throw new AppError(400, `Слишком много файлов в архиве (максимум ${MAX_IMPORT_ENTRIES})`);
    }
    const entries = rawEntries.slice(0, MAX_IMPORT_ENTRIES).filter((e) => e.data.length <= MAX_ENTRY_BYTES);
    const markdown = entries.filter((e) => e.name.toLowerCase().endsWith('.md') && !e.name.endsWith('README.md'));
    const records: Array<{ name: string; title: string; description: string | null; meta: Record<string,string> }> = [];
    for (const entry of markdown.slice(0, MAX_IMPORTED_TASKS)) {
      const text = entry.data.toString('utf8', 0, Math.min(entry.data.length, MAX_ENTRY_BYTES));
      const titleMatch = text.match(/^#\s+(.+)$/m); if (!titleMatch) continue;
      const title = titleMatch[1].trim().slice(0, MAX_IMPORT_TITLE);
      if (!title) continue;
      const front = text.match(/^---\n([\s\S]{0,4000}?)\n---/);
      const meta: Record<string,string> = {};
      for (const line of (front?.[1] || '').split('\n').slice(0, 40)) { const m = line.match(/^([A-Za-z][\w-]*):\s*(.{1,500})$/); if (m) meta[m[1]] = m[2].trim(); }
      const description = (text.replace(/^---[\s\S]*?---\n?/, '').replace(/^#\s+.+\n?/, '').trim() || null)?.slice(0, MAX_IMPORT_DESC) || null;
      records.push({ name: entry.name.slice(0, 200), title, description, meta });
    }

    const idMap = new Map<string, string>();
    for (const record of records) {
      if (!record.meta.taskId) continue;
      const existing = await prisma.task.findFirst({ where: { id: record.meta.taskId, creatorId: req.userId } });
      if (existing) idMap.set(record.meta.taskId, existing.id);
    }
    let imported = 0;
    const pending = [...records];
    for (let pass = 0; pass < records.length + 1 && pending.length; pass++) {
      let progressed = 0;
      for (let i = pending.length - 1; i >= 0; i--) {
        const record = pending[i];
        const oldParent = record.meta.parentId;
        if (oldParent && !idMap.has(oldParent)) continue;
        const existing = record.meta.taskId ? await prisma.task.findFirst({ where: { id: record.meta.taskId, creatorId: req.userId } }) : null;
        if (existing) {
          await prisma.task.update({ where: { id: existing.id }, data: { title: record.title, description: record.description } });
          idMap.set(record.meta.taskId!, existing.id);
        } else {
          if (imported >= MAX_IMPORTED_TASKS) break;
          const created = await prisma.task.create({
            data: {
              creatorId: req.userId!, title: record.title, description: record.description,
              parentId: oldParent ? (idMap.get(oldParent) || null) : null,
              priority: ['HIGH','MEDIUM','LOW'].includes(record.meta.priority) ? record.meta.priority as any : 'NONE',
              status: record.meta.status === 'COMPLETED' ? 'COMPLETED' : 'TODO', isAllDay: true,
              startDate: parseImportDate(record.meta.startDate),
              dueDate: parseImportDate(record.meta.dueDate),
            },
          });
          if (record.meta.taskId) idMap.set(record.meta.taskId, created.id);
        }
        pending.splice(i, 1); imported++; progressed++;
      }
      if (!progressed) break;
    }
    // If a malformed parent reference exists, import it as a root rather than losing the task.
    for (const record of pending) {
      if (imported >= MAX_IMPORTED_TASKS) break;
      await prisma.task.create({ data: { creatorId: req.userId!, title: record.title, description: record.description, priority: 'NONE', status: 'TODO', isAllDay: true } });
      imported++;
    }
    res.json({ imported });
  } catch (err) { next(err); }
});

router.get('/json', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!;

    const [tasks, projects, tags, habits, goals, focusSessions] = await Promise.all([
      prisma.task.findMany({
        where: { creatorId: userId, isDeleted: false },
        include: {
          tags: { include: { tag: true } },
          checklist: true,
        },
      }),
      prisma.projectMember.findMany({
        where: { userId },
        include: { project: true },
      }),
      prisma.tag.findMany({ where: { userId } }),
      prisma.habit.findMany({
        where: { userId, isArchived: false },
        include: { logs: true },
      }),
      prisma.goal.findMany({ where: { userId } }),
      prisma.focusSession.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      tasks,
      projects: projects.map((p) => p.project),
      tags,
      habits,
      goals,
      focusSessions,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="taskflow-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/csv', async (req: AuthRequest, res, next) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { creatorId: req.userId, isDeleted: false, parentId: null },
      include: {
        project: { select: { name: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const escape = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    const header = 'title,status,priority,dueDate,project,tags,description';
    const rows = tasks.map((t) =>
      [
        escape(t.title),
        t.status,
        t.priority,
        t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '',
        escape(t.project?.name || ''),
        escape(t.tags.map((tt) => tt.tag.name).join('; ')),
        escape(t.description || ''),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="taskflow-tasks-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send('\uFEFF' + csv);
  } catch (err) {
    next(err);
  }
});

export { router as exportRouter };
