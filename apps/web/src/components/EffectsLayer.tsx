'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useEffectsStore, initEffectsFromStorage } from '@/stores/effects';

const STAR_COUNT = 28;
const SPARK_COUNT = 12;

export function EffectsLayer() {
  const enabled = useEffectsStore((s) => s.enabled);
  const { theme, resolvedTheme } = useTheme();
  const [stars, setStars] = useState<
    { id: number; left: number; top: number; size: number; delay: number; dur: number; kind: 'dot' | 'spark' }[]
  >([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    initEffectsFromStorage();
    setMounted(true);
    const isMobile =
      typeof window !== 'undefined' &&
      (window.matchMedia('(max-width: 767px)').matches ||
        window.matchMedia('(pointer: coarse)').matches);
    const dotsCount = isMobile ? Math.ceil(STAR_COUNT / 2) : STAR_COUNT;
    const sparksCount = isMobile ? 0 : SPARK_COUNT;
    const dots = Array.from({ length: dotsCount }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 1 + Math.random() * 2.2,
      delay: Math.random() * 10,
      dur: 5 + Math.random() * 9,
      kind: 'dot' as const,
    }));
    const sparks = Array.from({ length: sparksCount }, (_, i) => ({
      id: 100 + i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 2 + Math.random() * 3,
      delay: Math.random() * 12,
      dur: 8 + Math.random() * 10,
      kind: 'spark' as const,
    }));
    setStars([...dots, ...sparks]);
  }, []);

  // Toggle class on <html> so CSS hover glows work everywhere
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (enabled) root.classList.add('effects-on');
    else root.classList.remove('effects-on');
    return () => root.classList.remove('effects-on');
  }, [enabled, mounted]);

  if (!mounted || !enabled) return null;

  const t = theme || resolvedTheme || 'dark';

  if (t === 'black') {
    return (
      <div className="pointer-events-none fixed inset-0 z-[5] overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.05) 0%, transparent 55%)' }}
        />
      </div>
    );
  }
  const glowColor =
    t === 'ocean'
      ? 'rgba(56,189,248,0.75)'
      : t === 'forest'
        ? 'rgba(74,222,128,0.75)'
        : t === 'crimson'
          ? 'rgba(248,113,113,0.75)'
          : t === 'violet'
            ? 'rgba(192,132,252,0.75)'
            : t === 'light'
              ? 'rgba(59,130,246,0.5)'
              : 'rgba(96,165,250,0.6)';

  return (
    <div className="pointer-events-none fixed inset-0 z-[5] overflow-hidden" aria-hidden>
      {/* Soft vignette / ambient bloom */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${glowColor.replace('0.75', '0.12').replace('0.6', '0.1').replace('0.5', '0.08')} 0%, transparent 55%)`,
        }}
      />

      {stars.map((s) => (
        <span
          key={s.id}
          className={s.kind === 'spark' ? 'absolute tf-spark' : 'absolute rounded-full tf-star'}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.kind === 'spark' ? s.size * 4 : s.size,
            height: s.kind === 'spark' ? 1.5 : s.size,
            background:
              s.kind === 'spark'
                ? `linear-gradient(90deg, transparent, ${glowColor}, transparent)`
                : glowColor,
            boxShadow: s.kind === 'dot' ? `0 0 ${s.size * 4}px ${glowColor}` : undefined,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`,
          }}
        />
      ))}
    </div>
  );
}
