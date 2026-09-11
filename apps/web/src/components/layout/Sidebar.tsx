'use client';

import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Folder,
  Inbox,
  Plus,
  Target,
  Timer,
  Search,
  Trash2,
  ListTodo,
  Activity,
  Sparkles,
  Network,
  AlarmClock,
  Flame,
  Gift,
  StickyNote,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { useTasksStore } from '@/stores/tasks';
import { useFocusStore, formatRemaining } from '@/stores/focus';
import { cn } from '@/lib/utils';
import { ThemePicker } from '@/components/ThemePicker';
import { Logo } from '@/components/Logo';
import { useEffectsStore } from '@/stores/effects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from 'next-themes';
import { SearchDialog } from './SearchDialog';

const smartViews = [
  { id: 'today', label: 'Сегодня', icon: CalendarCheck },
  { id: 'tomorrow', label: 'Завтра', icon: CalendarClock },
  { id: 'agenda', label: 'Повестка дня', icon: ListTodo },
  { id: 'week', label: 'На этой неделе', icon: CalendarRange },
  { id: 'overdue', label: 'Просроченные', icon: AlarmClock },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

/**
 * Кнопка «Фокус» с живой подпиской только внутри себя.
 * Причина: раньше весь Sidebar подписывался на remainingSeconds и
 * перерисовывался 4 раза в секунду во время фокус-сессии.
 */
function FocusNavButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const focusRunning = useFocusStore((s) => s.isRunning);
  const focusPaused = useFocusStore((s) => s.isPaused);
  const focusRemaining = useFocusStore((s) => s.remainingSeconds);
  const focusMode = useFocusStore((s) => s.mode);

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        active ? 'tf-nav-active' : 'text-foreground hover:bg-accent',
        focusRunning && !focusPaused && 'ring-1 ring-emerald-500/50 bg-emerald-500/10'
      )}
    >
      <Timer className={cn('h-4 w-4', focusRunning && !focusPaused && 'text-emerald-500')} />
      <span className="flex-1 text-left">Фокус</span>
      {focusRunning && (
        <span
          className={cn(
            'text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full',
            focusPaused
              ? 'bg-muted text-muted-foreground'
              : focusMode === 'break'
                ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 animate-pulse'
          )}
        >
          {formatRemaining(focusRemaining)}
        </span>
      )}
    </button>
  );
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const { user } = useAuthStore();
  const { projects, fetchProjects, createProject, deleteProject } = useProjectsStore();
  const { currentView, setCurrentView, setCurrentProject, overdueTasks, fetchOverdue } =
    useTasksStore();
  const { theme, setTheme } = useTheme();
  const effectsEnabled = useEffectsStore((s) => s.enabled);
  const toggleEffects = useEffectsStore((s) => s.toggle);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchOverdue();
  }, [fetchProjects, fetchOverdue]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleViewClick = (viewId: string) => {
    setCurrentView(viewId);
    setCurrentProject(null);
    onMobileClose?.();
  };

  const handleProjectClick = (projectId: string, isInbox?: boolean) => {
    if (isInbox) {
      setCurrentView('inbox');
      setCurrentProject(null);
      onMobileClose?.();
      return;
    }
    setCurrentView('project');
    setCurrentProject(projectId);
    onMobileClose?.();
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || creating) return;
    setCreating(true);
    try {
      await createProject({ name: newProjectName.trim() });
      setNewProjectName('');
      setShowNewProject(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          onClick={() => onMobileClose?.()}
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}
      <aside data-tour="sidebar" className={cn(
        'app-sidebar fixed inset-y-0 left-0 z-[100] flex h-[100dvh] w-[min(18rem,88vw)] flex-col border-r bg-card tf-glow-border shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:h-full lg:w-60 lg:translate-x-0 lg:shadow-none',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Logo size={32} />
          <span className="font-semibold text-sm">TaskFlow</span>
        </div>

        <div className="px-3 py-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-muted-foreground"
            size="sm"
            onClick={() => { setSearchOpen(true); onMobileClose?.(); }}
          >
            <Search className="h-4 w-4" />
            Поиск...
            <kbd className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-1">
          <div className="space-y-0.5">
            {smartViews.map((view) => {
              const Icon = view.icon;
              const isActive = currentView === view.id;
              const count = view.id === 'overdue' ? overdueTasks.length : undefined;

              return (
                <button
                  key={view.id}
                  onClick={() => handleViewClick(view.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'tf-nav-active'
                      : 'text-foreground hover:bg-accent'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{view.label}</span>
                  {count !== undefined && count > 0 && (
                    <span className="ml-auto text-xs text-red-500 font-medium">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4" data-tour="projects">
            <div className="flex items-center px-2 py-1">
              <button
                onClick={() => setProjectsOpen(!projectsOpen)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground"
              >
                {projectsOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Проекты
              </button>
              <button
                onClick={() => setShowNewProject(true)}
                className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground"
                title="Новый проект"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {showNewProject && (
              <form onSubmit={handleCreateProject} className="px-2 py-1">
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Название проекта"
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowNewProject(false);
                  }}
                  disabled={creating}
                />
              </form>
            )}

            {projectsOpen && (
              <div className="mt-0.5 space-y-0.5">
                {projects.map((project) => {
                  const isActive =
                    currentView === 'project' &&
                    useTasksStore.getState().currentProjectId === project.id;

                  return (
                    <div
                      key={project.id}
                      className={cn(
                        'group flex w-full items-center gap-1 rounded-md pr-1 transition-colors',
                        isActive
                          ? 'tf-nav-active'
                          : 'text-foreground hover:bg-accent'
                      )}
                    >
                      <button
                        onClick={() => handleProjectClick(project.id, project.isInbox)}
                        className="flex flex-1 items-center gap-2 px-2 py-1.5 text-sm min-w-0"
                      >
                        {project.isInbox ? (
                          <Inbox className="h-4 w-4 shrink-0" style={{ color: project.color }} />
                        ) : (
                          <Folder className="h-4 w-4 shrink-0" style={{ color: project.color }} />
                        )}
                        <span className="truncate">{project.name}</span>
                        {project.taskCount !== undefined && project.taskCount > 0 && (
                          <span className="ml-auto text-xs text-muted-foreground group-hover:hidden">
                            {project.taskCount}
                          </span>
                        )}
                      </button>
                      {!project.isInbox && (
                        <button
                          type="button"
                          title="Удалить проект"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Удалить проект «${project.name}»?`)) return;
                            try {
                              await deleteProject(project.id);
                              if (useTasksStore.getState().currentProjectId === project.id) {
                                setCurrentView('today');
                                setCurrentProject(null);
                              }
                            } catch (err: any) {
                              alert(err.message || 'Не удалось удалить');
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 space-y-0.5" data-tour="modules">
            <button
              onClick={() => handleViewClick('habits')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                currentView === 'habits'
                  ? 'tf-nav-active'
                  : 'text-foreground hover:bg-accent'
              )}
            >
              <Flame className="h-4 w-4" />
              Привычки
            </button>
            <button
              onClick={() => handleViewClick('goals')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                currentView === 'goals'
                  ? 'tf-nav-active'
                  : 'text-foreground hover:bg-accent'
              )}
            >
              <Target className="h-4 w-4" />
              Цели
            </button>
            <FocusNavButton
              active={currentView === 'focus'}
              onClick={() => handleViewClick('focus')}
            />
            <button
              onClick={() => handleViewClick('notes')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                currentView === 'notes'
                  ? 'tf-nav-active'
                  : 'text-foreground hover:bg-accent'
              )}
            >
              <StickyNote className="h-4 w-4" />
              Заметки
            </button>
            <button
              onClick={() => handleViewClick('birthdays')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                currentView === 'birthdays'
                  ? 'tf-nav-active'
                  : 'text-foreground hover:bg-accent'
              )}
            >
              <Gift className="h-4 w-4" />
              Дни рождения
            </button>
            <button
              onClick={() => handleViewClick('graph')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                currentView === 'graph'
                  ? 'tf-nav-active'
                  : 'text-foreground hover:bg-accent'
              )}
            >
              <Network className="h-4 w-4" />
              Граф
            </button>
            <button
              onClick={() => handleViewClick('pulse')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                currentView === 'pulse'
                  ? 'tf-nav-active'
                  : 'text-foreground hover:bg-accent'
              )}
            >
              <Activity className="h-4 w-4" />
              Пульс
            </button>
            <button
              onClick={() => handleViewClick('trash')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                currentView === 'trash'
                  ? 'tf-nav-active'
                  : 'text-foreground hover:bg-accent'
              )}
            >
              <Trash2 className="h-4 w-4" />
              Корзина
            </button>
          </div>
        </nav>

        <div className="border-t p-2 space-y-1" data-tour="theme">
          <ThemePicker />
          <button
            type="button"
            onClick={toggleEffects}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Sparkles className="h-4 w-4" />
            <span className="flex-1 text-left">Эффекты</span>
            <span className="text-[10px] text-muted-foreground">
              {effectsEnabled ? 'Вкл' : 'Выкл'}
            </span>
          </button>

          <button
            onClick={() => handleViewClick('profile')}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
              currentView === 'profile' ? 'tf-nav-active' : 'text-foreground hover:bg-accent'
            )}
          >
            <Logo size={18} />
            <span className="truncate flex-1 text-left">{user?.name || 'Профиль'}</span>
          </button>
        </div>
      </aside>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
