'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Download, Loader2, Network, Upload, Share2, Flag, Layers, CalendarDays, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useTasksStore } from '@/stores/tasks';
import { GraphNode, GraphEdge, ObsidianGraph, type SelectedDayInfo } from './ObsidianGraph';
import { cn } from '@/lib/utils';

const PRIORITY_DOT: Record<string, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#3b82f6',
  NONE: '#22a06b',
};

const PRIORITY_ORDER = ['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
const PRIORITY_LABEL: Record<string, string> = {
  HIGH: 'Высокий',
  MEDIUM: 'Средний',
  LOW: 'Низкий',
  NONE: 'Без приоритета',
};

function PriorityDonut({ byPriority, total }: { byPriority: Record<string, number>; total: number }) {
  const R = 40;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const segments = PRIORITY_ORDER.map((p) => {
    const value = byPriority[p] || 0;
    const frac = total > 0 ? value / total : 0;
    const seg = { key: p, value, frac, offset: acc };
    acc += frac;
    return seg;
  });
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-24 w-24 shrink-0">
        <svg className="tf-focus-ring h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--muted) / 0.35)" strokeWidth="9" />
          {segments.map(
            (s) =>
              s.frac > 0 && (
                <circle
                  key={s.key}
                  cx="50" cy="50" r={R} fill="none"
                  stroke={PRIORITY_DOT[s.key]} strokeWidth="9"
                  strokeLinecap="butt"
                  strokeDasharray={`${s.frac * C} ${C}`}
                  strokeDashoffset={-s.offset * C}
                />
              )
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums">{total}</span>
          <span className="px-1 text-center text-[8px] leading-tight text-muted-foreground">задач</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: PRIORITY_DOT[s.key], boxShadow: `0 0 6px ${PRIORITY_DOT[s.key]}` }}
            />
            <span className="flex-1 truncate text-muted-foreground">{PRIORITY_LABEL[s.key]}</span>
            <span className="tabular-nums font-semibold">{s.value}</span>
            <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
              {total > 0 ? `${Math.round(s.frac * 100)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GraphView() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState('7');
  const [hideTimeline, setHideTimeline] = useState(false);
  const [colorMode, setColorMode] = useState<'priority' | 'cluster'>('priority');
  const [selectedDay, setSelectedDay] = useState<SelectedDayInfo | null>(null);
  const setSelectedTask = useTasksStore((state) => state.setSelectedTask);
  const onSelectedDay = useCallback((info: SelectedDayInfo | null) => setSelectedDay(info), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    api.getGraph({ days, limit: '2000', timezone })
      .then((data) => { if (!active) return; setNodes(data.nodes); setEdges(data.edges); setError(null); })
      .catch((err) => { if (active) setError(err?.message || 'Не удалось загрузить граф'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const taskNodes = useMemo(() => nodes.filter((n) => n.type === 'task'), [nodes]);
  const dayCount = useMemo(() => nodes.filter((n) => n.type === 'date').length, [nodes]);

  const dayTasks = useMemo(() => {
    if (!selectedDay) return null;
    const key = selectedDay.dateKey;
    return taskNodes.filter(
      (n) => n.dateKey === key || (Array.isArray(n.dateKeys) && n.dateKeys.includes(key))
    );
  }, [taskNodes, selectedDay]);

  const scopedStats = useMemo(() => {
    const list = dayTasks ?? taskNodes;
    const byPriority: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
    let completed = 0;
    let overdue = 0;
    for (const t of list) {
      const p = t.priority && t.priority in byPriority ? t.priority : 'NONE';
      byPriority[p] += 1;
      if (t.status === 'COMPLETED') {
        completed += 1;
      } else if (t.dueDate && new Date(t.dueDate).getTime() < todayStart) {
        overdue += 1;
      }
    }
    const total = list.length;
    return {
      total,
      completed,
      overdue,
      active: total - completed,
      byPriority,
      scope: dayTasks ? 'day' : 'all',
    };
  }, [dayTasks, taskNodes, todayStart]);

  const projectGroups = useMemo(() => {
    const list = (dayTasks ?? taskNodes).filter((n) => n.status !== 'COMPLETED');
    const map = new Map<string, { name: string; color: string; count: number }>();
    for (const t of list) {
      const name = t.projectName || 'Без проекта';
      const color = t.projectColor || 'hsl(var(--primary))';
      if (!map.has(name)) map.set(name, { name, color, count: 0 });
      map.get(name)!.count += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [dayTasks, taskNodes]);

  if (loading) return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (error) return <div className="flex flex-1 items-center justify-center"><div className="rounded-lg border bg-card px-5 py-4 text-sm text-destructive">{error}</div></div>;

  const downloadVault = async () => {
    const token = api.getToken();
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/export/obsidian`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { alert('Не удалось экспортировать Obsidian vault'); return; }
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `taskflow-obsidian-${new Date().toISOString().slice(0,10)}.zip`; a.click(); URL.revokeObjectURL(a.href);
  };

  const importVault = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const form = new FormData(); form.append('file', file);
    const token = api.getToken();
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/export/obsidian/import`;
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) alert(data?.message || 'Не удалось импортировать vault');
    else { alert(`Импортировано задач: ${data.imported}`); window.location.reload(); }
    event.target.value = '';
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="tf-view-header flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <Network className="h-5 w-5 text-primary" />
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">Граф</h1>
          <p className="text-sm text-muted-foreground">Видишь — значит можешь улучшить!</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="h-9 rounded-xl border border-input bg-card/60 px-2.5 text-xs backdrop-blur"
          title="Период"
        >
          <option value="7">Период: 7 дней</option>
          <option value="14">Период: 14 дней</option>
          <option value="30">Период: 30 дней</option>
        </select>
        <button onClick={downloadVault} className="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs hover:bg-accent">
          <Download className="h-3.5 w-3.5" />Экспорт
        </button>
        <label className="hidden cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs hover:bg-accent">
          <Upload className="h-3.5 w-3.5" />Import vault
          <input type="file" accept=".zip,.md" className="hidden" onChange={importVault} />
        </label>
      </header>

      <div className="tf-graph-grid grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="tf-graph-canvas tf-glass flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-3xl">
          <div className="flex min-h-0 flex-1 flex-col">
            <ObsidianGraph
              nodes={nodes}
              edges={edges}
              onOpenTask={setSelectedTask}
              hideTimeline={hideTimeline}
              colorMode={colorMode}
              onSelectedDay={onSelectedDay}
              embeddedPanel
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-4 py-3">
            <button
              type="button"
              onClick={() => setHideTimeline((v) => !v)}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs transition-all', !hideTimeline ? 'tf-chip-active' : 'tf-chip')}
            >
              <Share2 className="h-3.5 w-3.5" />Взаимосвязи
            </button>
            <button
              type="button"
              onClick={() => setColorMode('priority')}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs transition-all', colorMode === 'priority' ? 'tf-chip-active' : 'tf-chip')}
            >
              <Flag className="h-3.5 w-3.5" />Приоритеты
            </button>
            <button
              type="button"
              onClick={() => setColorMode(colorMode === 'cluster' ? 'priority' : 'cluster')}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs transition-all', colorMode === 'cluster' ? 'tf-chip-active' : 'tf-chip')}
            >
              <Layers className="h-3.5 w-3.5" />Кластеры
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
        <div className="tf-glass h-fit min-w-0 rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              {selectedDay ? `Выбранный день · ${selectedDay.label}` : 'Статистика'}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {selectedDay ? `${scopedStats.total} задач дня` : `${dayCount} дн. · ${scopedStats.total} узлов`}
            </span>
          </div>
          {scopedStats.total === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-3 py-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </span>
              <p className="mt-2 text-sm font-semibold">Нет задач</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {selectedDay ? 'В этот день задач нет' : 'За период задач нет'}
              </p>
            </div>
          ) : (
            <>
              <PriorityDonut
                byPriority={scopedStats.byPriority}
                total={scopedStats.total}
              />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-border/50 bg-card/40 px-1 py-2">
                  <div className="text-base font-bold tabular-nums text-emerald-500">{scopedStats.active}</div>
                  <div className="text-[9px] text-muted-foreground">активных</div>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/40 px-1 py-2">
                  <div className="text-base font-bold tabular-nums text-sky-500">{scopedStats.completed}</div>
                  <div className="text-[9px] text-muted-foreground">выполнено</div>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/40 px-1 py-2">
                  <div className="text-base font-bold tabular-nums text-red-500">{scopedStats.overdue}</div>
                  <div className="text-[9px] text-muted-foreground">просрочено</div>
                </div>
              </div>
            </>
          )}
          <div className="mt-3 space-y-2">
            {projectGroups.map((g) => (
              <div key={g.name} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: g.color, boxShadow: `0 0 8px -1px ${g.color}` }}
                />
                <span className="flex-1 truncate">{g.name === 'Без проекта' && projectGroups.length === 1 && scopedStats.active === 0 ? 'Нет проектов' : g.name}</span>
                <span className="tabular-nums text-muted-foreground">{g.count}</span>
              </div>
            ))}
            {projectGroups.length === 0 && scopedStats.total > 0 && (
              <p className="text-xs text-muted-foreground">Нет проектов — создайте первый проект</p>
            )}
          </div>
        </div>

        {}
        <div className="tf-glass h-fit min-w-0 rounded-3xl p-4">
          <div className="flex items-start gap-2.5">
            {selectedDay ? (
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full" style={{ background: selectedDay.color, boxShadow: `0 0 14px ${selectedDay.color}66` }} />
            ) : (
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[.18em] text-muted-foreground">Выбранный день</div>
              <div className="mt-0.5 truncate text-base font-semibold">{selectedDay ? selectedDay.label : 'День не выбран'}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {selectedDay
                  ? selectedDay.roots.length
                    ? `${selectedDay.roots.length} задач · ${selectedDay.descendantCount} подзадач раскрыто · ${selectedDay.roots.length + selectedDay.descendantCount} узлов`
                    : 'На этот день открытых задач нет · 0 узлов'
                  : 'Нажмите на узел дня в графе'}
              </div>
            </div>
            {selectedDay && (
              <button onClick={() => setSelectedDay(null)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Снять выбор">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {selectedDay && (
            <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
              {selectedDay.roots.length === 0 && (
                <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">Задач нет</p>
              )}
              {selectedDay.roots.map((task) => (
                <button
                  key={task.id}
                  onClick={() => task.taskId && setSelectedTask(task.taskId)}
                  className="flex w-full items-center gap-2 rounded-xl border border-border/50 bg-card/40 px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent/60"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PRIORITY_DOT[task.priority || 'NONE'], boxShadow: `0 0 8px -1px ${PRIORITY_DOT[task.priority || 'NONE']}` }} />
                  <span className="min-w-0 flex-1 truncate">{task.label}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">+</span>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
