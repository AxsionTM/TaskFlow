'use client';

import { useEffect } from 'react';
import { useFocusStore } from '@/stores/focus';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Play, Pause, RotateCcw, Timer } from 'lucide-react';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const PRESETS = [
  { work: 0.5, break: 0.5, label: '30 сек' },
  { work: 25, break: 5, label: '25/5' },
  { work: 45, break: 10, label: '45/10' },
  { work: 50, break: 10, label: '50/10' },
  { work: 15, break: 3, label: '15/3' },
];

const SESSION_DOT_COLORS = ['#a855f7', '#ec4899', '#22d3ee', '#34d399', '#f59e0b'];

export function FocusView() {
  const {
    isRunning,
    isPaused,
    mode,
    workMinutes,
    breakMinutes,
    remainingSeconds,
    completedPomodoros,
    stats,
    sessions,
    setWorkMinutes,
    setBreakMinutes,
    start,
    pause,
    resume,
    reset,
    tick,
    fetchStats,
    fetchSessions,
  } = useFocusStore();

  useEffect(() => {
    fetchStats();
    fetchSessions();
  }, [fetchStats, fetchSessions]);

  // Timer runs in FocusTicker (global)

  const totalForMode = mode === 'work' ? Math.round(workMinutes * 60) : Math.round(breakMinutes * 60);
  const progress = totalForMode > 0 ? 1 - remainingSeconds / totalForMode : 0;
  const circumference = 2 * Math.PI * 110;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="tf-view-header px-6 py-4 border-b">
        <h1 className="text-xl font-semibold">Фокус</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Твоя продуктивность — в твоих руках
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-8 flex flex-col items-center">
          {/* Mode label */}
          <div
            className={cn(
              'text-sm font-medium px-3 py-1 rounded-full mb-6',
              mode === 'work'
                ? 'bg-primary/10 text-primary'
                : 'bg-green-500/10 text-green-600 dark:text-green-400'
            )}
          >
            {mode === 'work' ? 'Работа' : 'Перерыв'}
          </div>

          {/* Circular timer */}
          <div className="relative w-64 h-64">
            <svg className="tf-focus-ring w-full h-full -rotate-90" viewBox="0 0 240 240">
              <circle
                cx="120"
                cy="120"
                r="110"
                fill="none"
                stroke="hsl(var(--muted) / 0.4)"
                strokeWidth="10"
              />
              <circle
                cx="120"
                cy="120"
                r="110"
                fill="none"
                stroke={mode === 'work' ? 'hsl(var(--primary))' : '#22c55e'}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 linear"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl leading-none" role="img" aria-label="Помидор">
                🍅
              </span>
              <span className="text-5xl font-semibold tracking-tight tabular-nums mt-2">
                {formatTime(remainingSeconds)}
              </span>
              <span className="text-sm text-muted-foreground mt-1.5">
                {mode === 'work' ? 'Помидор' : 'Перерыв'}
              </span>
              {completedPomodoros > 0 && (
                <span className="text-xs text-muted-foreground mt-1">
                  {completedPomodoros}{' '}
                  {completedPomodoros === 1
                    ? 'помидор'
                    : completedPomodoros >= 2 && completedPomodoros <= 4
                    ? 'помидора'
                    : 'помидоров'}{' '}
                  сегодня
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 mt-8">
            {!isRunning ? (
              <Button size="lg" onClick={start} className="tf-btn-hot gap-2 px-8 rounded-xl">
                <Play className="h-5 w-5" />
                Старт
              </Button>
            ) : isPaused ? (
              <Button size="lg" onClick={resume} className="tf-btn-hot gap-2 px-8 rounded-xl">
                <Play className="h-5 w-5" />
                Продолжить
              </Button>
            ) : (
              <Button size="lg" variant="secondary" onClick={pause} className="gap-2 px-8 rounded-xl">
                <Pause className="h-5 w-5" />
                Пауза
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={reset} className="gap-2 rounded-xl">
              <RotateCcw className="h-4 w-4" />
              Сброс
            </Button>
          </div>

          {/* Presets */}
          {!isRunning && (
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setWorkMinutes(p.work);
                    setBreakMinutes(p.break);
                  }}
                  className={cn(
                    'tf-chip text-xs px-3.5 py-1.5 rounded-full transition-all',
                    workMinutes === p.work && breakMinutes === p.break && 'tf-chip-active'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="w-full mt-10 grid grid-cols-3 gap-3">
              <div className="tf-glass rounded-2xl p-3 text-center">
                <div className="text-2xl font-semibold">{stats.totalSessions}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">сессий</div>
              </div>
              <div className="tf-glass rounded-2xl p-3 text-center">
                <div className="text-2xl font-semibold">
                  {Math.floor(stats.totalMinutes / 60)}ч {stats.totalMinutes % 60}м
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">всего</div>
              </div>
              <div className="tf-glass rounded-2xl p-3 text-center">
                <div className="text-2xl font-semibold">{stats.averageMinutes}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">мин / сессия</div>
              </div>
            </div>
          )}

          {/* Recent sessions */}
          {sessions.length > 0 && (
            <div className="w-full mt-8">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                <Timer className="h-4 w-4 text-muted-foreground" />
                Недавние сессии
              </h3>
              <div className="space-y-1.5">
                {sessions.slice(0, 8).map((s: any, index: number) => {
                  const dot = SESSION_DOT_COLORS[index % SESSION_DOT_COLORS.length];
                  return (
                    <div
                      key={s.id}
                      className="tf-glass flex items-center gap-3 text-sm px-3 py-2 rounded-xl"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        style={{
                          color: dot,
                          border: `1.5px solid ${dot}`,
                          boxShadow: `0 0 12px -2px ${dot}`,
                          background: `${dot}14`,
                        }}
                      >
                        🍅
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(s.startedAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="ml-auto font-medium">{s.durationMin} мин</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
