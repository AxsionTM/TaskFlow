import { create } from 'zustand';
import { api } from '@/lib/api';

interface FocusState {
  isRunning: boolean;
  isPaused: boolean;
  mode: 'work' | 'break';
  workMinutes: number;
  breakMinutes: number;
  remainingSeconds: number;
  /** Absolute timestamp when current segment ends (for background accuracy) */
  endsAt: number | null;
  completedPomodoros: number;
  /** true после 00:00 — таймер остановлен, shown «Сессия завершена» */
  sessionFinished: boolean;
  sessions: any[];
  stats: { totalMinutes: number; totalSessions: number; averageMinutes: number } | null;

  setWorkMinutes: (m: number) => void;
  setBreakMinutes: (m: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  /** Закрыть экран завершения и начать новую рабочую сессию */
  startNext: () => void;
  dismissFinished: () => void;
  stopSound: () => void;
  /** Sync remaining from endsAt — call every second from global ticker */
  tick: () => void;
  completeSession: () => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchSessions: () => Promise<void>;
}

function formatRemaining(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 1) return `${m}м`;
  return `${s}с`;
}

export { formatRemaining };

const DAY_KEY = 'tf-focus-day';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadDay(): { date: string; pomodoros: number; minutes: number } {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(DAY_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === todayKey()) return parsed;
    }
  } catch {}
  return { date: todayKey(), pomodoros: 0, minutes: 0 };
}

function saveDay(pomodoros: number, minutes: number) {
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify({ date: todayKey(), pomodoros, minutes }));
  } catch {}
}

// --- Звук окончания: приятная, но заметная мелодия (WebAudio, без файлов) ---
let audioCtx: AudioContext | null = null;
let activeNodes: OscillatorNode[] = [];

function stopCompletionSound() {
  for (const o of activeNodes) {
    try { o.stop(); } catch {}
    try { o.disconnect(); } catch {}
  }
  activeNodes = [];
}

function playCompletionSound() {
  try {
    stopCompletionSound();
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const ctx = audioCtx;
    // Три мягких колокольчика: E5 → G5 → C6, каждый ~0.6с. Не бесконечный.
    const notes = [659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.65);
      activeNodes.push(osc);
    });
    // Автоочистка
    window.setTimeout(stopCompletionSound, 2500);
  } catch {}
}

const initialDay = typeof window !== 'undefined' ? loadDay() : { date: '', pomodoros: 0, minutes: 0 };

export const useFocusStore = create<FocusState>((set, get) => ({
  isRunning: false,
  isPaused: false,
  mode: 'work',
  workMinutes: 25,
  breakMinutes: 5,
  remainingSeconds: 25 * 60,
  endsAt: null,
  completedPomodoros: initialDay.pomodoros,
  sessionFinished: false,
  sessions: [],
  stats: null,

  setWorkMinutes: (m) => {
    const { isRunning } = get();
    if (!isRunning) {
      set({ workMinutes: m, remainingSeconds: Math.round(m * 60), mode: 'work', endsAt: null, sessionFinished: false });
    }
  },

  setBreakMinutes: (m) => set({ breakMinutes: m }),

  start: () => {
    const { workMinutes } = get();
    stopCompletionSound();
    const total = Math.round(workMinutes * 60);
    set({
      isRunning: true,
      isPaused: false,
      mode: 'work',
      remainingSeconds: total,
      endsAt: Date.now() + total * 1000,
      sessionFinished: false,
    });
  },

  pause: () => {
    const { endsAt, isRunning } = get();
    if (!isRunning || !endsAt) {
      set({ isPaused: true, endsAt: null });
      return;
    }
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    set({ isPaused: true, remainingSeconds: left, endsAt: null });
  },

  resume: () => {
    const { remainingSeconds, sessionFinished } = get();
    if (sessionFinished) return;
    set({
      isPaused: false,
      endsAt: Date.now() + remainingSeconds * 1000,
    });
  },

  reset: () => {
    const { workMinutes } = get();
    stopCompletionSound();
    set({
      isRunning: false,
      isPaused: false,
      mode: 'work',
      remainingSeconds: Math.round(workMinutes * 60),
      endsAt: null,
      sessionFinished: false,
    });
  },

  startNext: () => {
    const { workMinutes } = get();
    stopCompletionSound();
    const total = Math.round(workMinutes * 60);
    set({
      isRunning: true,
      isPaused: false,
      mode: 'work',
      remainingSeconds: total,
      endsAt: Date.now() + total * 1000,
      sessionFinished: false,
    });
  },

  dismissFinished: () => {
    stopCompletionSound();
    set({ sessionFinished: false });
  },

  stopSound: () => {
    stopCompletionSound();
  },

  tick: () => {
    const { isRunning, isPaused, endsAt, workMinutes } = get();
    if (!isRunning || isPaused || !endsAt) return;

    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    if (left <= 0) {
      // Рабочая сессия завершена: останавливаем таймер на 00:00,
      // увеличиваем счётчики, сохраняем, играем звук.
      const day = loadDay();
      const nextPomodoros = day.pomodoros + 1;
      const billable = Math.max(1, Math.round(workMinutes));
      saveDay(nextPomodoros, day.minutes + billable);
      set({
        isRunning: false,
        isPaused: false,
        mode: 'work',
        remainingSeconds: 0,
        endsAt: null,
        completedPomodoros: nextPomodoros,
        sessionFinished: true,
        // Оптимистично обновляем статистику сразу, до ответа сервера
        stats: get().stats
          ? {
              totalMinutes: get().stats!.totalMinutes + billable,
              totalSessions: get().stats!.totalSessions + 1,
              averageMinutes:
                get().stats!.totalSessions + 1 > 0
                  ? Math.round((get().stats!.totalMinutes + billable) / (get().stats!.totalSessions + 1))
                  : 0,
            }
          : get().stats,
      });
      playCompletionSound();
      void get().completeSession();
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Фокус — сессия завершена', { body: 'Отличная работа! Можно начать следующую сессию.' });
        } catch {}
      }
      return;
    }

    set({ remainingSeconds: left });
  },

  completeSession: async () => {
    const { workMinutes } = get();
    const now = new Date();
    const started = new Date(now.getTime() - workMinutes * 60 * 1000);
    try {
      await api.createFocusSession({
        durationMin: Math.max(1, Math.round(workMinutes * 10) / 10),
        type: 'pomodoro',
        startedAt: started.toISOString(),
        endedAt: now.toISOString(),
      });
      await get().fetchStats();
      await get().fetchSessions();
    } catch {}
  },

  fetchStats: async () => {
    try {
      const stats = await api.getFocusStats();
      set({ stats });
    } catch {}
  },

  fetchSessions: async () => {
    try {
      const { sessions } = await api.getFocusSessions();
      set({ sessions });
      // Синхронизируем локальный счётчик «сегодня» с сервером, если сервер знает больше
      try {
        const key = todayKey();
        const todayCount = sessions.filter(
          (s: any) => s.startedAt && String(s.startedAt).slice(0, 10) === key
        ).length;
        const day = loadDay();
        if (todayCount > day.pomodoros) {
          saveDay(todayCount, day.minutes);
          set({ completedPomodoros: todayCount });
        } else if (day.pomodoros > 0) {
          set({ completedPomodoros: day.pomodoros });
        }
      } catch {}
    } catch {}
  },
}));
