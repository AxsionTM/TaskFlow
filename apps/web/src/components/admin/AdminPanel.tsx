'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Receipt,
  ChartLine,
  ScrollText,
  Settings as SettingsIcon,
  Menu,
  X,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Dashboard } from './Dashboard';
import { Users as UsersSection } from './Users';
import { UserDetail } from './UserDetail';
import { Subscriptions, Transactions, Revenue, Logs, Settings } from './Sections';
import { useToast } from './ui';
import { cn } from '@/lib/utils';

type Section = 'dashboard' | 'users' | 'subscriptions' | 'transactions' | 'revenue' | 'logs' | 'settings';

const NAV: { id: Section; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'revenue', label: 'Revenue', icon: ChartLine },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const TITLES: Record<Section, { title: string; sub: string }> = {
  dashboard: { title: 'Главная', sub: 'Общая статистика и ключевые показатели' },
  users: { title: 'Пользователи', sub: 'Управление пользователями и их активностью' },
  subscriptions: { title: 'Подписки', sub: 'Тарифы, статусы и продления' },
  transactions: { title: 'Транзакции', sub: 'История финансовых операций' },
  revenue: { title: 'Доход', sub: 'Финансовая статистика сервиса' },
  logs: { title: 'Логи', sub: 'Журнал действий администраторов' },
  settings: { title: 'Настройки', sub: 'Состояние системы' },
};

export function AdminPanel() {
  const { user, logout } = useAuthStore();
  const [section, setSection] = useState<Section>('dashboard');
  const [userId, setUserId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { push, node } = useToast();

  const go = (s: Section) => {
    setSection(s);
    setUserId(null);
    setMenuOpen(false);
  };

  const openUser = (id: string) => {
    setUserId(id);
    setSection('users');
    setMenuOpen(false);
  };

  const meta = TITLES[userId ? 'users' : section];

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
          const active = section === n.id && !userId;
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
    <div className="flex min-h-screen bg-[#070a12] text-white">
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
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 lg:hidden"
              aria-label="Открыть меню"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">{userId ? 'Профиль пользователя' : meta.title}</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{userId ? 'Карточка пользователя' : meta.sub}</p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl p-4">
          {section === 'dashboard' && !userId && <Dashboard />}
          {section === 'users' && !userId && <UsersSection onOpen={openUser} />}
          {section === 'users' && userId && <UserDetail id={userId} onBack={() => setUserId(null)} toast={push} />}
          {section === 'subscriptions' && <Subscriptions onOpenUser={openUser} />}
          {section === 'transactions' && <Transactions onOpenUser={openUser} />}
          {section === 'revenue' && <Revenue />}
          {section === 'logs' && <Logs />}
          {section === 'settings' && <Settings />}
        </main>
      </div>
      {node}
    </div>
  );
}
