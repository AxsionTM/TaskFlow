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
import { Loader2, Menu, X } from 'lucide-react';

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
};

function mobileDateLabel(): string {
  const now = new Date();
  const date = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const weekday = now.toLocaleDateString('ru-RU', { weekday: 'long' });
  return `${date}, ${weekday}`;
}

export default function AppPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth, user } = useAuthStore();
  const { currentView, setCurrentView, setCurrentProject } = useTasksStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

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
