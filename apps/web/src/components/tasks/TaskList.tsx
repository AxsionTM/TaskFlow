'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTasksStore, type DisplayMode } from '@/stores/tasks';
import { useProjectsStore } from '@/stores/projects';
import { TaskItem } from './TaskItem';
import { QuickAdd } from './QuickAdd';
import { KanbanBoard } from '@/components/views/KanbanBoard';
import { CalendarView } from '@/components/views/CalendarView';
import { EisenhowerMatrix } from '@/components/views/EisenhowerMatrix';
import { HabitsView } from '@/components/habits/HabitsView';
import { GoalsView } from '@/components/goals/GoalsView';
import { FocusView } from '@/components/focus/FocusView';
import { TrashView } from '@/components/tasks/TrashView';
import { AgendaView } from '@/components/views/AgendaView';
import { PulseView } from '@/components/views/PulseView';
import { ProfileView } from '@/components/views/ProfileView';
import { BirthdaysView } from '@/components/views/BirthdaysView';
import { GraphView } from '@/components/views/GraphView';
import { NotesView } from '@/components/views/NotesView';
import { TodayDashboard } from '@/components/views/TodayDashboard';
import { TomorrowView } from '@/components/views/TomorrowView';
import { WeekView } from '@/components/views/WeekView';
import { OverdueView } from '@/components/views/OverdueView';
import { InboxView } from '@/components/views/InboxView';
import { Loader2, List, Columns3, Grid2x2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

const viewTitles: Record<string, string> = {
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: 'На этой неделе',
  overdue: 'Просроченные',
  habits: 'Привычки',
  goals: 'Цели',
  focus: 'Фокус',
  birthdays: 'Дни рождения',
  graph: 'Граф',
  inbox: 'Входящие',
  project: 'Проект',
  calendar: 'Календарь',
};

const DISPLAY_MODES: { id: DisplayMode; label: string; icon: typeof List }[] = [
  { id: 'list', label: 'Список', icon: List },
  { id: 'kanban', label: 'Канбан', icon: Columns3 },
  { id: 'matrix', label: 'Матрица', icon: Grid2x2 },
];

export function TaskList() {
  const {
    todayTasks,
    overdueTasks,
    tasks,
    isLoading,
    currentView,
    currentProjectId,
    displayMode,
    setDisplayMode,
    refreshCurrentView,
  } = useTasksStore();
  const { projects } = useProjectsStore();
  const [aiPrioritizing, setAiPrioritizing] = useState(false);

  const prioritizeToday = async () => {
    if (aiPrioritizing) return;
    const candidates = todayTasks.filter((task: any) => task.status !== 'COMPLETED' && !task.parentId);
    if (!candidates.length) return;
    setAiPrioritizing(true);
    try {
      await Promise.all(candidates.map(async (task: any) => {
        let priority: string | null = null;
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/priority`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.getToken()}` },
            body: JSON.stringify({ title: task.title, description: task.description }),
          });
          if (res.ok) priority = (await res.json()).priority || null;
        } catch {}
        if (priority) await api.updateTask(task.id, { priority });
      }));
      await refreshCurrentView();
    } finally {
      setAiPrioritizing(false);
    }
  };

  useEffect(() => {
    if (
      currentView !== 'habits' &&
      currentView !== 'goals' &&
      currentView !== 'focus' &&
      currentView !== 'trash' &&
      currentView !== 'agenda' &&
      currentView !== 'pulse' &&
      currentView !== 'profile' &&
      currentView !== 'graph' &&
      currentView !== 'notes'
    ) {
      refreshCurrentView();
    }
  }, [currentView, currentProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayTasks =
    currentView === 'today'
      ? todayTasks
      : currentView === 'overdue'
      ? overdueTasks
      : tasks;

  // Hooks must run on every render. Keep this before the view-specific early returns
  // so switching between normal views and Agenda/Graph/etc. never changes hook order.
  const weekGroups = useMemo(() => {
    if (currentView !== 'week' && currentView !== 'inbox') return [];
    const groups = new Map<string, any[]>();
    for (const task of displayTasks) {
      const d = task.startDate || task.dueDate;
      const key = d
        ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'Без даты';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(task);
    }
    return Array.from(groups.entries());
  }, [currentView, displayTasks]);

  if (currentView === 'habits') return <HabitsView />;
  if (currentView === 'goals') return <GoalsView />;
  if (currentView === 'focus') return <FocusView />;
  if (currentView === 'trash') return <TrashView />;
  if (currentView === 'agenda') return <AgendaView />;
  if (currentView === 'pulse') return <PulseView />;
  if (currentView === 'profile') return <ProfileView />;
  if (currentView === 'birthdays') return <BirthdaysView />;
  if (currentView === 'graph') return <GraphView />;
  if (currentView === 'calendar') return <CalendarView />;
  if (currentView === 'notes') return <NotesView />;
  if (currentView === 'overdue' && displayMode === 'list') return <OverdueView />;
  if (currentView === 'inbox' && displayMode === 'list') return <InboxView />;

  let title = viewTitles[currentView] || 'Задачи';
  if (currentView === 'project' && currentProjectId) {
    const project = projects.find((p) => p.id === currentProjectId);
    if (project) title = project.name;
  }

  return (
    <div className="tf-task-list flex-1 min-w-0 max-w-full flex flex-col min-h-0 overflow-hidden">
      <header data-tour="views" className="tf-task-header shrink-0 px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {displayMode === 'list' && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {displayTasks.length}{' '}
              {displayTasks.length === 1
                ? 'задача'
                : displayTasks.length >= 2 && displayTasks.length <= 4
                ? 'задачи'
                : 'задач'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={prioritizeToday}
            disabled={aiPrioritizing || currentView !== 'today' || todayTasks.filter((task: any) => task.status !== 'COMPLETED' && !task.parentId).length === 0}
            title="AI расставит приоритеты для всех открытых задач сегодня"
            className="tf-ai-button inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="tf-ai-label">{aiPrioritizing ? 'AI анализирует…' : 'AI приоритеты'}</span>
          </button>
        </div>

        <div className="tf-display-modes flex rounded-lg border overflow-hidden shrink-0">
          {DISPLAY_MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setDisplayMode(m.id)}
                title={m.label}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors',
                  displayMode === m.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent text-muted-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="tf-task-mode-label hidden sm:inline">{m.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {displayMode === 'list' && currentView === 'today' && <TodayDashboard />}
      {displayMode === 'list' && currentView === 'tomorrow' && <TomorrowView />}
      {displayMode === 'list' && currentView === 'week' && <WeekView />}

      {displayMode === 'list' && currentView !== 'today' && currentView !== 'tomorrow' && currentView !== 'week' && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div data-tour="add-task"><QuickAdd /></div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">Нет задач</p>
              <p className="text-xs mt-1">Добавьте первую задачу выше</p>
            </div>
          ) : (
            currentView === 'week' || currentView === 'inbox' ? (
              <div className="mt-2 space-y-4">
                {weekGroups.map(([date, group]) => (
                  <section key={date}>
                    <h2 className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b">
                      {date}
                    </h2>
                    <div className="mt-1">
                      {group.map((task: any) => <TaskItem key={task.id} task={task} />)}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-2 space-y-0.5">
                <div>{displayTasks.map((task) => <TaskItem key={task.id} task={task} />)}</div>
              </div>
            )
          )}
        </div>
      )}

      {displayMode === 'kanban' &&
        (isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <KanbanBoard />
        ))}

      {displayMode === 'matrix' &&
        (isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <EisenhowerMatrix />
        ))}
    </div>
  );
}
