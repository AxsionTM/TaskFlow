'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton, EmptyState, ConfirmModal, Field, inputCls, fmtDate, fmtDay, fmtMoney } from './ui';
import { cn } from '@/lib/utils';

type Toast = (text: string, ok?: boolean) => void;

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

export function UserDetail({ id, onBack, toast }: { id: string; onBack: () => void; toast: Toast }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'balance' | 'withdraw' | 'plan' | 'block' | 'unblock' | 'role' | 'rename' | null>(null);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [plan, setPlan] = useState('PRO');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [price, setPrice] = useState('');
  const [role, setRole] = useState('USER');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminUser(id);
      setData(res);
      setPlan(res.user.plan === 'FREE' ? 'PRO' : res.user.plan);
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

  const doBalance = async (kind: 'balance' | 'withdraw') => {
    const sum = Number(amount);
    if (!Number.isFinite(sum) || sum <= 0) {
      toast('Введите корректную сумму', false);
      return;
    }
    setBusy(true);
    try {
      if (kind === 'balance') await api.adminDeposit(id, sum, comment || undefined);
      else await api.adminWithdraw(id, sum, comment || undefined);
      toast(kind === 'balance' ? 'Баланс успешно пополнен' : 'Средства успешно списаны');
      setModal(null);
      setAmount('');
      setComment('');
      await load();
    } catch (e: any) {
      toast(e.message || 'Не удалось изменить баланс', false);
    } finally {
      setBusy(false);
    }
  };

  const doPlan = async () => {
    setBusy(true);
    try {
      await api.adminSetPlan(id, {
        plan,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        price: price ? Number(price) : 0,
      });
      toast('Тариф успешно изменён');
      setModal(null);
      await load();
    } catch (e: any) {
      toast(e.message || 'Не удалось изменить тариф', false);
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

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-sm font-medium hover:bg-accent">
        <ArrowLeft className="h-4 w-4" /> К пользователям
      </button>

      {/* Профиль */}
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
              <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', u.plan === 'FREE' ? 'bg-muted text-muted-foreground' : 'bg-violet-500/15 text-violet-400')}>{u.plan}</span>
              {u.isBlocked
                ? <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">Заблокирован</span>
                : <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">Активен</span>}
              {u.emailVerified
                ? <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">Email подтверждён</span>
                : <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">Email не подтверждён</span>}
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 text-xs sm:w-auto sm:grid-cols-2">
            <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Регистрация</div><div className="mt-0.5 font-medium">{fmtDate(u.createdAt)}</div></div>
            <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Активность</div><div className="mt-0.5 font-medium">{u.lastActiveAt ? fmtDate(u.lastActiveAt) : '—'}</div></div>
            <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Email подтверждён</div><div className="mt-0.5 font-medium">{u.emailVerifiedAt ? fmtDay(u.emailVerifiedAt) : '—'}</div></div>
            <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Подписка до</div><div className="mt-0.5 font-medium">{u.planExpiresAt ? fmtDay(u.planExpiresAt) : '—'}</div></div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setModal('balance')} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500">Пополнить баланс</button>
          <button type="button" onClick={() => setModal('withdraw')} className="h-10 rounded-xl border border-border/60 px-4 text-sm font-semibold hover:bg-accent">Списать средства</button>
          <button type="button" onClick={() => setModal('plan')} className="h-10 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 text-sm font-semibold text-violet-300 hover:bg-violet-500/20">Изменить тариф</button>
          <button type="button" onClick={() => setModal('role')} className="h-10 rounded-xl border border-border/60 px-4 text-sm font-semibold hover:bg-accent">Изменить роль</button>
          {u.isBlocked
            ? <button type="button" onClick={() => setModal('unblock')} className="h-10 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-300">Разблокировать</button>
            : <button type="button" onClick={() => setModal('block')} className="h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500">Заблокировать</button>}
        </div>
      </div>

      {/* Финансы */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">Финансы</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/30 p-3"><div className="text-lg font-bold tabular-nums">{fmtMoney(data.finance.balance)}</div><div className="text-[11px] text-muted-foreground">баланс</div></div>
          <div className="rounded-xl bg-muted/30 p-3"><div className="text-lg font-bold tabular-nums text-emerald-400">+{fmtMoney(data.finance.totalIn)}</div><div className="text-[11px] text-muted-foreground">пополнения</div></div>
          <div className="rounded-xl bg-muted/30 p-3"><div className="text-lg font-bold tabular-nums text-red-400">−{fmtMoney(data.finance.totalOut)}</div><div className="text-[11px] text-muted-foreground">расходы</div></div>
        </div>
        <h4 className="mb-2 mt-4 text-xs font-semibold text-muted-foreground">Последние транзакции</h4>
        {data.finance.transactions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Операций нет</p>
        ) : (
          <div className="space-y-1.5">
            {data.finance.transactions.map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs">
                <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 font-semibold', t.amount >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                  {t.amount >= 0 ? '+' : ''}{t.amount}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.description || t.type}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{fmtDate(t.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Подписка */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold">Подписка</h3>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Тариф</div><div className="mt-0.5 font-semibold">{u.plan}</div></div>
          <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Начало</div><div className="mt-0.5 font-medium">{u.planStartedAt ? fmtDay(u.planStartedAt) : '—'}</div></div>
          <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Окончание</div><div className="mt-0.5 font-medium">{u.planExpiresAt ? fmtDay(u.planExpiresAt) : '—'}</div></div>
          <div className="rounded-xl bg-muted/30 p-2.5"><div className="text-muted-foreground">Статус</div><div className="mt-0.5 font-medium">{u.plan === 'FREE' ? 'Free' : u.planExpiresAt && new Date(u.planExpiresAt) < new Date() ? 'Истекла' : 'Активна'}</div></div>
        </div>
        <h4 className="mb-2 mt-4 text-xs font-semibold text-muted-foreground">История тарифов</h4>
        {data.subscriptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">История пуста</p>
        ) : (
          <div className="space-y-1.5">
            {data.subscriptions.map((s: any) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs">
                <span className="font-semibold">{s.plan}</span>
                <span className={cn('rounded-md px-1.5 py-0.5 font-semibold', s.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground')}>{s.status}</span>
                <span className="text-muted-foreground">{fmtDay(s.startedAt)} → {s.endsAt ? fmtDay(s.endsAt) : '∞'}</span>
                {s.price > 0 && <span className="tabular-nums text-muted-foreground">{s.price} ₽</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Активность */}
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
                <div key={t.id} className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-muted-foreground">{t.status}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {(modal === 'balance' || modal === 'withdraw') && (
        <Modal title={modal === 'balance' ? 'Пополнить баланс' : 'Списать средства'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/30 p-3 text-xs">Текущий баланс: <b className="tabular-nums">{fmtMoney(u.balance)}</b></div>
            <Field label="Сумма">
              <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inputCls} />
            </Field>
            <Field label="Комментарий">
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Причина операции" className={inputCls} />
            </Field>
            <button type="button" onClick={() => void doBalance(modal)} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {modal === 'balance' ? 'Пополнить' : 'Списать'}
            </button>
          </div>
        </Modal>
      )}
      {modal === 'plan' && (
        <Modal title="Изменить тариф" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/30 p-3 text-xs">Текущий тариф: <b>{u.plan}</b>{u.planExpiresAt ? ` до ${fmtDay(u.planExpiresAt)}` : ''}</div>
            <Field label="Новый тариф">
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCls}>
                <option value="FREE">FREE</option>
                <option value="PRO">PRO</option>
                <option value="BUSINESS">BUSINESS</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Дата начала">
                <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Дата окончания">
                <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Цена, ₽">
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className={inputCls} />
            </Field>
            <button type="button" onClick={() => void doPlan()} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Применить
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
        <Modal title="Изменить имя" onClose={() => setModal(null)}>
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
    </div>
  );
}
