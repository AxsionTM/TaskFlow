'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Pagination, EmptyState, Skeleton, inputCls } from './ui';
import { cn } from '@/lib/utils';

const ROLES = ['', 'USER', 'ADMIN'];
const STATUSES = [
  { id: '', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'blocked', label: 'Заблокированные' },
  { id: 'unverified', label: 'Без email' },
];

type Toast = (text: string, ok?: boolean) => void;

export function Users({ onOpen, toast }: { onOpen: (id: string) => void; toast: Toast }) {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');

  void toast;

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
      const params: Record<string, string> = { page: String(page), pageSize: '20', sort, order };
      if (debounced) params.search = debounced;
      if (role) params.role = role;
      if (status) params.status = status;
      const res = await api.adminUsers(params);
      setUsers(res.users);
      setTotal(res.total);
    } catch {
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debounced, role, status, sort, order]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: email, имя, ID…"
            className={cn(inputCls, 'pl-9')}
          />
        </div>
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">Роль: все</option>
          {ROLES.filter(Boolean).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputCls}>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>Статус: {s.label}</option>)}
        </select>
        <select value={`${sort}:${order}`} onChange={(e) => { const [s, o] = e.target.value.split(':'); setSort(s); setOrder(o); setPage(1); }} className={cn(inputCls, 'xl:col-span-4')}>
          <option value="createdAt:desc">Сначала новые</option>
          <option value="createdAt:asc">Сначала старые</option>
          <option value="email:asc">Email А–Я</option>
          <option value="lastActiveAt:desc">Активность ↓</option>
        </select>
      </div>

      <div className="text-xs text-muted-foreground">Найдено: {total}</div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : users.length === 0 ? (
        <EmptyState text="Пользователи не найдены" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20 text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Registration Date</th>
                <th className="px-3 py-2.5 font-medium">Last Login</th>
                <th className="px-3 py-2.5 font-medium">Tasks</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => onOpen(u.id)}
                  className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-accent/50"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {(u.name || u.email || '?').slice(0, 2).toUpperCase()}
                      </span>
                      <span className="max-w-[150px] truncate font-medium">{u.name || '—'}</span>
                    </div>
                  </td>
                  <td className="max-w-[210px] truncate px-3 py-2.5">{u.email}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', u.role === 'ADMIN' ? 'bg-violet-500/15 text-violet-400' : 'bg-muted text-muted-foreground')}>
                      {u.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('ru-RU') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                    {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{u.taskCount ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    {u.isBlocked ? (
                      <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">Заблокирован</span>
                    ) : !u.emailVerified ? (
                      <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">Без email</span>
                    ) : (
                      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">Активен</span>
                    )}
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
