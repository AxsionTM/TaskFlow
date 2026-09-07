import { create } from 'zustand';
import { api } from '@/lib/api';

interface Goal {
  id: string;
  name: string;
  description?: string | null;
  targetValue?: number | null;
  currentValue: number;
  unit?: string | null;
  deadline?: string | null;
  color: string;
  isCompleted: boolean;
}

interface GoalsState {
  goals: Goal[];
  isLoading: boolean;
  fetchGoals: () => Promise<void>;
  createGoal: (data: any) => Promise<Goal>;
  updateGoal: (id: string, data: any) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  isLoading: false,

  fetchGoals: async () => {
    set({ isLoading: true });
    try {
      const { goals } = await api.getGoals();
      set({ goals, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createGoal: async (data) => {
    const { goal } = await api.createGoal(data);
    set((state) => ({ goals: [goal, ...state.goals] }));
    await get().fetchGoals().catch(() => {});
    return goal;
  },

  updateGoal: async (id, data) => {
    set((state) => ({ goals: state.goals.map((g) => (g.id === id ? { ...g, ...data } : g)) }));
    try {
      await api.updateGoal(id, data);
    } catch (e) {
      await get().fetchGoals().catch(() => {});
      throw e;
    }
    await get().fetchGoals().catch(() => {});
  },

  deleteGoal: async (id) => {
    set((state) => ({ goals: state.goals.filter((g) => g.id !== id) }));
    try {
      await api.deleteGoal(id);
    } catch (e) {
      await get().fetchGoals().catch(() => {});
      throw e;
    }
    await get().fetchGoals().catch(() => {});
  },
}));
