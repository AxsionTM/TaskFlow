'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  ListTodo,
  CheckCircle2,
  CircleDashed,
  Bug,
  Search,
  Bell,
  Server,
  ScrollText,
  Wrench,
  Plus,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { StatCard, LineChart, Skeleton, Field, inputCls } from './ui';
import type { AdminSection } from './AdminPanel';

type Toast = (text: string, ok?: boolean) => void;

const QUICK: { id: string; label: string; icon: any; action: string }[] = [
  { id: 'create-user', label: 'Создать пользователя', icon: UserPlus, action: 'create-user' },
  { id: 'find-user', label: 'Найти пользователя', icon: Search, action: 'find-user' },
  { id: 'view-tasks', label: 'Просмотреть задачи', icon: ListTodo, action: 'view-tasks' },
  { id: 'send-notify', label: 'Отправить уведомление', icon: Bell, action: 'send-notify' },
  { id: 'view-errors', label: 'Просмотреть ошибки', icon: Bug, action: 'view-errors' },
  { id: 'audit', label: 'Audit Log', icon: ScrollText, action: 'audit' },
  { id: 'system', label: 'System Status', icon: Server, action: 'system' },
  { id: 'maintenance', label: 'Maintenance Mode', icon: Wrench, action: 'maintenance' },
];

export function Dashboard({
  toast,
  onOpenUser,
  onOpenTask,
  go,
}: {
  toast: Toast;
  onOpenUser: (id: string) => void;
  onOpenTask: (id: string) => void;
  go: (s: AdminSection) => void;
}) {
  const [stats, setStats] = useState<any>(null);
  const [system, setSystem] = useState<any>(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  void onOpenUser;
  void onOpenTask;

  useEffect(() => {
    Promise.all([api.adminStats(), api.adminSettings().catch(() => null)])
      .then(([s, sys]) => {
        setStats(s);
        setSystem(sys);
      })
      .catch((e) => setError(e.message || 'Ошибка загрузки'));
  }, []);

  const runQuick = (action: string) => {
    switch (action) {
      case 'create-user':
        setShowCreate(true);
        break;
      case 'find-user':
        go('users');
        break;
      case 'view-tasks':
        go('tasks');
        break;
      case 'send-notify':
        go('notifications');
        break;
      case 'view-errors':
        go('errors');
        break;
      case 'audit':
        go('logs');
        break;
      case 'system':
      case 'maintenance':
        go('system');
        break;
    }
  };

  const createUser = async () => {
    if (!email.trim() || password.length < 6) {
      toast('Email и пароль от 6 символов обязательны', false);
      return;
    }
    setBusy(true);
    try {
      const res = await api.adminCreateUser({ email: email.trim(), password, name: name.trim() || undefined });
      toast(`Пользователь создан: ${res.user.email}`);
      setShowCreate(false);
      setEmail('');
      setPassword('');
      setName('');
      const s = await api.adminStats();
      setStats(s);
    } catch (e: any) {
      toast(e.message || 'Не удалось создать пользователя', false);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>;
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Всего пользователей" value={String(stats.totalUsers)} color="#3b82f6" sub={`Новых сегодня: ${stats.newToday}`} />
        <StatCard label="Активных (24ч)" value={String(stats.activeUsers)} color="#22c55e" sub={`Неделя: ${stats.newWeek} · Месяц: ${stats.newMonth}`} />
        <StatCard label="Всего задач" value={String(stats.totalTasks)} color="#a855f7" sub={`Открытых: ${stats.openTasks}`} />
        <StatCard label="Задач сегодня" value={String(stats.tasksToday)} color="#38bdf8" sub={`Завершено: ${stats.tasksCompletedToday}`} />
        <StatCard label="Незавершённые" value={String(stats.openTasks)} color="#f59e0b" />
        <StatCard label="Ошибки (active)" value={String(stats.unresolvedErrors)} color={stats.unresolvedErrors > 0 ? '#ef4444' : '#22c55e'} sub="Нерешённые 5xx" />
        <StatCard label="Backend" value={system ? 'Online' : '…'} color="#22c55e" sub={system ? `env: ${system.environment}` : undefined} />
        <StatCard label="Database" value={system?.dbStatus === 'ok' ? 'Connected' : system ? 'Error' : '…'} color={system?.dbStatus === 'ok' ? '#22c55e' : '#ef4444'} sub={system?.dbLatencyMs != null ? `${system.dbLatencyMs} ms` : undefined} />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4 text-violet-400" /> Quick Actions
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => runQuick(q.action)}
                className="flex min-h-[64px] flex-col items-start justify-center gap-1.5 rounded-2xl border border-border/60 bg-background/40 p-3 text-left transition-colors hover:border-violet-500/50 hover:bg-violet-500/10"
              >
                <Icon className="h-4 w-4 text-violet-300" />
                <span className="text-xs font-semibold leading-tight">{q.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-sky-400" /> Регистрации</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">Последние 30 дней</p>
          <LineChart data={stats.registrationsByDay.map((d: any) => ({ date: d.date, value: d.count }))} color="#3b82f6" />
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><ListTodo className="h-4 w-4 text-violet-400" /> Активность задач</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">Созданные задачи в день, 30 дней</p>
          <LineChart data={stats.activityByDay.map((d: any) => ({ date: d.date, value: d.count }))} color="#a855f7" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-4">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-400" />
          <div><div className="text-lg font-bold tabular-nums">{stats.tasksCompletedToday}</div><div className="text-xs text-muted-foreground">завершено сегодня</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-4">
          <CircleDashed className="h-8 w-8 shrink-0 text-amber-400" />
          <div><div className="text-lg font-bold tabular-nums">{stats.openTasks}</div><div className="text-xs text-muted-foreground">открытых задач</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-4">
          <Bug className="h-8 w-8 shrink-0 text-red-400" />
          <div><div className="text-lg font-bold tabular-nums">{stats.unresolvedErrors}</div><div className="text-xs text-muted-foreground">ошибок требуют внимания</div></div>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-sm rounded-t-3xl border border-border/60 bg-card p-5 sm:rounded-3xl">
            <h3 className="mb-4 text-base font-bold">Создать пользователя</h3>
            <div className="space-y-3">
              <Field label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="user@example.com" />
              </Field>
              <Field label="Имя">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Имя" />
              </Field>
              <Field label="Пароль (мин. 6 символов)">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••" />
              </Field>
              <button type="button" onClick={() => void createUser()} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
