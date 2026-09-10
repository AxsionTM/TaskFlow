'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Pagination, EmptyState, Skeleton, ConfirmModal, Field, inputCls, fmtDate } from './ui';
import { cn } from '@/lib/utils';

type Toast = (text: string, ok?: boolean) => void;

const STATUSES = ['', 'TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PRIORITIES = ['', 'NONE', 'LOW', 'MEDIUM', 'HIGH'];

export function Tasks({
  onOpen,
  initialTaskId,
  onBack,
  toast,
  userOnly,
}: {
  onOpen: (id: string) => void;
  initialTaskId: string | null;
  onBack?: () => void;
  toast: Toast;
  userOnly?: string;
}) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), pageSize: '20' };
      if (debounced) params.search = debounced;
      if (status) params.status = status;
      if (priority) params.priority = priority;
      if (userOnly) params.userId = userOnly;
      const res = await api.adminTasks(params);
      setTasks(res.tasks);
      setTotal(res.total);
    } catch {
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debounced, status, priority, userOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(
    async (id: string) => {
      try {
        const res = await api.adminTask(id);
        setDetail(res.task);
        setForm({
          title: res.task.title || '',
          description: res.task.description || '',
          status: res.task.status,
          priority: res.task.priority,
          dueDate: res.task.dueDate ? String(res.task.dueDate).slice(0, 16) : '',
        });
        setEditing(false);
        onOpen(id);
      } catch (e: any) {
        toast(e.message || 'Не удалось открыть задачу', false);
      }
    },
    [onOpen, toast]
  );

  useEffect(() => {
    if (initialTaskId) void openDetail(initialTaskId);
    else setDetail(null);
  }, [initialTaskId, openDetail]);

  const save = async () => {
    if (!detail || !form.title.trim()) {
      toast('Название обязательно', false);
      return;
    }
    setBusy(true);
    try {
      const res = await api.adminUpdateTask(detail.id, {
        title: form.title.trim(),
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      });
      setDetail({ ...detail, ...res.task });
      setEditing(false);
      toast('Задача обновлена');
      void load();
    } catch (e: any) {
      toast(e.message || 'Не удалось сохранить', false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.adminDeleteTask(detail.id);
      toast('Задача удалена');
      setConfirmDelete(false);
      setDetail(null);
      onBack?.();
      void load();
    } catch (e: any) {
      toast(e.message || 'Не удалось удалить', false);
    } finally {
      setBusy(false);
    }
  };

  if (detail) {
    return (
      <div className="space-y-4">
        {onBack && (
          <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-sm font-medium hover:bg-accent">
            <ArrowLeft className="h-4 w-4" /> К задачам
          </button>
        )}
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{detail.title}</h2>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">ID: {detail.id}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Автор: {detail.creator ? `${detail.creator.name || '—'} · ${detail.creator.email}` : detail.creatorId} · Создана: {fmtDate(detail.createdAt)}
              </p>
            </div>
            <div className="flex gap-2">
              {!editing ? (
                <button type="button" onClick={() => setEditing(true)} className="h-10 rounded-xl border border-border/60 px-4 text-sm font-semibold hover:bg-accent">
                  Редактировать
                </button>
              ) : (
                <button type="button" onClick={() => void save()} disabled={busy} className="flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
                </button>
              )}
              <button type="button" onClick={() => setConfirmDelete(true)} className="flex h-10 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500">
                <Trash2 className="h-4 w-4" /> Удалить
              </button>
            </div>
          </div>

          {!editing ? (
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-muted/30 p-3"><div className="text-[11px] text-muted-foreground">Описание</div><div className="mt-1 whitespace-pre-wrap">{detail.description || '—'}</div></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-muted/30 p-3"><div className="text-[11px] text-muted-foreground">Статус</div><div className="mt-1 font-semibold">{detail.status}</div></div>
                <div className="rounded-xl bg-muted/30 p-3"><div className="text-[11px] text-muted-foreground">Приоритет</div><div className="mt-1 font-semibold">{detail.priority}</div></div>
                <div className="rounded-xl bg-muted/30 p-3"><div className="text-[11px] text-muted-foreground">Дедлайн</div><div className="mt-1">{detail.dueDate ? fmtDate(detail.dueDate) : '—'}</div></div>
                <div className="rounded-xl bg-muted/30 p-3"><div className="text-[11px] text-muted-foreground">Проект</div><div className="mt-1">{detail.project?.name || '—'}</div></div>
              </div>
              <div className="rounded-xl bg-muted/30 p-3 sm:col-span-2"><div className="text-[11px] text-muted-foreground">Теги</div><div className="mt-1">{detail.tags?.length ? detail.tags.map((t: any) => t.tag?.name).join(', ') : '—'}</div></div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <Field label="Название">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Описание">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={cn(inputCls, 'h-auto py-2.5')} />
              </Field>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Field label="Статус">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                    {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Приоритет">
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputCls}>
                    {PRIORITIES.filter(Boolean).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Дедлайн">
                  <input type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} />
                </Field>
              </div>
            </div>
          )}
        </div>
        {confirmDelete && (
          <ConfirmModal
            title="Удалить задачу?"
            text={`«${detail.title}» будет удалена навсегда вместе с подзадачами и чек-листом.`}
            confirmLabel="Удалить"
            danger
            loading={busy}
            onConfirm={() => void remove()}
            onClose={() => setConfirmDelete(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск задач…" className={cn(inputCls, 'pl-9')} />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">Статус: все</option>
          {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">Приоритет: все</option>
          {PRIORITIES.filter(Boolean).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="text-xs text-muted-foreground">Найдено: {total}</div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : tasks.length === 0 ? (
        <EmptyState text="Задачи не найдены" />
      ) : (
        <div className="space-y-1.5">
          {tasks.map((t: any) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void openDetail(t.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-card/60 px-3 py-2.5 text-left transition-colors hover:border-violet-500/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{t.creator ? `${t.creator.email}` : t.creatorId}</span>
              </span>
              <span className="hidden shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold sm:block">{t.priority}</span>
              <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold', t.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground')}>
                {t.status}
              </span>
            </button>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
    </div>
  );
}
