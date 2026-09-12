'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Bot,
  Send,
  Loader2,
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  Check,
  Sparkles,
  ChevronRight,
  PanelRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTasksStore } from '@/stores/tasks';
import { useNotesStore } from '@/stores/notes';
import { cn } from '@/lib/utils';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cards?: any[];
  steps?: { label: string; status: string }[];
  options?: { key: string; label: string; sub?: string }[];
  confirm?: { token: string; summary: string; kind: string };
  pending?: boolean;
}

const QUICK = [
  { label: 'Мой день', prompt: 'Проанализируй мой сегодняшний день.' },
  { label: 'Создать задачу', prompt: 'Создай задачу ' },
  { label: 'Просроченные', prompt: 'Покажи просроченные задачи.' },
  { label: 'Разбить задачу', prompt: 'Разбей задачу на подзадачи: ' },
  { label: 'Найти задачу', prompt: 'Найди задачу ' },
  { label: 'Анализ недели', prompt: 'Как прошла моя неделя?' },
];

function priorityRu(p: string) {
  return p === 'HIGH' ? 'Высокий' : p === 'MEDIUM' ? 'Средний' : p === 'LOW' ? 'Низкий' : 'Обычный';
}

function TaskCard({ task }: { task: any }) {
  const done = task.subtasksDone ?? 0;
  const total = task.subtasksTotal ?? 0;
  const timeRange = task.startLabel && task.due && task.start !== task.due
    ? `${String(task.startLabel).split(',')[1]?.trim() || ''} — ${String(task.dueLabel).split(',')[1]?.trim() || ''}`
    : null;
  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-primary/25 bg-card/60">
      <div className="border-b border-border/40 px-3.5 py-2.5">
        <div className="truncate text-sm font-bold">{task.title}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{task.project?.name || 'Без проекта'}</div>
      </div>
      <div className="space-y-1.5 px-3.5 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 font-semibold text-red-400">{priorityRu(task.priority)}</span>
          <span className="text-muted-foreground">{task.dueLabel}</span>
          <span className="ml-auto text-muted-foreground">{task.status === 'COMPLETED' ? 'Завершена' : task.status === 'IN_PROGRESS' ? 'В работе' : 'К выполнению'}</span>
        </div>
        {timeRange && timeRange.includes('—') && (
          <div className="tabular-nums text-muted-foreground">{timeRange}</div>
        )}
        {total > 0 && (
          <div className="text-muted-foreground">Подзадачи: {done} / {total}</div>
        )}
      </div>
    </div>
  );
}

function refreshAppData() {
  try {
    const s = useTasksStore.getState();
    void s.refreshCurrentView({ silent: true }).catch(() => {});
    void useNotesStore.getState().fetchNotes({ silent: true }).catch(() => {});
  } catch {}
}

export function AssistantView() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [context, setContext] = useState<any>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  }, []);

  useEffect(() => {
    scrollDown();
  }, [messages, scrollDown]);

  const loadConversations = useCallback(async () => {
    try {
      const r = await api.agentConversations();
      setConversations(r.conversations);
    } catch {}
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const loadContext = useCallback(async () => {
    try {
      const focus = await api.getFocusStats().catch(() => null);
      const s = useTasksStore.getState();
      const t = s.todayTasks || [];
      const o = s.overdueTasks || [];
      const inProg = [...t, ...o].filter((x: any) => x.status === 'IN_PROGRESS').length;
      setContext({
        today: t.length,
        inProgress: inProg,
        overdue: o.length,
        focusMin: (focus as any)?.totalMinutes ?? 0,
      });
    } catch {}
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const openConversation = async (id: string | null) => {
    setConversationId(id);
    setHistoryOpen(false);
    if (!id) {
      setMessages([]);
      return;
    }
    try {
      const r = await api.agentMessages(id);
      setMessages(
        r.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          cards: m.cards || [],
        }))
      );
    } catch {}
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const pending: ChatMsg = { id: `a-${Date.now()}`, role: 'assistant', content: '', pending: true, steps: [] };
    setMessages((m) => [...m, userMsg, pending]);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const r = await api.agentChat({
        conversationId: conversationId || undefined,
        message: text,
        timezone: tz,
        clientNowISO: new Date().toISOString(),
      });
      setConversationId(r.conversationId);
      setMessages((m) =>
        m.map((x) =>
          x.id === pending.id
            ? { ...x, pending: false, content: r.reply, cards: r.cards || [], steps: r.steps || [], options: r.options, confirm: r.confirm }
            : x
        )
      );
      if ((r.cards || []).length || (r.steps || []).length) refreshAppData();
      void loadConversations();
      void loadContext();
    } catch (e: any) {
      setMessages((m) =>
        m.map((x) => (x.id === pending.id ? { ...x, pending: false, content: `Не получилось: ${e.message || 'ошибка'}. Попробуй ещё раз.` } : x))
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const answerConfirm = async (msg: ChatMsg, approved: boolean) => {
    if (!msg.confirm || !conversationId) return;
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, confirm: undefined } : x)));
    const pending: ChatMsg = { id: `a-${Date.now()}`, role: 'assistant', content: '', pending: true, steps: [] };
    setMessages((m) => [...m, pending]);
    try {
      const r = await api.agentConfirm(conversationId, msg.confirm.token, approved);
      setMessages((m) =>
        m.map((x) => (x.id === pending.id ? { ...x, pending: false, content: r.reply, cards: r.cards || [], steps: r.steps || [] } : x))
      );
      refreshAppData();
      void loadContext();
    } catch (e: any) {
      setMessages((m) =>
        m.map((x) => (x.id === pending.id ? { ...x, pending: false, content: `Не получилось: ${e.message || 'ошибка'}` } : x))
      );
    }
  };

  const pickOption = (opt: { key: string; label: string }) => {
    void send(opt.label);
  };

  const removeConversation = async (id: string) => {
    if (!confirm('Удалить разговор?')) return;
    try {
      await api.agentDeleteConversation(id);
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
      void loadConversations();
    } catch {}
  };

  const saveRename = async () => {
    if (!renameId || !renameVal.trim()) {
      setRenameId(null);
      return;
    }
    try {
      await api.agentRenameConversation(renameId, renameVal.trim().slice(0, 100));
      void loadConversations();
    } catch {}
    setRenameId(null);
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* Чат */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="tf-view-header flex shrink-0 items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-[0_0_18px_-4px_rgba(139,92,246,.7)]">
            <Bot className="h-5 w-5" />
          </span>
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-base font-bold leading-tight">AI Ассистент</h1>
            <p className="truncate text-[11px] text-muted-foreground">Умный помощник по задачам</p>
          </div>
          <button type="button" onClick={() => setHistoryOpen(true)} className="flex h-10 items-center gap-1.5 rounded-xl border border-border/60 px-3 text-xs font-semibold hover:bg-accent lg:hidden" title="История чатов">
            <MessageSquare className="h-4 w-4" /> Чаты
          </button>
          <button type="button" onClick={() => void openConversation(null)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 hover:bg-accent" title="Новый чат">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setContextOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 hover:bg-accent xl:hidden" title="Контекст">
            <PanelRight className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          <div className="mx-auto w-full max-w-2xl space-y-4">
            {messages.length === 0 && (
              <div className="rounded-3xl border border-primary/20 bg-card/40 p-5 text-center backdrop-blur">
                <Bot className="mx-auto mb-2 h-8 w-8 text-violet-400" />
                <p className="text-sm font-semibold">Привет! Я помогу с задачами.</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  Спроси «Что осталось на сегодня?», попроси создать или перенести задачу — я всё сделаю сам.
                </p>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-r from-violet-600 to-indigo-500 px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-[0_4px_18px_-6px_rgba(139,92,246,.6)]">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-white">
                    <Bot className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 max-w-[85%] flex-1 rounded-2xl rounded-tl-md border border-border/50 bg-card/60 px-3.5 py-2.5 backdrop-blur">
                    {m.pending ? (
                      <div>
                        {(m.steps || []).map((s, i) => (
                          <div key={i} className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
                            {s.status === 'done' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />}
                            {s.label}…
                          </div>
                        ))}
                        {!(m.steps || []).length && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" /> Думаю…
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="assistant-md text-[13px] leading-relaxed">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                        {(m.cards || []).map((c: any, i: number) => {
                          if (c.type === 'task' && c.task) return <TaskCard key={i} task={c.task} />;
                          if (c.type === 'tasklist' && c.tasks) {
                            return (
                              <div key={i} className="mt-2 rounded-2xl border border-border/40 bg-background/40 p-2.5">
                                {c.title && <div className="mb-1 px-1 text-[11px] font-bold text-muted-foreground">{c.title}</div>}
                                {c.tasks.slice(0, 8).map((t: any) => (
                                  <div key={t.id} className="truncate px-1 py-1 text-xs">
                                    {t.status === 'COMPLETED' ? '✓' : '•'} {t.title}
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          if (c.type === 'summary' && c.summary) {
                            const s = c.summary;
                            return (
                              <div key={i} className="mt-2 grid grid-cols-2 gap-1.5 text-center sm:grid-cols-4">
                                {[['Завершено', s.done, '#22c55e'], ['В работе', s.inProgress, '#60a5fa'], ['Осталось', s.left, '#f59e0b'], ['Просрочено', s.overdue, '#ef4444']].map(([l, v, col]: any) => (
                                  <div key={l} className="rounded-xl border border-border/40 bg-background/40 p-2">
                                    <div className="text-base font-bold tabular-nums" style={{ color: col }}>{v}</div>
                                    <div className="text-[10px] text-muted-foreground">{l}</div>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        })}
                        {(m.options || []).length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {m.options!.map((o) => (
                              <button
                                key={o.key}
                                type="button"
                                onClick={() => pickOption(o)}
                                className="block w-full rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-left text-xs transition-colors hover:bg-primary/20"
                              >
                                <span className="block truncate font-semibold">{o.label}</span>
                                {o.sub && <span className="block truncate text-[10px] text-muted-foreground">{o.sub}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        {m.confirm && (
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void answerConfirm(m, true)}
                              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600 text-xs font-bold text-white hover:bg-violet-500"
                            >
                              <Check className="h-3.5 w-3.5" /> Подтвердить
                            </button>
                            <button
                              type="button"
                              onClick={() => void answerConfirm(m, false)}
                              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 text-xs font-semibold hover:bg-accent"
                            >
                              <X className="h-3.5 w-3.5" /> Отмена
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Быстрые действия (mobile chips) */}
        <div className="tf-assistant-quick shrink-0 border-t border-border/40 px-3 pt-2 lg:hidden">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {QUICK.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => void send(q.prompt)}
                disabled={sending}
                className="h-9 shrink-0 rounded-full border border-primary/30 bg-primary/10 px-3 text-[11px] font-semibold text-primary disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 sm:px-6">
          <div className="mx-auto flex w-full max-w-2xl items-end gap-2 rounded-2xl border border-primary/25 bg-card/70 p-2 backdrop-blur">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Напишите запрос..."
              rows={1}
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              aria-label="Отправить"
              className="tf-btn-violet flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Правая панель (desktop) */}
      <div className="hidden w-[260px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border/50 p-3 xl:flex">
        <div className="rounded-2xl border border-border/50 bg-card/50 p-3">
          <div className="mb-2 text-xs font-bold text-muted-foreground">БЫСТРЫЕ ДЕЙСТВИЯ</div>
          <div className="space-y-1">
            {QUICK.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => void send(q.prompt)}
                disabled={sending}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                {q.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/50 p-3">
          <div className="mb-2 text-xs font-bold text-muted-foreground">КОНТЕКСТ</div>
          <div className="space-y-1.5 text-xs">
            {[
              ['Сегодня', `${context?.today ?? '—'} задач`, '#22c55e'],
              ['В работе', `${context?.inProgress ?? '—'} задачи`, '#60a5fa'],
              ['Просрочено', `${context?.overdue ?? 0}`, '#ef4444'],
              ['Фокус', `${Math.floor((context?.focusMin || 0) / 60)}ч ${(context?.focusMin || 0) % 60}м`, '#a855f7'],
            ].map(([l, v, c]: any) => (
              <div key={l} className="flex items-center gap-2 rounded-lg bg-background/40 px-2.5 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c }} />
                <span className="text-muted-foreground">{l}</span>
                <span className="ml-auto font-semibold tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">ЧАТЫ</span>
            <button type="button" onClick={() => void openConversation(null)} className="rounded-lg p-1 hover:bg-accent" title="Новый чат">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {conversations.map((c) => (
              <div key={c.id} className={cn('group flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs', conversationId === c.id ? 'bg-primary/15 text-primary' : 'hover:bg-accent')}>
                <button type="button" onClick={() => void openConversation(c.id)} className="min-w-0 flex-1 truncate text-left">
                  {renameId === c.id ? (
                    <input
                      value={renameVal}
                      autoFocus
                      onChange={(e) => setRenameVal(e.target.value)}
                      onBlur={() => void saveRename()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveRename();
                        if (e.key === 'Escape') setRenameId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-xs"
                    />
                  ) : (
                    c.title
                  )}
                </button>
                <button type="button" onClick={() => { setRenameId(c.id); setRenameVal(c.title); }} className="hidden rounded p-1 hover:bg-accent group-hover:block" title="Переименовать">
                  <Pencil className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => void removeConversation(c.id)} className="hidden rounded p-1 hover:bg-accent hover:text-red-400 group-hover:block" title="Удалить">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {conversations.length === 0 && <p className="px-1 py-2 text-[11px] text-muted-foreground">Пока нет разговоров</p>}
          </div>
        </div>
      </div>

      {/* История (mobile sheet) */}
      {historyOpen && (
        <div className="fixed inset-0 z-[110] lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/60" onClick={() => setHistoryOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-card p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold">Чаты</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => void openConversation(null)} className="rounded-lg p-2 hover:bg-accent" title="Новый чат">
                  <Plus className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-lg p-2 hover:bg-accent" title="Закрыть">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto">
              {conversations.map((c) => (
                <div key={c.id} className={cn('flex items-center gap-1 rounded-xl px-2 py-2 text-sm', conversationId === c.id ? 'bg-primary/15 text-primary' : 'hover:bg-accent')}>
                  <button type="button" onClick={() => void openConversation(c.id)} className="min-w-0 flex-1 truncate text-left">
                    {c.title}
                  </button>
                  <button type="button" onClick={() => void removeConversation(c.id)} className="rounded p-1.5 hover:text-red-400" title="Удалить">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {conversations.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">Пока нет разговоров</p>}
            </div>
          </div>
        </div>
      )}

      {/* Контекст (mobile/tablet drawer) */}
      {contextOpen && (
        <div className="fixed inset-0 z-[110] xl:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/60" onClick={() => setContextOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-[260px] bg-card p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold">Контекст</span>
              <button type="button" onClick={() => setContextOpen(false)} className="rounded-lg p-2 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                ['Сегодня', `${context?.today ?? '—'} задач`, '#22c55e'],
                ['В работе', `${context?.inProgress ?? '—'} задачи`, '#60a5fa'],
                ['Просрочено', `${context?.overdue ?? 0}`, '#ef4444'],
                ['Фокус', `${Math.floor((context?.focusMin || 0) / 60)}ч ${(context?.focusMin || 0) % 60}м`, '#a855f7'],
              ].map(([l, v, c]: any) => (
                <div key={l} className="flex items-center gap-2 rounded-lg bg-background/40 px-2.5 py-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c }} />
                  <span className="text-muted-foreground">{l}</span>
                  <span className="ml-auto font-semibold tabular-nums">{v}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setContextOpen(false);
                document.querySelector('.tf-assistant-quick')?.scrollIntoView();
              }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary"
            >
              Быстрые действия <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
