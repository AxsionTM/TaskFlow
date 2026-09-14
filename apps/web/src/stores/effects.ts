import { create } from 'zustand';

interface EffectsState {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
}

const KEY = 'tf-effects';

function isMobileDevice(): boolean {
  try {
    return (
      window.matchMedia('(max-width: 767px)').matches ||
      window.matchMedia('(pointer: coarse)').matches
    );
  } catch {
    return false;
  }
}

function load(): boolean {
  if (typeof window === 'undefined') return true;
  const v = localStorage.getItem(KEY);
  // Stored choice always wins. Fresh mobile devices (phones, APK WebView)
  // default to OFF — ambient animations + glows are the main jank source
  // on weak GPUs; desktop keeps them ON.
  if (v === null) return !isMobileDevice();
  return v === '1';
}

export const useEffectsStore = create<EffectsState>((set, get) => ({
  enabled: true,
  toggle: () => {
    const next = !get().enabled;
    if (typeof window !== 'undefined') localStorage.setItem(KEY, next ? '1' : '0');
    set({ enabled: next });
  },
  setEnabled: (v) => {
    if (typeof window !== 'undefined') localStorage.setItem(KEY, v ? '1' : '0');
    set({ enabled: v });
  },
}));

export function initEffectsFromStorage() {
  useEffectsStore.getState().setEnabled(load());
}
