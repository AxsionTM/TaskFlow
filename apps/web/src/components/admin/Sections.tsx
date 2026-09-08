'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Pagination, EmptyState, Skeleton, StatCard, LineChart, DonutChart, inputCls, fmtDate, fmtDay, fmtMoney, fmtNum } from './ui';
import { cn } from '@/lib/utils';

function usePaged<T>(loader: (page: number) => Promise<{ items: T[]; total: number }>, deps: unknown[]) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    loader(page)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...(deps as unknown[])]);
  return { items, total, page, setPage, loading, reset: () => setPage(1) };
}

export function Subscriptions({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<any>(null);
  const { items, total, page, setPage, loading, reset } = usePaged(
    async (p) => {
      const params: Record<string, string> = { page: String(p), pageSize: '20' };
      if (plan) params.plan = plan;
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();
      const r = await api.adminSubscriptions(params);
      setStats(r.stats);
      return { items: r.subscriptions, total: r.total };
    },
    [plan, status, search]
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Активные" value={String(stats?.active ?? '—')} color="#22c55e" />
        <StatCard label="Истекшие" value={String(stats?.expired ?? '—')} color="#f59e0b" />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder="Поиск по пользователю…" className={inputCls} />
        <select value={plan} onChange={(e) => { setPlan(e.target.value); reset(); }} className={inputCls}>
          <option value="">Тариф: все</option>
          <option value="FREE">FREE</option>
          <option value="PRO">PRO</option>
          <option value="BUSINESS">BUSINESS</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} className={inputCls}>
          <option value="">Статус: все</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState text="Подписки не найдены" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20 text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Пользователь</th>
                <th className="px-3 py-2.5 font-medium">Тариф</th>
                <th className="px-3 py-2.5 font-medium">Цена</th>
                <th className="px-3 py-2.5 font-medium">Начало</th>
                <th className="px-3 py-2.5 font-medium">Окончание</th>
                <th className="px-3 py-2.5 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s: any) => (
                <tr key={s.id} onClick={() => s.user && onOpenUser(s.user.id)} className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-accent/50">
                  <td className="max-w-[220px] truncate px-3 py-2.5">{s.user ? `${s.user.name || '—'} · ${s.user.email}` : s.userId}</td>
                  <td className="px-3 py-2.5 font-semibold">{s.plan}</td>
                  <td className="px-3 py-2.5 tabular-nums">{s.price > 0 ? `${s.price} ₽` : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{fmtDay(s.startedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{s.endsAt ? fmtDay(s.endsAt) : '∞'}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', s.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground')}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
    </div>
  );
}

const TX_TYPES = ['', 'DEPOSIT', 'WITHDRAWAL', 'SUBSCRIPTION', 'REFUND', 'ADJUSTMENT'];

export function Transactions({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const { items, total, page, setPage, loading, reset } = usePaged(
    async (p) => {
      const params: Record<string, string> = { page: String(p), pageSize: '20' };
      if (type) params.type = type;
      if (search.trim()) params.search = search.trim();
      const r = await api.adminTransactions(params);
      return { items: r.transactions, total: r.total };
    },
    [type, search]
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder="Поиск по пользователю…" className={inputCls} />
        <select value={type} onChange={(e) => { setType(e.target.value); reset(); }} className={inputCls}>
          <option value="">Тип: все</option>
          {TX_TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState text="Транзакции не найдены" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20 text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">ID</th>
                <th className="px-3 py-2.5 font-medium">Пользователь</th>
                <th className="px-3 py-2.5 font-medium">Тип</th>
                <th className="px-3 py-2.5 font-medium">Сумма</th>
                <th className="px-3 py-2.5 font-medium">До → После</th>
                <th className="px-3 py-2.5 font-medium">Описание</th>
                <th className="px-3 py-2.5 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t: any) => (
                <tr key={t.id} onClick={() => t.user && onOpenUser(t.user.id)} className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-accent/50">
                  <td className="max-w-[110px] truncate px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{t.id}</td>
                  <td className="max-w-[200px] truncate px-3 py-2.5">{t.user ? t.user.email : t.userId}</td>
                  <td className="px-3 py-2.5"><span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold">{t.type}</span></td>
                  <td className={cn('px-3 py-2.5 font-semibold tabular-nums', t.amount >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {t.amount >= 0 ? '+' : ''}{t.amount}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-xs text-muted-foreground">{t.balanceBefore} → {t.balanceAfter}</td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-muted-foreground">{t.description || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
    </div>
  );
}

export function Revenue() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.adminRevenue().then(setData).catch((e) => setError(e.message || 'Ошибка'));
  }, []);

  if (error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>;
  if (!data) return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard label="Всего" value={fmtMoney(data.total)} color="#22c55e" />
        <StatCard label="Сегодня" value={fmtMoney(data.today)} color="#34d399" />
        <StatCard label="Неделя" value={fmtMoney(data.week)} color="#2dd4bf" />
        <StatCard label="Месяц" value={fmtMoney(data.month)} color="#38bdf8" />
        <StatCard label="Год" value={fmtMoney(data.year)} color="#818cf8" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <h3 className="mb-1 text-sm font-semibold">График дохода</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">30 дней, ₽</p>
          <LineChart data={data.revenueByDay.map((d: any) => ({ date: d.date, value: d.amount }))} color="#22c55e" />
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <h3 className="mb-3 text-sm font-semibold">Доход по тарифам</h3>
          <DonutChart
            center={fmtMoney(data.total)}
            segments={(data.byPlan.length ? data.byPlan : [{ plan: 'Нет данных', amount: 0, count: 0 }]).map((p: any, i: number) => ({
              label: `${p.plan} · ${p.count} подп.`,
              value: p.amount,
              color: ['#a855f7', '#f59e0b', '#64748b', '#38bdf8'][i % 4],
            }))}
          />
        </div>
      </div>
    </div>
  );
}

const LOG_ACTIONS = ['', 'BALANCE_DEPOSIT', 'BALANCE_WITHDRAW', 'PLAN_CHANGE', 'USER_BLOCK', 'USER_UNBLOCK', 'ROLE_CHANGE', 'USER_RENAME'];

export function Logs() {
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const { items, total, page, setPage, loading, reset } = usePaged(
    async (p) => {
      const params: Record<string, string> = { page: String(p), pageSize: '20' };
      if (action) params.action = action;
      if (search.trim()) params.search = search.trim();
      const r = await api.adminLogs(params);
      return { items: r.logs, total: r.total };
    },
    [action, search]
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder="Поиск: admin, описание, user ID…" className={inputCls} />
        <select value={action} onChange={(e) => { setAction(e.target.value); reset(); }} className={inputCls}>
          <option value="">Действие: все</option>
          {LOG_ACTIONS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
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
                <span className="text-muted-foreground">{l.adminEmail}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">{fmtDate(l.createdAt)}</span>
              </div>
              {l.description && <div className="mt-1">{l.description}</div>}
              {(l.oldValue || l.newValue) && (
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {l.oldValue ? `− ${l.oldValue}` : ''} {l.newValue ? `→ ${l.newValue}` : ''}
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

export function Settings() {
  const [data, setData] = useState<any>(null);
  const load = useCallback(() => {
    api.adminSettings().then(setData).catch(() => setData({ error: true }));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Skeleton className="h-48" />;
  if (data.error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">Не удалось загрузить статус</div>;

  const rows: [string, string, boolean?][] = [
    ['Environment', data.environment],
    ['API status', data.apiStatus, data.apiStatus === 'ok'],
    ['Database status', data.dbStatus, data.dbStatus === 'ok'],
    ['Version', data.version],
    ['Email configured', data.emailConfigured ? 'yes' : 'no', !!data.emailConfigured],
    ['Total users', fmtNum(data.totalUsers)],
    ['Active subscriptions', fmtNum(data.activeSubscriptions)],
    ['Timestamp', fmtDate(data.timestamp)],
  ];
  return (
    <div className="max-w-2xl rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold">Состояние сервиса</h3>
      <div className="divide-y divide-border/40">
        {rows.map(([k, v, ok]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className={cn('font-medium', ok === true && 'text-emerald-400', ok === false && 'text-red-400')}>{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Секреты (DATABASE_URL, JWT_SECRET, EMAIL_PASSWORD) здесь никогда не показываются.</p>
    </div>
  );
}
