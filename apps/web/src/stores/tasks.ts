import { create } from "zustand";

import { api } from "@/lib/api";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;

  startDate?: string | null;
  dueDate?: string | null;

  projectId?: string | null;
  parentId?: string | null;

  tags?: any[];
  checklist?: any[];
  children?: Task[];

  project?: any;

  isAllDay?: boolean;

  completedAt?: string | null;
  isDeleted?: boolean;

  _count?: { children: number };
}

export type DisplayMode = "list" | "kanban" | "calendar" | "matrix";

interface TasksState {
  tasks: Task[];
  todayTasks: Task[];
  overdueTasks: Task[];

  isLoading: boolean;

  selectedTaskId: string | null;

  currentView: string;
  currentProjectId: string | null;

  displayMode: DisplayMode;

  fetchTasks: (params?: Record<string, string>, opts?: { silent?: boolean }) => Promise<void>;
  fetchToday: (opts?: { silent?: boolean }) => Promise<void>;
  fetchOverdue: (opts?: { silent?: boolean }) => Promise<void>;

  createTask: (data: any) => Promise<Task>;

  updateTask: (id: string, data: any) => Promise<void>;

  completeTask: (id: string) => Promise<void>;

  deleteTask: (id: string) => Promise<void>;

  setSelectedTask: (id: string | null) => void;

  setCurrentView: (view: string) => void;

  setCurrentProject: (id: string | null) => void;

  setDisplayMode: (mode: DisplayMode) => void;

  refreshCurrentView: (opts?: { silent?: boolean }) => Promise<void>;
}

function dayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function matchesTodayFilter(task: Task): boolean {
  if (!task || task.parentId) return false;
  if (task.status === 'COMPLETED') {
    if (!task.completedAt) return true;
    const { start, end } = dayBounds();
    const completed = new Date(task.completedAt).getTime();
    return completed >= start.getTime() && completed <= end.getTime();
  }
  if (!task.startDate && !task.dueDate) return false;
  const { start, end } = dayBounds();
  if (task.startDate && new Date(task.startDate).getTime() > end.getTime()) return false;
  if (task.dueDate && new Date(task.dueDate).getTime() < start.getTime()) return false;
  return true;
}

function matchesOverdueFilter(task: Task): boolean {
  if (!task || task.parentId) return false;
  if (task.status === 'COMPLETED') return false;
  if (!task.dueDate) return false;
  const { start } = dayBounds();
  return new Date(task.dueDate).getTime() < start.getTime();
}

// Свежие мутации: GET сразу после POST/DELETE на Vercel может вернуть
// stale-список (serverless cold start / lag / гонка фоновых refresh).
// Держим их 15 секунд и подмешиваем в ответы, чтобы тихая сверка
// не стирала только что созданное и не возвращала удаленное.
const MUTATION_TTL_MS = 15000;
const recentMutations = new Map<string, { task: Task | null; ts: number }>();

function rememberMutation(id: string, task: Task | null) {
  recentMutations.set(id, { task, ts: Date.now() });
}

const VIEW_KEY = 'tf-current-view';
const PROJECT_KEY = 'tf-current-project';
const MODE_KEY = 'tf-display-mode';
const KNOWN_VIEWS = new Set([
  'today', 'tomorrow', 'agenda', 'week', 'overdue', 'inbox', 'project',
  'habits', 'goals', 'focus', 'birthdays', 'graph', 'pulse', 'trash',
  'profile', 'calendar', 'notes', 'assistant',
]);

function loadStoredView(): string {
  try {
    if (typeof window === 'undefined') return 'today';
    const view = localStorage.getItem(VIEW_KEY);
    return view && KNOWN_VIEWS.has(view) ? view : 'today';
  } catch {
    return 'today';
  }
}

function loadStoredProject(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

function loadStoredMode(): DisplayMode {
  try {
    if (typeof window === 'undefined') return 'list';
    const mode = localStorage.getItem(MODE_KEY);
    return mode === 'kanban' || mode === 'matrix' ? mode : 'list';
  } catch {
    return 'list';
  }
}

const OVERDUE_SEEN_KEY = 'tf-overdue-seen';
const OVERDUE_HISTORY_KEY = 'tf-overdue-history';

function loadOverdueSeen(): Record<string, number> {
  try {
    if (typeof window === 'undefined') return {};
    return JSON.parse(localStorage.getItem(OVERDUE_SEEN_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveOverdueSeen(map: Record<string, number>) {
  try {
    localStorage.setItem(OVERDUE_SEEN_KEY, JSON.stringify(map));
  } catch {}
}

export function loadOverdueHistory(): { autoRemoved: number; lastAt: string | null } {
  try {
    if (typeof window === 'undefined') return { autoRemoved: 0, lastAt: null };
    return JSON.parse(localStorage.getItem(OVERDUE_HISTORY_KEY) || '{"autoRemoved":0,"lastAt":null}');
  } catch {
    return { autoRemoved: 0, lastAt: null };
  }
}

function saveOverdueHistory(h: { autoRemoved: number; lastAt: string | null }) {
  try {
    localStorage.setItem(OVERDUE_HISTORY_KEY, JSON.stringify(h));
  } catch {}
}

/** Отмечает просроченные как «увиденные», возвращает id задач старше 24ч для автоудаления */
export function trackOverdueSeen(tasks: Task[]): string[] {
  if (typeof window === 'undefined') return [];
  const seen = loadOverdueSeen();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const currentIds = new Set(tasks.map((t) => t.id));
  let changed = false;
  for (const t of tasks) {
    if (!seen[t.id]) {
      seen[t.id] = now;
      changed = true;
    }
  }
  for (const id of Object.keys(seen)) {
    if (!currentIds.has(id)) {
      delete seen[id];
      changed = true;
    }
  }
  if (changed) saveOverdueSeen(seen);
  return tasks.filter((t) => now - (seen[t.id] || now) >= DAY).map((t) => t.id);
}

export function recordOverdueAutoRemoved(count: number) {
  const h = loadOverdueHistory();
  saveOverdueHistory({
    autoRemoved: h.autoRemoved + count,
    lastAt: new Date().toISOString(),
  });
}

// Дедуплика параллельных одинаковых запросов: Sidebar и вид монтируются
// одновременно и раньше слали два одинаковых GET (например fetchOverdue).
// Повторный вызов, пока летит первый, ждёт тот же promise.
const inflight = new Map<string, Promise<void>>();

function deduped<T extends unknown[]>(key: string, fn: (...args: T) => Promise<void>) {
  return (...args: T): Promise<void> => {
    const running = inflight.get(key);
    if (running) return running;
    const p = fn(...args).finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
    inflight.set(key, p);
    return p;
  };
}

function mergeFreshInto(list: Task[], gate?: (task: Task) => boolean): Task[] {
  const now = Date.now();
  let result = list;
  for (const [id, entry] of Array.from(recentMutations.entries())) {
    if (now - entry.ts > MUTATION_TTL_MS) {
      recentMutations.delete(id);
      continue;
    }
    const pending = entry.task;
    if (pending === null) {
      if (result.some((item) => item.id === id)) {
        result = result.filter((item) => item.id !== id);
      }
      continue;
    }
    if (pending.parentId) continue;
    if (gate && !gate(pending)) continue;
    const index = result.findIndex((item) => item.id === id);
    if (index >= 0) {
      const next = [...result];
      next[index] = pending;
      result = next;
    } else {
      result = [pending, ...result];
    }
  }
  return result;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  todayTasks: [],
  overdueTasks: [],

  isLoading: false,

  selectedTaskId: null,

  currentView: loadStoredView(),

  currentProjectId: loadStoredProject(),

  displayMode: loadStoredMode(),

  fetchTasks: deduped('tasks', async (params, opts) => {
    const silent = Boolean(opts?.silent);
    if (!silent) set({ isLoading: true });

    try {
      const query = { ...params };

      if (!query.includeCompleted) {
        // keep default
      }

      const { tasks } = await api.getTasks(query);

      set({
        tasks: mergeFreshInto(tasks as Task[]),
        ...(silent ? {} : { isLoading: false }),
      });
      if (silent) set({ isLoading: false });
    } catch {
      set({
        isLoading: false,
      });
    }
  }),

  fetchToday: deduped('today', async (opts: any) => {
    const silent = Boolean(opts?.silent);
    if (!silent) set({ isLoading: true });

    try {
      const { tasks } = await api.getTodayTasks();

      set({
        todayTasks: mergeFreshInto(tasks as Task[], matchesTodayFilter),
        isLoading: false,
      });
    } catch {
      set({
        isLoading: false,
      });
    }
  }),

  fetchOverdue: deduped('overdue', async (opts) => {
    void opts;
    try {
      const { tasks } = await api.getOverdueTasks();

      set({
        overdueTasks: mergeFreshInto(tasks as Task[], matchesOverdueFilter),
      });
    } catch {}
  }),

  refreshCurrentView: async (opts) => {
    const {
      currentView,
      currentProjectId,
      displayMode,
      fetchToday,
      fetchOverdue,
      fetchTasks,
    } = get();
    const silent = Boolean(opts?.silent);

    const includeCompleted =
      displayMode === "kanban" ||
      displayMode === "calendar" ||
      displayMode === "matrix"
        ? "true"
        : undefined;

    // Calendar always shows all open tasks for the month (not only today).
    // Календарь — отдельная вкладка (currentView), старый режим displayMode
    // оставлен для совместимости.
    if (displayMode === "calendar" || currentView === "calendar") {
      await fetchTasks(
        {
          includeCompleted: "true",
        },
        { silent }
      );

      return;
    }

    if (currentView === "today") {
      await fetchToday({ silent });

      const { todayTasks } = get();

      set({
        tasks: todayTasks,
      });
    } else if (currentView === "overdue") {
      await fetchOverdue({ silent });

      const { overdueTasks } = get();

      set({
        tasks: overdueTasks,
      });
    } else if (currentView === "inbox") {
      await fetchTasks(
        {
          inbox: "true",
          includeCompleted: "false",
        },
        { silent }
      );
    } else if (currentView === "project" && currentProjectId) {
      await fetchTasks(
        {
          projectId: currentProjectId,
          includeCompleted: includeCompleted || "false",
        },
        { silent }
      );
    } else if (currentView === "tomorrow") {
      const tomorrow = new Date();

      tomorrow.setDate(tomorrow.getDate() + 1);

      const start = new Date(tomorrow);

      start.setHours(0, 0, 0, 0);

      const end = new Date(tomorrow);

      end.setHours(23, 59, 59, 999);

      await fetchTasks(
        {
          dueAfter: start.toISOString(),
          dueBefore: end.toISOString(),
          includeCompleted: includeCompleted || "false",
        },
        { silent }
      );
    } else if (currentView === "week") {
      const start = new Date();

      start.setHours(0, 0, 0, 0);

      const end = new Date();

      end.setDate(end.getDate() + 7);

      end.setHours(23, 59, 59, 999);

      await fetchTasks(
        {
          dueAfter: start.toISOString(),
          dueBefore: end.toISOString(),
          includeCompleted: "true",
        },
        { silent }
      );
    } else {
      await fetchTasks(
        {
          includeCompleted: includeCompleted || "false",
        },
        { silent }
      );
    }
  },

  createTask: async (data) => {
    // Настоящий optimistic: показываем СРАЗУ, не дожидаясь ответа API.
    // На Vercel (3 отдельных проекта) POST может идти секунды из-за
    // cold start — раньше задача появлялась только после перезагрузки.
    const isSubtask = Boolean(data.parentId);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempTask = {
      id: tempId,
      status: 'TODO',
      priority: 'NONE',
      ...data,
    } as Task;

    if (!isSubtask) {
      set((state) => {
        const addIfMissing = (items: Task[], item: Task) =>
          items.some((entry) => entry.id === item.id) ? items : [item, ...items];
        return {
          tasks: addIfMissing(state.tasks, tempTask),
          todayTasks: matchesTodayFilter(tempTask)
            ? addIfMissing(state.todayTasks, tempTask)
            : state.todayTasks,
          overdueTasks: matchesOverdueFilter(tempTask)
            ? addIfMissing(state.overdueTasks, tempTask)
            : state.overdueTasks,
        };
      });
    }

    try {
      const { task } = await api.createTask(data);
      rememberMutation(task.id, task as Task);

      if (!task.parentId) {
        // Меняем временную карточку на настоящую с сервера.
        set((state) => {
          const swap = (items: Task[], shouldAdd: boolean) => {
            if (items.some((entry) => entry.id === tempId)) {
              return items.map((entry) => (entry.id === tempId ? (task as Task) : entry));
            }
            if (shouldAdd && !items.some((entry) => entry.id === task.id)) {
              return [task as Task, ...items];
            }
            return items;
          };
          return {
            tasks: swap(state.tasks, true),
            todayTasks: swap(state.todayTasks, matchesTodayFilter(task as Task)),
            overdueTasks: swap(state.overdueTasks, matchesOverdueFilter(task as Task)),
          };
        });
      }

      // Тихая сверка с сервером без спиннера.
      await get().refreshCurrentView({ silent: true }).catch(() => {});
      return task;
    } catch (e) {
      // Откат временной карточки, чтобы не было "призраков".
      if (!isSubtask) {
        set((state) => ({
          tasks: state.tasks.filter((entry) => entry.id !== tempId),
          todayTasks: state.todayTasks.filter((entry) => entry.id !== tempId),
          overdueTasks: state.overdueTasks.filter((entry) => entry.id !== tempId),
        }));
      }
      throw e;
    }
  },

  updateTask: async (id, data) => {
    // Optimistic сразу, затем подтверждение с сервера.
    const snap = { tasks: get().tasks, todayTasks: get().todayTasks, overdueTasks: get().overdueTasks };
    set((state) => ({
      tasks: state.tasks.map((item) => (item.id === id ? { ...item, ...data } : item)),
      todayTasks: state.todayTasks.map((item) => (item.id === id ? { ...item, ...data } : item)),
      overdueTasks: state.overdueTasks.map((item) => (item.id === id ? { ...item, ...data } : item)),
    }));

    try {
      const { task } = await api.updateTask(id, data);
      rememberMutation(task.id, task as Task);
      set((state) => ({
        tasks: state.tasks.map((item) => (item.id === id ? { ...item, ...task } : item)),
        todayTasks: state.todayTasks.map((item) => (item.id === id ? { ...item, ...task } : item)),
        overdueTasks: state.overdueTasks.map((item) => (item.id === id ? { ...item, ...task } : item)),
      }));
    } catch (e) {
      set(snap);
      throw e;
    }

    await get().refreshCurrentView({ silent: true }).catch(() => {});
  },

  completeTask: async (id) => {
    const current =
      get().tasks.find((item) => item.id === id) ??
      get().todayTasks.find((item) => item.id === id);
    const optimisticStatus = current?.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';

    set((state) => ({
      tasks: state.tasks.map((item) => (item.id === id ? { ...item, status: optimisticStatus } : item)),
      todayTasks: state.todayTasks.map((item) =>
        item.id === id ? { ...item, status: optimisticStatus } : item
      ),
      overdueTasks:
        optimisticStatus === 'COMPLETED'
          ? state.overdueTasks.filter((item) => item.id !== id)
          : state.overdueTasks,
    }));

    try {
      const { task } = await api.completeTask(id);
      const completed = task || { id, status: optimisticStatus };
      rememberMutation(id, completed as Task);
      set((state) => ({
        tasks: state.tasks.map((item) => (item.id === id ? { ...item, ...completed } : item)),
        todayTasks: state.todayTasks.map((item) => (item.id === id ? { ...item, ...completed } : item)),
        overdueTasks: state.overdueTasks.filter((item) => item.id !== id),
      }));
    } catch (e) {
      await get().refreshCurrentView({ silent: true }).catch(() => {});
      throw e;
    }

    await get().refreshCurrentView({ silent: true }).catch(() => {});
  },

  deleteTask: async (id) => {
    // Удаляем из UI мгновенно, запрос на сервер идет следом.
    const { selectedTaskId } = get();
    const snap = { tasks: get().tasks, todayTasks: get().todayTasks, overdueTasks: get().overdueTasks };

    set((state) => ({
      tasks: state.tasks.filter((item) => item.id !== id),
      todayTasks: state.todayTasks.filter((item) => item.id !== id),
      overdueTasks: state.overdueTasks.filter((item) => item.id !== id),
      selectedTaskId: selectedTaskId === id ? null : selectedTaskId,
    }));

    try {
      await api.deleteTask(id);
      rememberMutation(id, null);
    } catch (e) {
      // Откат, если сервер отклонил удаление (например CORS/сеть на Vercel).
      set(snap);
      throw e;
    }

    await get().refreshCurrentView({ silent: true }).catch(() => {});
  },

  setSelectedTask: (id) =>
    set({
      selectedTaskId: id,
    }),

  setCurrentView: (view) => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem(VIEW_KEY, view);
    } catch {}
    set({
      currentView: view,
      selectedTaskId: null,
    });
  },

  setCurrentProject: (id) => {
    try {
      if (typeof window !== 'undefined') {
        if (id) localStorage.setItem(PROJECT_KEY, id);
        else localStorage.removeItem(PROJECT_KEY);
      }
    } catch {}
    set({
      currentProjectId: id,
    });
  },

  setDisplayMode: (mode) => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem(MODE_KEY, mode);
    } catch {}
    set({
      displayMode: mode,
    });

    setTimeout(() => get().refreshCurrentView({ silent: true }).catch(() => {}), 0);
  },
}));
