'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { useTasksStore } from '@/stores/tasks';
import { Sidebar } from '@/components/layout/Sidebar';
import { TaskList } from '@/components/tasks/TaskList';
import { TaskDetail } from '@/components/tasks/TaskDetail';
import { NotificationPrompt } from '@/components/NotificationPrompt';
import { FocusTicker } from '@/components/focus/FocusTicker';
import { EffectsLayer } from '@/components/EffectsLayer';
import { OnboardingTour } from '@/components/OnboardingTour';
import { GlobalQuickAdd } from '@/components/GlobalQuickAdd';
import { ReminderWorker } from '@/components/ReminderWorker';
import { MobileNav } from '@/components/mobile/MobileNav';
import { MobileMoreMenu } from '@/components/mobile/MobileMoreMenu';
import { NotificationCenter } from '@/components/NotificationCenter';
import { api } from '@/lib/api';
import { Loader2, Menu, X, Wrench, Heart } from 'lucide-react';

const MOBILE_TITLES: Record<string, string> = {
  today: 'Сегодня',
  tomorrow: 'Завтра',
  agenda: 'Повестка дня',
  week: 'На этой неделе',
  overdue: 'Просроченные',
  inbox: 'Входящие',
  project: 'Проект',
  calendar: 'Календарь',
  habits: 'Привычки',
  goals: 'Цели',
  focus: 'Фокус',
  birthdays: 'Дни рождения',
  graph: 'Граф',
  pulse: 'Пульс',
  trash: 'Корзина',
  profile: 'Профиль',
  notes: 'Заметки',
  assistant: 'AI Ассистент',
};

function mobileDateLabel(): string {
  const now = new Date();
  const date = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const weekday = now.toLocaleDateString('ru-RU', { weekday: 'long' });
  return `${date}, ${weekday}`;
}

export default function AppPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth, user, maintenance } = useAuthStore();
  const { currentView, setCurrentView, setCurrentProject } = useTasksStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Централизованное событие maintenance от API-клиента: показываем страницу
  // сразу при первом 503, не дожидаясь следующих запросов.
  useEffect(() => {
    const onMaintenance = (e: Event) => {
      const message = (e as CustomEvent).detail?.message || 'Технические работы';
      const { user: u } = useAuthStore.getState();
      if (u?.role !== 'ADMIN') {
        useAuthStore.setState({ maintenance: { message } });
      }
    };
    window.addEventListener('tf:maintenance', onMaintenance);
    return () => window.removeEventListener('tf:maintenance', onMaintenance);
  }, []);

  // Независимая проверка техрежима напрямую с backend (не только через /me):
  // переживает кэши инстансов и срабатывает сразу после refresh.
  useEffect(() => {
    let alive = true;
    api
      .systemStatus()
      .then((s) => {
        if (!alive) return;
        if (s.maintenance.enabled) {
          useAuthStore.setState({ maintenance: { message: s.maintenance.message } });
        } else {
          api.clearMaintenanceKnown();
          useAuthStore.setState({ maintenance: null });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Режим обслуживания включается на backend — обычные пользователи видят
  // этот экран, администраторы продолжают работать (их запросы не блокируются).
  if (maintenance && user?.role !== 'ADMIN') {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#070a12] p-6 text-center text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(139,92,246,.14),transparent_55%),radial-gradient(ellipse_at_50%_110%,rgba(59,130,246,.1),transparent_55%)]" />
        <div className="relative flex w-full max-w-md flex-col items-center rounded-3xl border border-white/[0.07] bg-white/[0.02] px-6 py-10 backdrop-blur">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_32px_-8px_rgba(245,158,11,.5)]">
            <Wrench className="h-8 w-8" />
          </span>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300">
            Технические работы
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Сайт временно недоступен</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">
            Сейчас мы проводим технические работы, чтобы сделать TaskFlow ещё лучше.
          </p>
          <div className="mt-4 w-full rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm leading-6 text-amber-200">
            {maintenance.message}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Пожалуйста, попробуйте зайти немного позже.
            <br />
            Приносим свои извинения за временные неудобства.
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            Спасибо за понимание <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
          </p>
          <div className="mt-6 border-t border-white/[0.07] pt-4 text-xs text-slate-600">
            <span className="font-bold text-slate-300">TaskFlow</span> · Мы скоро вернёмся.
          </div>
        </div>
      </div>
    );
  }

  const initials = (user?.name || user?.email || 'U')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const goProfile = () => {
    setCurrentView('profile');
    setCurrentProject(null);
  };

  return (
    <div className="app-shell relative flex h-[100dvh] min-h-0 w-full max-w-[100vw] overflow-hidden">
      <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
      <main className="mobile-main flex w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden">
        <div className="mobile-app-header flex shrink-0 items-center gap-3 border-b bg-card/95 px-3 py-2 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label={sidebarOpen ? 'Закрыть меню' : 'Открыть меню'}
            onClick={() => setSidebarOpen((open) => !open)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background/70 hover:bg-accent"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold leading-tight">
              {MOBILE_TITLES[currentView] || 'TaskFlow'}
            </div>
            <div className="truncate text-[11px] capitalize text-muted-foreground">
              {mobileDateLabel()}
            </div>
          </div>
          <NotificationCenter />
          <button
            type="button"
            onClick={goProfile}
            aria-label="Профиль"
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/40 bg-primary/10 text-xs font-bold text-primary"
          >
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.name || 'Профиль'} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </button>
        </div>
        <TaskList />
      </main>
      <TaskDetail />
      <NotificationPrompt />
      <FocusTicker />
      <EffectsLayer />
      <OnboardingTour />
      <GlobalQuickAdd />
      <ReminderWorker />
      <MobileNav onMore={() => setMoreOpen(true)} />
      <MobileMoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
