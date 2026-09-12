'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  ListTodo,
  Bell,
  Bug,
  ScrollText,
  Server,
  Menu,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Dashboard } from './Dashboard';
import { Users as UsersSection } from './Users';
import { UserDetail } from './UserDetail';
import { Tasks as TasksSection } from './Tasks';
import { Notifications, Errors, Logs, System } from './Sections';
import { GlobalSearch } from './GlobalSearch';
import { useToast } from './ui';
import { cn } from '@/lib/utils';

export type AdminSection =
  | 'dashboard'
  | 'users'
  | 'tasks'
  | 'notifications'
  | 'errors'
  | 'logs'
  | 'system';

const NAV: { id: AdminSection; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'errors', label: 'Errors', icon: Bug },
  { id: 'logs', label: 'Audit Log', icon: ScrollText },
  { id: 'system', label: 'System', icon: Server },
];

const TITLES: Record<AdminSection, { title: string; sub: string }> = {
  dashboard: { title: 'Главная', sub: 'Статистика сервиса и быстрые действия' },
  users: { title: 'Пользователи', sub: 'Управление пользователями' },
  tasks: { title: 'Задачи', sub: 'Задачи всех пользователей' },
  notifications: { title: 'Уведомления', sub: 'Массовые системные уведомления' },
  errors: { title: 'Ошибки', sub: 'Error Center: реальные ошибки приложения' },
  logs: { title: 'Audit Log', sub: 'Журнал действий администраторов' },
  system: { title: 'Система', sub: 'Статус, флаги и обслуживание' },
};

export function AdminPanel() {
  const { user, logout } = useAuthStore();
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [userId, setUserId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { push, node } = useToast();

  const go = (s: AdminSection) => {
    setSection(s);
    setUserId(null);
    setTaskId(null);
    setMenuOpen(false);
  };

  const openUser = (id: string) => {
    setUserId(id);
    setTaskId(null);
    setSection('users');
    setMenuOpen(false);
  };

  const openTask = (id: string) => {
    setTaskId(id);
    setUserId(null);
    setSection('tasks');
    setMenuOpen(false);
  };

  const meta = TITLES[userId || taskId ? (userId ? 'users' : 'tasks') : section];

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm font-bold">TaskFlow</div>
          <div className="text-[11px] text-muted-foreground">Админ-панель</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = section === n.id && !userId && !taskId;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => go(n.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/40' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {n.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-border/50 p-3">
        <div className="mb-2 truncate px-1 text-xs text-muted-foreground">{user?.email}</div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Выйти
        </button>
      </div>
    </div>
  );

  return (
    <div className="tf-admin flex min-h-screen bg-[#070a12] text-white">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-white/[0.07] bg-[#0a0f1e] lg:block">
        {nav}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button type="button" aria-label="Закрыть меню" className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-[#0a0f1e] shadow-2xl">{nav}</aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-[50] border-b border-white/[0.07] bg-[#070a12]/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 lg:hidden"
              aria-label="Открыть меню"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">
                {userId ? 'Профиль пользователя' : taskId ? 'Задача' : meta.title}
              </h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                {userId ? 'Карточка пользователя' : taskId ? 'Карточка задачи' : meta.sub}
              </p>
            </div>
            <div className="hidden w-full max-w-xs md:block">
              <GlobalSearch onOpenUser={openUser} onOpenTask={openTask} />
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin
            </span>
          </div>
          <div className="px-4 pb-3 md:hidden">
            <GlobalSearch onOpenUser={openUser} onOpenTask={openTask} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl p-4">
          {section === 'dashboard' && !userId && !taskId && (
            <Dashboard toast={push} onOpenUser={openUser} onOpenTask={openTask} go={go} />
          )}
          {section === 'users' && !userId && <UsersSection onOpen={openUser} toast={push} />}
          {section === 'users' && userId && (
            <UserDetail id={userId} onBack={() => setUserId(null)} onOpenTask={openTask} toast={push} />
          )}
          {section === 'tasks' && !taskId && <TasksSection onOpen={openTask} initialTaskId={null} toast={push} />}
          {section === 'tasks' && taskId && (
            <TasksSection onOpen={openTask} initialTaskId={taskId} onBack={() => setTaskId(null)} toast={push} />
          )}
          {section === 'notifications' && <Notifications toast={push} />}
          {section === 'errors' && <Errors toast={push} />}
          {section === 'logs' && <Logs />}
          {section === 'system' && <System toast={push} />}
        </main>
      </div>
      {node}
    </div>
  );
}
