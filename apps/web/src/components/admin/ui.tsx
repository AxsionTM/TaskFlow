'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('ru-RU').format(n);
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n)} ₽`;
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function StatCard({
  label,
  value,
  sub,
  color = '#3b82f6',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur transition-colors hover:border-primary/40">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function LineChart({
  data,
  color = '#3b82f6',
  height = 120,
}: {
  data: { date: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const W = 600;
  const H = height;
  const PAD = 8;
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({
    x: PAD + i * step,
    y: H - PAD - (d.value / max) * (H - PAD * 2),
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${(W - PAD).toFixed(1)},${H} L${PAD},${H} Z`;
  const gid = `ag-${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) =>
        i % Math.ceil(data.length / 12) === 0 ? (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
        ) : null
      )}
    </svg>
  );
}

export function DonutChart({
  segments,
  center,
}: {
  segments: { label: string; value: number; color: string }[];
  center: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const R = 40;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth="11" />
          {total > 0 &&
            segments.map((s) => {
              const frac = s.value / total;
              const el = (
                <circle
                  key={s.label}
                  cx="50" cy="50" r={R} fill="none"
                  stroke={s.color} strokeWidth="11"
                  strokeDasharray={`${frac * C} ${C}`}
                  strokeDashoffset={-acc * C}
                />
              );
              acc += frac;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-sm font-bold leading-tight">
          {center}
        </div>
      </div>
      <div className="w-full min-w-0 flex-1 space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
            <span className="tabular-nums font-semibold">{fmtNum(s.value)}</span>
            <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-muted/50', className)} />;
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const items: (number | '…')[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) items.push(i);
    else if (items[items.length - 1] !== '…') items.push('…');
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it, i) =>
        it === '…' ? (
          <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => onPage(it)}
            className={cn(
              'flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold tabular-nums',
              it === page
                ? 'border-primary bg-primary text-white'
                : 'border-border/60 text-muted-foreground hover:bg-accent'
            )}
          >
            {it}
          </button>
        )
      )}
    </div>
  );
}

export function ConfirmModal({
  title,
  text,
  confirmLabel = 'Подтвердить',
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-t-3xl border border-border/60 bg-card p-5 sm:rounded-3xl">
        <h3 className="text-base font-bold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-border/60 text-sm font-semibold hover:bg-accent"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50',
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-primary hover:brightness-110'
            )}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

export function useToast() {
  const [toasts, setToasts] = useState<{ id: number; text: string; ok: boolean }[]>([]);
  const push = (text: string, ok = true) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };
  const node = (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[130] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur',
            t.ok ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200' : 'border-red-500/40 bg-red-950/90 text-red-200'
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
  return { push, node };
}
