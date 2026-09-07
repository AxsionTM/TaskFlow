import { create } from 'zustand';
import { api } from '@/lib/api';

interface Habit {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  frequency: string;
  targetCount: number;
  targetDays: number[];
  logs: any[];
  streak: number;
  completedToday: boolean;
  todayCount: number;
}

interface HabitsState {
  habits: Habit[];
  isLoading: boolean;
  fetchHabits: () => Promise<void>;
  createHabit: (data: any) => Promise<Habit>;
  updateHabit: (id: string, data: any) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  toggleToday: (id: string) => Promise<void>;
}

export const useHabitsStore = create<HabitsState>((set, get) => ({
  habits: [],
  isLoading: false,

  fetchHabits: async () => {
    set({ isLoading: true });
    try {
      const { habits } = await api.getHabits();
      set({ habits, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createHabit: async (data) => {
    const { habit } = await api.createHabit(data);
    // Optimistic: видно сразу, затем тихая сверка с сервером.
    set((state) => ({ habits: [habit, ...state.habits] }));
    await get().fetchHabits().catch(() => {});
    return habit;
  },

  updateHabit: async (id, data) => {
    const prev = get().habits;
    set((state) => ({ habits: state.habits.map((h) => (h.id === id ? { ...h, ...data } : h)) }));
    try {
      await api.updateHabit(id, data);
    } catch (e) {
      set({ habits: prev });
      throw e;
    }
    await get().fetchHabits().catch(() => {});
  },

  deleteHabit: async (id) => {
    const prev = get().habits;
    set((state) => ({ habits: state.habits.filter((h) => h.id !== id) }));
    try {
      await api.deleteHabit(id);
    } catch (e) {
      set({ habits: prev });
      throw e;
    }
    await get().fetchHabits().catch(() => {});
  },

  toggleToday: async (id) => {
    const habit = get().habits.find((h) => h.id === id);
    if (!habit) return;
    // Optimistic toggle для мгновенного отклика на mobile.
    set((state) => ({
      habits: state.habits.map((h) =>
        h.id === id ? { ...h, completedToday: !h.completedToday } : h
      ),
    }));
    try {
      if (habit.completedToday) {
        await api.unlogHabit(id);
      } else {
        await api.logHabit(id, { count: 1 });
      }
    } catch (e) {
      await get().fetchHabits().catch(() => {});
      throw e;
    }
    await get().fetchHabits().catch(() => {});
  },
}));
