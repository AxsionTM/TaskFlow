'use client';

import { CalendarCheck, Timer, Network, LayoutGrid, Plus } from 'lucide-react';
import { useTasksStore } from '@/stores/tasks';
import { cn } from '@/lib/utils';

/** Сигнал для глобальной формы создания задачи (GlobalQuickAdd + локальные модалки). */
export function openQuickAdd() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tf:quick-add'));
  }
}

const ITEMS = [
  { id: 'today', label: 'Сегодня', icon: CalendarCheck },
  { id: 'focus', label: 'Фокус', icon: Timer },
] as const;

const RIGHT_ITEMS = [
  { id: 'graph', label: 'Граф', icon: Network },
  { id: 'more', label: 'Ещё', icon: LayoutGrid },
] as const;

/** Нижняя навигация телефона как в референсе: 4 пункта + центральная кнопка «+». */
export function MobileNav({ onMore }: { onMore: () => void }) {
  const { currentView, setCurrentView, setCurrentProject } = useTasksStore();

  const go = (viewId: string) => {
    if (viewId === 'more') {
      onMore();
      return;
    }
    setCurrentView(viewId);
    setCurrentProject(null);
  };

  const renderItem = (item: { id: string; label: string; icon: any }) => {
    const Icon = item.icon;
    const active = currentView === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => go(item.id)}
        className={cn('mobile-nav-item', active && 'mobile-nav-item-active')}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className="mobile-nav-icon" />
        <span className="mobile-nav-label">{item.label}</span>
      </button>
    );
  };

  return (
    <nav className="mobile-bottom-nav lg:hidden" aria-label="Мобильная навигация">
      <div className="mobile-bottom-nav-inner">
        {ITEMS.map(renderItem)}
        <button
          type="button"
          onClick={openQuickAdd}
          className="mobile-nav-fab"
          aria-label="Создать задачу"
        >
          <Plus className="mobile-nav-fab-icon" />
        </button>
        {RIGHT_ITEMS.map(renderItem)}
      </div>
    </nav>
  );
}
