'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, User, ListTodo, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

export function GlobalSearch({
  onOpenUser,
  onOpenTask,
}: {
  onOpenUser: (id: string) => void;
  onOpenTask: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setUsers([]);
      setTasks([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const id = setTimeout(() => {
      api
        .adminSearch(query)
        .then((r) => {
          setUsers(r.users);
          setTasks(r.tasks);
          setOpen(true);
        })
        .catch(() => {
          setUsers([]);
          setTasks([]);
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (fn: () => void) => {
    fn();
    setOpen(false);
    setQ('');
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => (users.length || tasks.length) && setOpen(true)}
          placeholder="Search TaskFlow…"
          className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-9 text-sm outline-none placeholder:text-slate-500 focus:border-violet-500/50"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-[90] mt-2 overflow-hidden rounded-2xl border border-border/60 bg-[#0d1326] shadow-2xl">
          {users.length === 0 && tasks.length === 0 && !loading && (
            <p className="px-4 py-5 text-center text-xs text-muted-foreground">Ничего не найдено</p>
          )}
          {users.length > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Users</div>
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pick(() => onOpenUser(u.id))}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <User className="h-4 w-4 shrink-0 text-violet-400" />
                  <span className="min-w-0 flex-1 truncate">{u.name || u.email}</span>
                  <span className="max-w-[140px] shrink-0 truncate text-[11px] text-muted-foreground">{u.email}</span>
                </button>
              ))}
            </div>
          )}
          {tasks.length > 0 && (
            <div className="border-t border-border/40 p-2">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tasks</div>
              {tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(() => onOpenTask(t.id))}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <ListTodo className="h-4 w-4 shrink-0 text-sky-400" />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{t.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
