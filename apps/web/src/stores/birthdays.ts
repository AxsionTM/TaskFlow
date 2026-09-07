import { create } from 'zustand';
import { api } from '@/lib/api';

export type Birthday = {
  id: string;
  name: string;
  date: string;
  note?: string | null;
  remindDays: number;
};

type State = {
  items: Birthday[];
  loading: boolean;
  fetch: () => Promise<void>;
  create: (data: { name: string; date: string; note?: string; remindDays?: number }) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

function dateParts(iso: string) {
  const match = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]) - 1,
      day: Number(match[3]),
    };
  }
  const d = new Date(iso);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

export function ageFromDate(iso: string, at = new Date()) {
  const d = dateParts(iso);
  let age = at.getFullYear() - d.year;
  const m = at.getMonth() - d.month;
  if (m < 0 || (m === 0 && at.getDate() < d.day)) age--;
  return age;
}

export function isSameMonthDay(iso: string, day: Date) {
  const d = dateParts(iso);
  return d.month === day.getMonth() && d.day === day.getDate();
}

export const useBirthdaysStore = create<State>((set, get) => ({
  items: [],
  loading: false,
  fetch: async () => {
    set({ loading: true });
    try {
      const { birthdays } = await api.getBirthdays();
      set({ items: birthdays });
    } catch {
      set({ items: [] });
    } finally {
      set({ loading: false });
    }
  },
  create: async (data) => {
    const { birthday } = await api.createBirthday(data);
    if (birthday) set((state) => ({ items: [birthday, ...state.items] }));
    await get().fetch().catch(() => {});
  },
  remove: async (id) => {
    set((state) => ({ items: state.items.filter((b) => b.id !== id) }));
    try {
      await api.deleteBirthday(id);
    } catch (e) {
      await get().fetch().catch(() => {});
      throw e;
    }
    await get().fetch().catch(() => {});
  },
}));
