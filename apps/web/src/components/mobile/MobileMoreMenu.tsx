'use client';

import {
  CalendarClock,
  ListTodo,
  CalendarDays,
  Columns3,
  Grid2x2,
  Flame,
  Target,
  Gift,
  Trash2,
  User,
  X,
  StickyNote,
  Bot,
} from 'lucide-react';
import { useTasksStore, type DisplayMode } from '@/stores/tasks';
import { ThemePicker } from '@/components/ThemePicker';
import { cn } from '@/lib/utils';

const TILES: { id: string; label: string; icon: any; mode?: DisplayMode }[] = [
  { id: 'tomorrow', label: 'Завтра', icon: CalendarClock },
  { id: 'agenda', label: 'Повестка дня', icon: ListTodo },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays },
  { id: 'today', label: 'Канбан', icon: Columns3, mode: 'kanban' },
  { id: 'today', label: 'Матрица', icon: Grid2x2, mode: 'matrix' },
  { id: 'habits', label: 'Привычки', icon: Flame },
  { id: 'goals', label: 'Цели', icon: Target },
  { id: 'birthdays', label: 'Дни рождения', icon: Gift },
  { id: 'notes', label: 'Заметки', icon: StickyNote },
  { id: 'assistant', label: 'AI Ассистент', icon: Bot },
  { id: 'trash', label: 'Корзина', icon: Trash2 },
  { id: 'profile', label: 'Профиль', icon: User },
];

export function MobileMoreMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentView, displayMode, setCurrentView, setCurrentProject, setDisplayMode } = useTasksStore();

  if (!open) return null;

  const go = (tile: (typeof TILES)[number]) => {
    setCurrentView(tile.id);
    setCurrentProject(null);
    if (tile.mode) setDisplayMode(tile.mode);
    else if (tile.id !== 'today') {
      if (displayMode !== 'list') setDisplayMode('list');
    }
    onClose();
  };

  return (
    <div className="mobile-sheet-root lg:hidden" role="dialog" aria-modal="true" aria-label="Ещё">
      <button type="button" aria-label="Закрыть меню" className="mobile-sheet-backdrop" onClick={onClose} />
      <div className="mobile-sheet">
        <div className="mobile-sheet-handle" />
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-lg font-bold">Ещё</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 text-muted-foreground"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            const active = tile.mode
              ? displayMode === tile.mode
              : currentView === tile.id && (tile.id !== 'today' || displayMode === 'list');
            return (
              <button
                key={tile.label}
                type="button"
                onClick={() => go(tile)}
                className={cn('mobile-more-tile', active && 'mobile-more-tile-active')}
              >
                <Icon className="mobile-more-tile-icon" />
                <span>{tile.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 rounded-2xl border border-border/60 bg-card/50 px-3 py-1.5">
          <ThemePicker />
        </div>
      </div>
    </div>
  );
}
