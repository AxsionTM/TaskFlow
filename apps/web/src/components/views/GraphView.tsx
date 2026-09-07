'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Network, Upload, Share2, Flag, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { useTasksStore } from '@/stores/tasks';
import { GraphNode, GraphEdge, ObsidianGraph } from './ObsidianGraph';
import { cn } from '@/lib/utils';

export function GraphView() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState('7');
  const [hideTimeline, setHideTimeline] = useState(false);
  const [colorMode, setColorMode] = useState<'priority' | 'cluster'>('priority');
  const setSelectedTask = useTasksStore((state) => state.setSelectedTask);

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

  const stats = useMemo(() => {
    const active = nodes.filter((n) => n.type === 'task' && n.status !== 'COMPLETED');
    const map = new Map<string, { name: string; color: string; count: number }>();
    for (const t of active) {
      const name = t.projectName || 'Без проекта';
      const color = t.projectColor || '#888888';
      if (!map.has(name)) map.set(name, { name, color, count: 0 });
      map.get(name)!.count += 1;
    }
    return { active: active.length, groups: Array.from(map.values()).sort((a, b) => b.count - a.count) };
  }, [nodes]);

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

  const ring = 2 * Math.PI * 40;

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

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="tf-glass flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-3xl">
          <div className="min-h-0 flex-1">
            <ObsidianGraph
              nodes={nodes}
              edges={edges}
              onOpenTask={setSelectedTask}
              hideTimeline={hideTimeline}
              colorMode={colorMode}
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

        <div className="tf-glass h-fit min-w-0 rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Статистика</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-24 w-24 shrink-0">
              <svg className="tf-focus-ring h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted) / 0.4)" strokeWidth="9" />
                <circle
                  cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="9"
                  strokeLinecap="round" strokeDasharray={ring}
                  strokeDashoffset={stats.active > 0 ? 0 : ring}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums">{stats.active}</span>
                <span className="px-1 text-center text-[8px] leading-tight text-muted-foreground">активных задач</span>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {stats.groups.map((g) => (
              <div key={g.name} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: g.color, boxShadow: `0 0 8px -1px ${g.color}` }}
                />
                <span className="flex-1 truncate">{g.name}</span>
                <span className="tabular-nums text-muted-foreground">{g.count}</span>
              </div>
            ))}
            {stats.groups.length === 0 && (
              <p className="text-xs text-muted-foreground">Нет активных задач</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
