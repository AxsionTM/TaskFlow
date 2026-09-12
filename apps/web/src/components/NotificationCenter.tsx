'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин. назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч. назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'вчера';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** Колокольчик с бейджем + dropdown. Данные только с backend (переживают refresh). */
export function NotificationCenter({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (silent = true) => {
    try {
      const [{ count }, { notifications }] = await Promise.all([
        api.getUnreadCount(),
        api.getNotifications(20),
      ]);
      setUnread(count);
      setItems(notifications);
      setError('');
    } catch (e: any) {
      if (!silent) setError(e.message || 'Не удалось загрузить уведомления');
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    // Лёгкий опрос + обновление при возврате на вкладку (без спама запросами).
    const id = setInterval(() => void refresh(true), 60000);
    const onFocus = () => void refresh(true);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh(false);
  }, [open, refresh]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const openItem = async (id: string, isRead: boolean) => {
    if (!isRead) {
      try {
        await api.markNotificationRead(id);
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        setUnread((u) => Math.max(0, u - 1));
      } catch {}
    }
  };

  const readAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch (e: any) {
      setError(e.message || 'Не удалось отметить прочитанными');
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Уведомления"
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
          dark
            ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
            : 'border-border/60 bg-background/70 text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-1 text-[10px] font-bold tabular-nums text-white shadow-[0_0_12px_-2px_rgba(139,92,246,.8)]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[95] mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-primary/25 bg-[#0d1326] shadow-[0_24px_64px_-12px_rgba(0,0,0,.8),0_0_32px_-12px_var(--tf-glow)]">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
            <span className="text-sm font-bold text-white">Уведомления</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void readAll()}
                className="flex items-center gap-1 text-[11px] font-medium text-violet-300 hover:text-violet-200"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Прочитать все
              </button>
            )}
          </div>
          <div className="max-h-[50dvh] overflow-y-auto p-2">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            ) : error && items.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-red-300">{error}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-slate-500">Новых уведомлений нет</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void openItem(n.id, n.isRead)}
                  className={cn(
                    'mb-1 flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors last:mb-0',
                    n.isRead ? 'hover:bg-white/[0.04]' : 'bg-violet-500/[0.08] hover:bg-violet-500/[0.14]'
                  )}
                >
                  {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-white">{n.title}</span>
                    <span className="mt-0.5 line-clamp-3 block text-xs leading-relaxed text-slate-400">{n.body}</span>
                    <span className="mt-1 block text-[10px] tabular-nums text-slate-600">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
