'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { APP_THEMES, type AppThemeId } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { Palette, Check } from 'lucide-react';

function applyThemeClass(theme: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const themed = ['ocean', 'forest', 'crimson', 'violet'];
  themed.forEach((t) => root.classList.remove(`theme-${t}`));
  if (themed.includes(theme)) {
    root.classList.add(`theme-${theme}`);
    root.classList.add('dark');
  } else if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  }
}

export function ThemePicker({ compact }: { compact?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hoverId, setHoverId] = useState<AppThemeId | null>(null);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyThemeClass(theme || resolvedTheme || 'dark');
  }, [theme, resolvedTheme, mounted]);

  if (!mounted) return null;

  const current = (theme as AppThemeId) || 'dark';
  const hoverTheme = APP_THEMES.find((t) => t.id === hoverId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
          compact && 'justify-center'
        )}
      >
        <Palette className="h-4 w-4" />
        {!compact && <span>Тема</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-[110] w-72 rounded-2xl border bg-card/95 shadow-2xl p-3 backdrop-blur-xl tf-glow-border">
            <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Выберите тему</p>
            <div className="grid grid-cols-2 gap-2">
              {APP_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onMouseEnter={(e) => {
                    setHoverId(t.id);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPreviewPos({ x: rect.right + 12, y: rect.top });
                  }}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => {
                    setTheme(t.id);
                    applyThemeClass(t.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'relative rounded-xl border border-border/60 p-1.5 text-left transition-all hover:scale-[1.03] overflow-hidden',
                    current === t.id && 'ring-2 ring-primary border-primary'
                  )}
                >
                  <div
                    className="tf-theme-card h-16 rounded-lg overflow-hidden mb-1.5"
                    style={{ backgroundImage: t.previewScene }}
                  />
                  <div className="flex items-center justify-between gap-1 px-0.5 pb-0.5">
                    <div>
                      <p className="text-[11px] font-semibold leading-tight">{t.label}</p>
                      <p className="text-[9px] text-muted-foreground">{t.description}</p>
                    </div>
                    {current === t.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Fixed preview above everything */}
          {hoverTheme && (
            <div
              className="fixed z-[120] pointer-events-none hidden lg:block"
              style={{ left: previewPos.x, top: previewPos.y }}
            >
              <div
                className="w-60 h-36 rounded-2xl border-2 shadow-2xl overflow-hidden flex flex-col ring-2 ring-primary/40"
                style={{
                  backgroundImage: hoverTheme.previewScene,
                  borderColor: hoverTheme.preview.primary,
                }}
              >
                <div className="px-3 pt-2.5 text-[11px] font-bold text-white drop-shadow">
                  TaskFlow · {hoverTheme.label}
                </div>
                <div className="px-3 text-[9px] text-white/70">{hoverTheme.description}</div>
                <div className="m-2 mt-auto rounded-lg bg-black/45 backdrop-blur p-2 border border-white/15">
                  <div
                    className="h-2 w-20 rounded-sm mb-1.5"
                    style={{ background: hoverTheme.preview.primary }}
                  />
                  <div className="h-1.5 w-full rounded-sm bg-white/15 mb-1" />
                  <div className="h-1.5 w-2/3 rounded-sm bg-white/10" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
