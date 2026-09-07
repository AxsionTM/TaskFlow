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

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  todayTasks: [],
  overdueTasks: [],

  isLoading: false,

  selectedTaskId: null,

  currentView: "today",

  currentProjectId: null,

  displayMode: "list",

  fetchTasks: async (params, opts) => {
    const silent = Boolean(opts?.silent);
    if (!silent) set({ isLoading: true });

    try {
      const query = { ...params };

      if (!query.includeCompleted) {
        // keep default
      }

      const { tasks } = await api.getTasks(query);

      set({
        tasks,
        ...(silent ? {} : { isLoading: false }),
      });
      if (silent) set({ isLoading: false });
    } catch {
      set({
        isLoading: false,
      });
    }
  },

  fetchToday: async (opts) => {
    const silent = Boolean(opts?.silent);
    if (!silent) set({ isLoading: true });

    try {
      const { tasks } = await api.getTodayTasks();

      set({
        todayTasks: tasks,
        isLoading: false,
      });
    } catch {
      set({
        isLoading: false,
      });
    }
  },

  fetchOverdue: async (opts) => {
    void opts;
    try {
      const { tasks } = await api.getOverdueTasks();

      set({
        overdueTasks: tasks,
      });
    } catch {}
  },

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

    // Calendar always shows all open tasks for the month (not only today)
    if (displayMode === "calendar") {
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

  setCurrentView: (view) =>
    set({
      currentView: view,
      selectedTaskId: null,
    }),

  setCurrentProject: (id) =>
    set({
      currentProjectId: id,
    }),

  setDisplayMode: (mode) => {
    set({
      displayMode: mode,
    });

    setTimeout(() => get().refreshCurrentView({ silent: true }).catch(() => {}), 0);
  },
}));
