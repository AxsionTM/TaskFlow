'use client';

import { useEffect } from 'react';
import { useFocusStore } from '@/stores/focus';

/** Global timer — keeps counting even when user leaves the Focus view */
export function FocusTicker() {
  const tick = useFocusStore((s) => s.tick);
  const isRunning = useFocusStore((s) => s.isRunning);
  const isPaused = useFocusStore((s) => s.isPaused);

  useEffect(() => {
    if (!isRunning || isPaused) return;
    const id = setInterval(() => tick(), 500);
    return () => clearInterval(id);
  }, [isRunning, isPaused, tick]);

  return null;
}
