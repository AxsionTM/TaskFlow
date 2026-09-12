'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Pencil, Eye, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton, EmptyState, ConfirmModal, Field, inputCls, fmtDate, fmtDay } from './ui';
import { Tasks } from './Tasks';
import { ImpersonateView } from './ImpersonateView';
import { cn } from '@/lib/utils';

type Toast = (text: string, ok?: boolean) => void;
type Tab = 'profile' | 'activity' | 'tasks' | 'security' | 'actions';

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[calc(100dvh-40px)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border/60 bg-card p-5 sm:rounded-3xl">
        <h3 className="mb-4 text-base font-bold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'activity', label: 'Activity' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'security', label: 'Security' },
  { id: 'actions', label: 'Admin Actions' },
];

export function UserDetail({
  id,
  onBack,
  onOpenTask,
  toast,
}: {
  id: string;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
  toast: Toast;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('profile');
  const [modal, setModal] = useState<'password' | 'block' | 'unblock' | 'role' | 'rename' | 'delete' | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [comment, setComment] = useState('');
  const [role, setRole] = useState('USER');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewAs, setViewAs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminUser(id);
      setData(res);
      setRole(res.user.role);
      setName(res.user.name || '');
    } catch (e: any) {
      toast(e.message || 'Не удалось загрузить пользователя', false);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (!data) return <EmptyState text="Пользователь не найден" />;

  const u = data.user;

  const doPassword = async () => {
    if (password.length < 6) {
      toast('Пароль должен быть не менее 6 символов', false);
      return;
    }
    if (password !== confirmPassword) {
      toast('Пароли не совпадают', false);
      return;
    }
    setBusy(true);
    try {
      await api.adminSetPassword(id, password, confirmPassword);
      toast('Пароль изменён, старые сессии завершены');
      setModal(null);
      setPassword('');
      setConfirmPassword('');
      await load();
    } catch (e: any) {
      toast(e.message || 'Не удалось изменить пароль', false);
    } finally {
      setBusy(false);
    }
  };

  const doBlock = async (block: boolean) => {
    setBusy(true);
    try {
      if (block) await api.adminBlock(id, comment || undefined);
      else await api.adminUnblock(id);
      toast(block ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
      setModal(null);
      setComment('');
      await load();
    } catch (e: any) {
      toast(e.message || 'Не удалось выполнить действие', false);
    } finally {
      setBusy(false);
    }
  };

  const doRole = async () => {
    setBusy(true);
    try {
      await api.adminSetRole(id, role);
      toast('Роль успешно изменена');
      setModal(null);
      await load();
    } catch (e: any) {
      toast(e.message || 'Не удалось изменить роль', false);
    } finally {
      setBusy(false);
    }
  };

  const doRename = async () => {
    if (!name.trim()) {
      toast('Введите имя', false);
      return;
    }
    setBusy(true);
    try {
      await api.adminRenameUser(id, name.trim());
      toast('Имя обновлено');
      setModal(null);
      await load();
    } catch (e: any) {
      toast(e.message || 'Не удалось обновить имя', false);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.adminDeleteUser(id);
      toast('Пользователь удалён навсегда');
      onBack();
    } catch (e: any) {
      toast(e.message || 'Не удалось удалить', false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-sm font-medium hover:bg-accent">
        <ArrowLeft className="h-4 w-4" /> К пользователям
      </button>

      {}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-xl font-bold text-primary">
            {(u.name || u.email || '?').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold">{u.name || 'Без имени'}</h2>
              <button type="button" onClick={() => setModal('rename')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Изменить имя">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="truncate text-sm text-muted-foreground">{u.email}</div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">ID: {u.id}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', u.role === 'ADMIN' ? 'bg-violet-500/15 text-violet-400' : 'bg-muted text-muted-foreground')}>{u.role}</span>
              {u.isBlocked
                ? <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">Заблокирован</span>
                : <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">Активен</span>}
              {u.emailVerified
                ? <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">Email подтверждён</span>
                : <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">Email не подтверждён</span>}
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors',
                tab === t.id ? 'bg-violet-600 text-white' : 'border border-border/60 text-muted-foreground hover:bg-accent'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'profile' && (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {[
            ['Дата регистрации', fmtDate(u.createdAt)],
            ['Последняя активность', u.lastActiveAt ? fmtDate(u.lastActiveAt) : '—'],
            ['Email подтверждён', u.emailVerifiedAt ? fmtDay(u.emailVerifiedAt) : u.emailVerified ? 'да (дата неизвестна)' : 'нет'],
            ['Статус аккаунта', u.isBlocked ? 'Заблокирован' : 'Активен'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-border/60 bg-card/70 p-3">
              <div className="text-muted-foreground">{k}</div>
              <div className="mt-1 font-medium">{v}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'activity' && (
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">Активность</h3>
          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
            {[
              ['Задачи', data.activity.tasks],
              ['Проекты', data.activity.projects],
              ['Привычки', data.activity.habits],
              ['Цели', data.activity.goals],
              ['Фокус', data.activity.focusSessions],
              ['ДР', data.activity.birthdays],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-xl bg-muted/30 p-2.5">
                <div className="text-base font-bold tabular-nums">{v as number}</div>
                <div className="text-muted-foreground">{label as string}</div>
              </div>
            ))}
          </div>
          {data.activity.recentTasks.length > 0 && (
            <>
              <h4 className="mb-2 mt-4 text-xs font-semibold text-muted-foreground">Последние задачи</h4>
              <div className="space-y-1.5">
                {data.activity.recentTasks.map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpenTask(t.id)}
                    className="flex w-full items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-left text-xs hover:border-violet-500/40"
                  >
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="shrink-0 text-muted-foreground">{t.status}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <Tasks onOpen={onOpenTask} initialTaskId={null} toast={toast} userOnly={id} />
      )}

      {tab === 'security' && (
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">Security</h3>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-muted/30 p-3"><div className="text-muted-foreground">Email</div><div className="mt-1 font-medium">{u.email} · {u.emailVerified ? 'Verified' : 'Not verified'}</div></div>
            <div className="rounded-xl bg-muted/30 p-3"><div className="text-muted-foreground">Последний вход</div><div className="mt-1 font-medium">{u.lastActiveAt ? fmtDate(u.lastActiveAt) : '—'}</div></div>
            <div className="rounded-xl bg-muted/30 p-3"><div className="text-muted-foreground">Статус</div><div className="mt-1 font-medium">{u.isBlocked ? 'Заблокирован' : 'Активен'}</div></div>
            <div className="rounded-xl bg-muted/30 p-3"><div className="text-muted-foreground">Пароль</div><div className="mt-1 font-medium">Хранится только в виде bcrypt-хэша</div></div>
          </div>
          <button type="button" onClick={() => setModal('password')} className="mt-3 h-11 rounded-xl border border-border/60 px-4 text-sm font-semibold hover:bg-accent">
            Изменить пароль
          </button>
        </div>
      )}

      {tab === 'actions' && (
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">Admin Actions</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTab('tasks')} className="h-11 rounded-xl border border-border/60 px-4 text-sm font-semibold hover:bg-accent">View Tasks</button>
            <button type="button" onClick={() => setViewAs(true)} className="flex h-11 items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 text-sm font-semibold text-sky-300 hover:bg-sky-500/20">
              <Eye className="h-4 w-4" /> View as User
            </button>
            <button type="button" onClick={() => setModal('password')} className="h-11 rounded-xl border border-border/60 px-4 text-sm font-semibold hover:bg-accent">Change Password</button>
            <button type="button" onClick={() => setModal('role')} className="h-11 rounded-xl border border-border/60 px-4 text-sm font-semibold hover:bg-accent">Изменить роль</button>
            {u.isBlocked
              ? <button type="button" onClick={() => setModal('unblock')} className="h-11 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-300">Разблокировать</button>
              : <button type="button" onClick={() => setModal('block')} className="h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500">Заблокировать</button>}
            <button type="button" onClick={() => setModal('delete')} className="flex h-11 items-center gap-1.5 rounded-xl border border-red-500/50 bg-red-500/10 px-4 text-sm font-semibold text-red-300 hover:bg-red-500/20">
              <Trash2 className="h-4 w-4" /> Удалить пользователя
            </button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Опасные действия выделены красным и требуют подтверждения. Все действия пишутся в Audit Log.</p>
        </div>
      )}

      {viewAs && <ImpersonateView userId={id} userEmail={u.email} onClose={() => setViewAs(false)} />}

      {modal === 'password' && (
        <Modal title="Изменить пароль" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Новый пароль для {u.email}. Хранится только bcrypt-хэш. Старые сессии будут завершены.</p>
            <Field label="Новый пароль">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 6 символов" className={inputCls} autoComplete="new-password" />
            </Field>
            <Field label="Подтвердить пароль">
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} autoComplete="new-password" />
            </Field>
            <button type="button" onClick={() => void doPassword()} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Изменить пароль
            </button>
          </div>
        </Modal>
      )}
      {modal === 'block' && (
        <ConfirmModal
          title="Заблокировать пользователя?"
          text={`${u.email} потеряет доступ к системе. Токены перестанут работать.`}
          confirmLabel="Заблокировать"
          danger
          loading={busy}
          onConfirm={() => void doBlock(true)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'unblock' && (
        <ConfirmModal
          title="Разблокировать пользователя?"
          text={`${u.email} снова сможет войти в систему.`}
          confirmLabel="Разблокировать"
          loading={busy}
          onConfirm={() => void doBlock(false)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'role' && (
        <Modal title="Изменить роль" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/30 p-3 text-xs">Текущая роль: <b>{u.role}</b></div>
            <Field label="Новая роль">
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </Field>
            <button type="button" onClick={() => void doRole()} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Применить
            </button>
          </div>
        </Modal>
      )}
      {modal === 'rename' && (
        <Modal title="Изменить имя (Edit User)" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <Field label="Имя">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
            <button type="button" onClick={() => void doRename()} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Сохранить
            </button>
          </div>
        </Modal>
      )}
      {modal === 'delete' && (
        <ConfirmModal
          title="Удалить пользователя навсегда?"
          text={`${u.email}. Все задачи, проекты, привычки и другие данные будут удалены. Действие необратимо, но этот email сможет зарегистрироваться заново.`}
          confirmLabel="Удалить навсегда"
          danger
          loading={busy}
          onConfirm={() => void doDelete()}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
