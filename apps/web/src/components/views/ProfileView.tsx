"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { useTasksStore } from "@/stores/tasks";
import { useGoalsStore } from "@/stores/goals";
import { useProjectsStore } from "@/stores/projects";
import { useFocusStore } from "@/stores/focus";
import { useEffectsStore } from "@/stores/effects";
import { ThemePicker } from "@/components/ThemePicker";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { showNotification, reminderFireTimes } from "@/lib/notifications";
import { isPushSupported, isPushActive, subscribePush, unsubscribePush } from "@/lib/push";
import { NOTIFY_SOUNDS, getNotifySound, setNotifySound, playNotifySound, type NotifySoundId } from "@/lib/notifySound";
import {
  CheckCircle2,
  ListTodo,
  FolderKanban,
  Activity,
  Bell,
  BellOff,
  LogOut,
  Check,
  X,
  RefreshCw,
  Download,
} from "lucide-react";

type Tab = "profile" | "notifications" | "interface";

export function ProfileView() {
  const { user, setUser, logout } = useAuthStore();
  const { tasks, overdueTasks, fetchTasks, fetchOverdue } = useTasksStore();
  const { goals, fetchGoals } = useGoalsStore();
  const { projects, fetchProjects } = useProjectsStore();
  const { stats, fetchStats } = useFocusStore();
  const { enabled: effectsOn, toggle: toggleEffects } = useEffectsStore();
  const [completed, setCompleted] = useState(0);
  const [tab, setTab] = useState<Tab>("profile");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [notifPerm, setNotifPerm] = useState<string>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [notifSound, setNotifSound] = useState<NotifySoundId>(() => getNotifySound());
  const [diagNow, setDiagNow] = useState(() => Date.now());
  const [pushStatus, setPushStatus] = useState<'checking' | 'unsupported' | 'off' | 'on'>('checking');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');

  const refreshPushStatus = async () => {
    try {
      if (!isPushSupported()) {
        setPushStatus('unsupported');
        return;
      }
      setPushStatus((await isPushActive()) ? 'on' : 'off');
    } catch {
      setPushStatus('off');
    }
  };

  const togglePush = async () => {
    setPushBusy(true);
    setPushError('');
    try {
      if (pushStatus === 'on') {
        await unsubscribePush();
      } else {
        await subscribePush();
        try {
          if (typeof window !== 'undefined' && 'Notification' in window) {
            setNotifPerm(Notification.permission);
          }
        } catch {}
      }
      await refreshPushStatus();
    } catch (e: any) {
      setPushError(e?.message || 'Не удалось подключить push');
    } finally {
      setPushBusy(false);
    }
  };

  // Live diagnostics for the notification pipeline (worker heartbeat + next fire).
  useEffect(() => {
    if (tab !== 'notifications') return;
    refreshPushStatus().catch(() => {});
    const refresh = () => {
      setDiagNow(Date.now());
      try {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          setNotifPerm(Notification.permission);
        }
      } catch {}
    };
    refresh();
    const id = setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refresh);
    };
  }, [tab]);

  const notifDiag = useMemo(() => {
    let lastTick: number | null = null;
    try {
      const raw = localStorage.getItem('tf-notif-worker-tick');
      if (raw) lastTick = Number(raw) || null;
    } catch {}
    let next: number | null = null;
    try {
      for (const t of tasks || []) {
        for (const at of reminderFireTimes(t)) {
          if (at > Date.now() && (next === null || at < next)) next = at;
        }
      }
    } catch {}
    return { lastTick, next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, diagNow]);

  useEffect(() => {
    fetchTasks({ includeCompleted: "true" });
    fetchOverdue();
    fetchGoals();
    fetchProjects();
    fetchStats();
  }, [fetchTasks, fetchOverdue, fetchGoals, fetchProjects, fetchStats]);

  useEffect(() => {
    setCompleted(tasks.filter((t) => t.status === "COMPLETED").length);
  }, [tasks]);

  useEffect(() => {
    setName(user?.name || "");
  }, [user?.name]);

  const total = tasks.length;
  const productivity = useMemo(() => {
    if (total === 0) return 100;
    return Math.round((completed / Math.max(total, 1)) * 100);
  }, [completed, total]);

  const initials = (user?.name || user?.email || "U")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const saveName = async () => {
    if (!name.trim()) return;
    setSavingName(true);
    try {
      const { user: u } = await api.updateProfile({ name: name.trim() });
      setUser?.(u);
      setEditing(false);
    } catch (err: any) {
      alert(err?.message || "Не удалось сохранить имя");
    } finally {
      setSavingName(false);
    }
  };

  const requestNotif = async () => {
    try {
      const res = await Notification.requestPermission();
      setNotifPerm(res);
    } catch {}
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const token = api.getToken();
      const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/export/${format}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        alert('Ошибка экспорта');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download =
        format === 'json'
          ? `taskflow-export-${new Date().toISOString().slice(0, 10)}.json`
          : `taskflow-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert('Ошибка экспорта');
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: "Профиль" },
    { id: "notifications", label: "Уведомления" },
    { id: "interface", label: "Интерфейс" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="tf-view-header px-6 py-4 border-b">
        <h1 className="text-xl font-semibold">Настройки</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Настрой под себя свой TaskFlow</p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap gap-2 mb-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium transition-all",
                  tab === t.id ? "tf-btn-violet" : "border border-border/60 text-muted-foreground hover:bg-accent"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "profile" && (
            <div className="grid gap-4 lg:grid-cols-2 items-start">
              <div className="tf-glass rounded-3xl p-5">
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--primary)), var(--tf-accent2))",
                      boxShadow: "0 0 22px -4px var(--tf-glow)",
                    }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={saveName}
                          disabled={savingName}
                          className="rounded-md p-1.5 text-emerald-500 hover:bg-accent"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(false);
                            setName(user?.name || "");
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-lg font-semibold truncate">{user?.name || "Пользователь"}</div>
                    )}
                    <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
                    {!editing && (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="mt-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        Изменить
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Дата рождения</label>
                    <input
                      type="date"
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background/60 px-2 text-sm"
                      defaultValue={user?.birthday ? String(user.birthday).slice(0, 10) : ""}
                      onChange={async (e) => {
                        const v = e.target.value || null;
                        try {
                          const { user: u } = await api.updateProfile({ birthday: v });
                          setUser?.(u);
                        } catch (err: any) {
                          alert(err?.message || "Не удалось сохранить");
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="tf-glass rounded-3xl p-5">
                  <div className="text-sm font-semibold mb-3">Синхронизация</div>
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-500">
                    <RefreshCw className="h-4 w-4" />
                    Включено
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Последняя синхронизация
                    <br />
                    <span className="font-medium text-foreground">
                      {new Date().toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="tf-btn-hot flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  <LogOut className="h-4 w-4" />
                  Выйти из аккаунта
                </button>
              </div>
            </div>
          )}

          {tab === "notifications" && (
            <div className="tf-glass rounded-3xl p-5 max-w-xl">
              <div className="flex items-center gap-3">
                {notifPerm === "granted" ? (
                  <Bell className="h-5 w-5 text-emerald-500" />
                ) : (
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <div className="text-sm font-semibold">Уведомления браузера</div>
                  <div className="text-xs text-muted-foreground">
                    Статус:{" "}
                    {notifPerm === "granted"
                      ? "включены"
                      : notifPerm === "denied"
                      ? "заблокированы в браузере"
                      : notifPerm === "unsupported"
                      ? "не поддерживаются"
                      : "не запрошены"}
                  </div>
                </div>
                {notifPerm !== "granted" && notifPerm !== "unsupported" && (
                  <button
                    type="button"
                    onClick={requestNotif}
                    className="tf-btn-violet ml-auto rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    Включить
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Напоминания о задачах и днях рождения приходят через браузер, даже если вкладка
                свернута. Проверка — каждую минуту. Для работы уведомлений вкладка TaskFlow должна
                быть открыта хотя бы в фоне.
              </p>
              {notifPerm === "denied" && (
                <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Браузер блокирует уведомления для сайта. Разрешите их в настройках сайта (значок
                  замка в адресной строке), затем обновите страницу.
                </p>
              )}
              <div className="mt-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 text-xs">
                <div className="font-semibold">Диагностика</div>
                <div className="mt-1.5 space-y-1 text-muted-foreground">
                  <div>
                    Проверяющий воркер:{" "}
                    {notifDiag.lastTick ? (
                      <span className="text-foreground">
                        жив · {Math.max(0, Math.round((diagNow - notifDiag.lastTick) / 1000))} сек назад
                      </span>
                    ) : (
                      <span className="text-amber-400">ещё не запускался — откройте раздел «Задачи»</span>
                    )}
                  </div>
                  <div>
                    Ближайшее напоминание:{" "}
                    {notifDiag.next ? (
                      <span className="text-foreground">
                        {new Date(notifDiag.next).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : (
                      <span>нет запланированных среди загруженных задач</span>
                    )}
                  </div>
                  {!('Notification' in (typeof window !== 'undefined' ? window : ({} as any))) && (
                    <div className="text-amber-400">
                      Этот браузер не поддерживает всплывающие уведомления (например, Chrome на
                      телефоне) — напоминания будут видны только внутри приложения.
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 border-t border-border/50 pt-4">
                <div className="text-sm font-semibold">Звук уведомления</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Проигрывается вместе с напоминанием
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {NOTIFY_SOUNDS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setNotifSound(s.id);
                        setNotifySound(s.id);
                        playNotifySound(s.id);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        notifSound === s.id
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    showNotification("TaskFlow — проверка", {
                      body: "Если вы видите это сообщение и слышите звук — уведомления работают.",
                      tag: "tf-notif-test",
                      sound: notifSound,
                    })
                  }
                  className="mt-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20"
                >
                  Проверить уведомление
                </button>
              </div>
              <div className="mt-4 border-t border-border/50 pt-4">
                <div className="text-sm font-semibold">Push на телефон</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Приходят даже с закрытой вкладкой — через сервер TaskFlow
                </p>
                <div className="mt-2 text-xs text-muted-foreground">
                  Статус:{" "}
                  {pushStatus === 'checking' ? (
                    'проверка…'
                  ) : pushStatus === 'on' ? (
                    <span className="font-semibold text-emerald-500">подключён ✓</span>
                  ) : pushStatus === 'unsupported' ? (
                    <span className="text-amber-400">не поддерживается этим браузером</span>
                  ) : (
                    'выключен'
                  )}
                </div>
                {pushStatus === 'unsupported' && (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    iPhone: push работает только если сайт добавлен на экран «Домой» (Поделиться →
                    «На экран Домой») и открыт оттуда. Android Chrome: работает прямо в браузере.
                  </p>
                )}
                {pushError && (
                  <p className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {pushError}
                  </p>
                )}
                {pushStatus !== 'unsupported' && pushStatus !== 'checking' && (
                  <button
                    type="button"
                    disabled={pushBusy}
                    onClick={togglePush}
                    className="mt-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    {pushBusy ? 'Подождите…' : pushStatus === 'on' ? 'Отключить push' : 'Подключить push'}
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "interface" && (
            <div className="grid gap-4 lg:grid-cols-2 items-start">
              <div className="tf-glass rounded-3xl p-5">
                <div className="text-sm font-semibold mb-1">Тема оформления</div>
                <p className="text-xs text-muted-foreground mb-3">Цвета и обои интерфейса</p>
                <ThemePicker />
              </div>
              <div className="tf-glass rounded-3xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Эффекты</div>
                    <p className="text-xs text-muted-foreground">Частицы и свечение</p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleEffects}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors",
                      effectsOn ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        effectsOn ? "left-5" : "left-0.5"
                      )}
                    />
                  </button>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  TaskFlow · {stats?.totalMinutes ?? 0} мин фокуса
                </div>
              </div>
              <div className="tf-glass rounded-3xl p-5 lg:col-span-2">
                <div className="text-sm font-semibold mb-1">Экспорт данных</div>
                <p className="text-xs text-muted-foreground mb-3">Скачайте все задачи в удобном формате</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExport('json')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Экспорт JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport('csv')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Экспорт CSV
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <Stat
              icon={<ListTodo className="h-4 w-4 text-blue-500" />}
              label="Всего задач"
              value={total}
              sub="Все время"
            />
            <Stat
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Выполнено"
              value={completed}
              sub={total ? `${Math.round((completed / total) * 100)}% завершено` : "—"}
            />
            <Stat
              icon={<FolderKanban className="h-4 w-4 text-violet-500" />}
              label="Проектов"
              value={projects.length}
              sub="Активных"
            />
            <Stat
              icon={<Activity className="h-4 w-4 text-amber-500" />}
              label="Продуктивность"
              value={`${productivity}%`}
              sub={overdueTasks.length ? `Просрочено: ${overdueTasks.length}` : "Отличный результат"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="tf-glass rounded-2xl p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
