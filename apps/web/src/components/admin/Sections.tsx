'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bug, CheckCircle2, ChevronDown, Loader2, Send, Server, ToggleLeft, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { Pagination, EmptyState, Skeleton, Field, inputCls, fmtDate, fmtNum, ConfirmModal } from './ui';
import { cn } from '@/lib/utils';

type Toast = (text: string, ok?: boolean) => void;

function usePaged<T>(loader: (page: number) => Promise<{ items: T[]; total: number }>, deps: unknown[]) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [extra, setExtra] = useState<any>(null);
  useEffect(() => {
    setLoading(true);
    loader(page)
      .then((r: any) => {
        setItems(r.items);
        setTotal(r.total);
        setExtra(r);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...(deps as unknown[])]);
  return { items, total, page, setPage, loading, extra, reset: () => setPage(1) };
}

const LOG_ACTIONS = [
  '',
  'ADMIN_LOGIN',
  'USER_CREATE',
  'USER_RENAME',
  'USER_DELETE',
  'USER_PASSWORD_CHANGED',
  'USER_BLOCK',
  'USER_UNBLOCK',
  'ROLE_CHANGE',
  'TASK_UPDATE',
  'TASK_DELETE',
  'IMPERSONATE',
  'NOTIFICATION_SEND',
  'ERROR_RESOLVE',
  'ERROR_REOPEN',
  'FLAG_ENABLE',
  'FLAG_DISABLE',
  'MAINTENANCE_ENABLE',
  'MAINTENANCE_DISABLE',
];

export function Logs() {
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [success, setSuccess] = useState('');
  const { items, total, page, setPage, loading, reset } = usePaged(
    async (p) => {
      const params: Record<string, string> = { page: String(p), pageSize: '20' };
      if (action) params.action = action;
      if (success) params.success = success;
      if (search.trim()) params.search = search.trim();
      const r = await api.adminLogs(params);
      return { items: r.logs, total: r.total };
    },
    [action, search, success]
  );

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-3 text-xs text-muted-foreground">
        Пример записи: <b className="text-foreground">ADMIN</b> · 08.09.2026 23:51 · Action: <b className="text-foreground">USER_PASSWORD_CHANGED</b> · Target: user@example.com · Result: SUCCESS
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder="Поиск: admin, описание, user ID…" className={inputCls} />
        <select value={action} onChange={(e) => { setAction(e.target.value); reset(); }} className={inputCls}>
          <option value="">Действие: все</option>
          {LOG_ACTIONS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={success} onChange={(e) => { setSuccess(e.target.value); reset(); }} className={inputCls}>
          <option value="">Результат: все</option>
          <option value="true">SUCCESS</option>
          <option value="false">ERROR</option>
        </select>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState text="Логи пусты" />
      ) : (
        <div className="space-y-1.5">
          {items.map((l: any) => (
            <div key={l.id} className="rounded-xl border border-border/40 bg-card/60 px-3 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 font-semibold text-violet-300">{l.action}</span>
                <span className={cn('rounded-md px-1.5 py-0.5 font-semibold', l.success ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                  {l.success ? 'SUCCESS' : 'ERROR'}
                </span>
                <span className="text-muted-foreground">ADMIN · {l.adminEmail}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">{fmtDate(l.createdAt)}</span>
              </div>
              {l.description && <div className="mt-1">{l.description}</div>}
              {(l.oldValue || l.newValue) && (
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {l.oldValue ? `− ${l.oldValue}` : ''} {l.newValue ? `→ ${l.newValue}` : ''}
                </div>
              )}
              {l.targetUserId && <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">Target: {l.targetUserId}</div>}
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
    </div>
  );
}

export function Errors({ toast }: { toast: Toast }) {
  const [search, setSearch] = useState('');
  const [resolved, setResolved] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { items, total, page, setPage, loading, extra, reset } = usePaged(
    async (p) => {
      const params: Record<string, string> = { page: String(p), pageSize: '20' };
      if (resolved) params.resolved = resolved;
      if (search.trim()) params.search = search.trim();
      const r = await api.adminErrors(params);
      return { items: r.errors, total: r.total };
    },
    [search, resolved]
  );

  const toggle = async (id: string, value: boolean) => {
    setBusy(true);
    try {
      await api.adminResolveError(id, value);
      toast(value ? 'Ошибка помечена как resolved' : 'Ошибка снова открыта');
      setOpenId(null);
      reset();
    } catch (e: any) {
      toast(e.message || 'Не удалось обновить', false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2">
          <Bug className="h-3.5 w-3.5 text-red-400" /> Нерешённых: <b className="tabular-nums">{extra?.unresolved ?? '—'}</b>
        </span>
        <input value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder="Поиск: endpoint, текст…" className={cn(inputCls, 'min-w-0 flex-1')} />
        <select value={resolved} onChange={(e) => { setResolved(e.target.value); reset(); }} className={inputCls}>
          <option value="">Все</option>
          <option value="false">Открытые</option>
          <option value="true">Resolved</option>
        </select>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState text="Ошибок нет — так держать!" />
      ) : (
        <div className="space-y-1.5">
          {items.map((e: any) => (
            <div key={e.id} className="rounded-xl border border-border/40 bg-card/60 px-3 py-2.5 text-xs">
              <button type="button" onClick={() => setOpenId(openId === e.id ? null : e.id)} className="flex w-full flex-wrap items-center gap-2 text-left">
                <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 font-mono font-semibold text-red-400">{e.statusCode}</span>
                <span className="font-mono text-muted-foreground">{e.method}</span>
                <span className="min-w-0 flex-1 truncate font-mono">{e.endpoint}</span>
                <span className="tabular-nums text-muted-foreground">×{e.count}</span>
                {e.resolved
                  ? <span className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-400"><CheckCircle2 className="h-3 w-3" />resolved</span>
                  : <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-400">open</span>}
                <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', openId === e.id && 'rotate-180')} />
              </button>
              <div className="mt-1 truncate text-muted-foreground">{e.message}</div>
              <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">Первый: {fmtDate(e.firstSeen)} · Последний: {fmtDate(e.lastSeen)}</div>
              {openId === e.id && (
                <div className="mt-2 space-y-2 rounded-xl bg-black/30 p-3">
                  <div className="text-muted-foreground">{e.message}</div>
                  {e.stack && <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-slate-400">{e.stack}</pre>}
                  {e.userId && <div className="font-mono text-[10px] text-muted-foreground">User: {e.userId}</div>}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle(e.id, !e.resolved)}
                    className="h-10 rounded-xl border border-border/60 px-4 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                  >
                    {e.resolved ? 'Открыть заново' : 'Пометить resolved'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
    </div>
  );
}

export function Notifications({ toast }: { toast: Toast }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [all, setAll] = useState(true);
  const [userQuery, setUserQuery] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [selected, setSelected] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [confirm, setConfirm] = useState(false);

  const loadHistory = useCallback(() => {
    api.adminNotificationHistory({ pageSize: '10' }).then((r) => setHistory(r.broadcasts)).catch(() => {});
  }, []);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const q = userQuery.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    const id = setTimeout(() => {
      api.adminSearch(q).then((r) => setFound(r.users)).catch(() => setFound([]));
    }, 350);
    return () => clearTimeout(id);
  }, [userQuery]);

  const send = async () => {
    if (!title.trim() || !message.trim()) {
      toast('Заполните заголовок и текст', false);
      return;
    }
    if (!all && selected.length === 0) {
      toast('Выберите получателей или включите «Всем»', false);
      return;
    }
    setBusy(true);
    try {
      const res = await api.adminSendNotification({
        title: title.trim(),
        message: message.trim(),
        all: all || undefined,
        userIds: all ? undefined : selected.map((u) => u.id),
      });
      toast(`Отправлено: ${res.recipients} получателей`);
      setTitle('');
      setMessage('');
      setSelected([]);
      setConfirm(false);
      loadHistory();
    } catch (e: any) {
      toast(e.message || 'Не удалось отправить', false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="h-fit rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Send className="h-4 w-4 text-violet-400" /> Новое уведомление</h3>
        <div className="space-y-3">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Технические работы" className={inputCls} maxLength={200} />
          </Field>
          <Field label="Message">
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Сегодня с 02:00 до 02:30 будут проводиться технические работы." className={cn(inputCls, 'h-auto py-2.5')} maxLength={2000} />
          </Field>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-5 w-5 accent-violet-600" />
            Все пользователи
          </label>
          {!all && (
            <div>
              <Field label="Выбранные пользователи">
                <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Поиск по email…" className={inputCls} />
              </Field>
              {found.length > 0 && (
                <div className="mt-1.5 overflow-hidden rounded-xl border border-border/60">
                  {found.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        if (!selected.some((s) => s.id === u.id)) setSelected([...selected, u]);
                        setUserQuery('');
                        setFound([]);
                      }}
                      className="block w-full truncate px-3 py-2.5 text-left text-xs hover:bg-accent"
                    >
                      {u.name || u.email} · <span className="text-muted-foreground">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {selected.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelected(selected.filter((s) => s.id !== u.id))}
                      className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-200"
                      title="Убрать"
                    >
                      {u.email} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={() => setConfirm(true)} className="h-11 w-full rounded-xl bg-violet-600 text-sm font-semibold text-white hover:bg-violet-500">
            Отправить
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">История отправок</h3>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">Пока ничего не отправляли</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((h: any) => (
              <div key={h.id} className="rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{h.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{h.recipients} пол.</span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-muted-foreground">{h.message}</div>
                <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{fmtDate(h.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {confirm && (
        <ConfirmModal
          title="Отправить уведомление?"
          text={`«${title.trim()}» получат: ${all ? 'все пользователи' : `${selected.length} выбранных`}.`}
          confirmLabel="Отправить"
          loading={busy}
          onConfirm={() => void send()}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted/30 px-3 py-2.5 text-sm">
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', ok === true ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : ok === false ? 'bg-red-400 shadow-[0_0_8px_#f87171]' : 'bg-slate-500')} />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function System({ toast }: { toast: Toast }) {
  const [data, setData] = useState<any>(null);
  const [flags, setFlags] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [confirmMaint, setConfirmMaint] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.adminSettings().then(setData).catch(() => {});
    api.adminFlags().then((r) => setFlags(r.flags)).catch(() => {});
    api.adminMaintenance().then((r) => {
      setMaintenance(r);
      setMessage(r.message || '');
    }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const toggleFlag = async (key: string, enabled: boolean) => {
    try {
      await api.adminSetFlag(key, enabled);
      toast(`Флаг ${key}: ${enabled ? 'ON' : 'OFF'}`);
      load();
    } catch (e: any) {
      toast(e.message || 'Не удалось изменить флаг', false);
    }
  };

  const setMaint = async (enabled: boolean) => {
    setBusy(true);
    try {
      await api.adminSetMaintenance(enabled, message || undefined);
      toast(enabled ? 'Maintenance Mode включён' : 'Maintenance Mode выключен');
      setConfirmMaint(null);
      load();
    } catch (e: any) {
      toast(e.message || 'Не удалось изменить режим', false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-emerald-400" /> System Status</h3>
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="space-y-1.5">
            <StatusRow label="Backend" value="Online" ok />
            <StatusRow label="Database" value={data.dbStatus === 'ok' ? `Connected${data.dbLatencyMs != null ? ` · ${data.dbLatencyMs} ms` : ''}` : 'Offline'} ok={data.dbStatus === 'ok'} />
            <StatusRow label="API" value="Operational" ok />
            <StatusRow label="Authentication" value="Operational" ok={data.authStatus === 'ok'} />
            <StatusRow label="AI service" value={data.aiStatus === 'ok' ? 'Online' : data.aiStatus === 'unconfigured' ? 'Не настроен' : 'Offline'} ok={data.aiStatus === 'ok' ? true : data.aiStatus === 'unconfigured' ? undefined : false} />
            <StatusRow label="Redis" value="Не используется" ok={undefined} />
            <StatusRow label="Email" value={data.emailConfigured ? 'Настроен' : 'Не настроен'} ok={data.emailConfigured ? true : undefined} />
          </div>
        )}
        {data && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Environment</div><div className="mt-0.5 font-semibold">{data.environment}</div></div>
            <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Version</div><div className="mt-0.5 font-semibold">{data.version}</div></div>
            <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Uptime</div><div className="mt-0.5 font-semibold tabular-nums">{Math.floor((data.uptimeSec || 0) / 3600)}ч {Math.floor(((data.uptimeSec || 0) % 3600) / 60)}м</div></div>
            <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Пользователей</div><div className="mt-0.5 font-semibold tabular-nums">{fmtNum(data.totalUsers)}</div></div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><ToggleLeft className="h-4 w-4 text-violet-400" /> Feature Flags</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">Только реальные возможности сервиса</p>
          {flags.map((f: any) => (
            <div key={f.key} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs font-bold">{f.key}</div>
                <div className="truncate text-[11px] text-muted-foreground">{f.description}</div>
              </div>
              <button
                type="button"
                onClick={() => void toggleFlag(f.key, !f.enabled)}
                className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', f.enabled ? 'bg-violet-600' : 'bg-muted')}
                aria-label={`${f.key}: ${f.enabled ? 'ON' : 'OFF'}`}
              >
                <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', f.enabled ? 'left-6' : 'left-1')} />
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-card/70 p-4 sm:p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Wrench className="h-4 w-4 text-amber-400" /> Maintenance Mode</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Статус: <b className={maintenance?.enabled ? 'text-amber-400' : 'text-emerald-400'}>{maintenance ? (maintenance.enabled ? 'ВКЛЮЧЁН' : 'выключен') : '…'}</b>.
            Админка продолжает работать, обычные пользователи видят страницу обслуживания.
          </p>
          <Field label="Сообщение пользователям">
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="TaskFlow временно находится на техническом обслуживании." className={inputCls} maxLength={500} />
          </Field>
          <div className="mt-3 flex gap-2">
            {!maintenance?.enabled ? (
              <button type="button" onClick={() => setConfirmMaint(true)} className="h-11 flex-1 rounded-xl bg-amber-600 text-sm font-semibold text-white hover:bg-amber-500">
                Enable
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmMaint(false)} className="h-11 flex-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20">
                Disable
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmMaint !== null && (
        <ConfirmModal
          title={confirmMaint ? 'Включить Maintenance Mode?' : 'Выключить Maintenance Mode?'}
          text={confirmMaint ? 'Обычные пользователи увидят страницу обслуживания. Админка продолжит работать.' : 'Сервис снова станет доступен всем пользователям.'}
          confirmLabel={confirmMaint ? 'Включить' : 'Выключить'}
          danger={confirmMaint}
          loading={busy}
          onConfirm={() => void setMaint(confirmMaint)}
          onClose={() => setConfirmMaint(null)}
        />
      )}
    </div>
  );
}
