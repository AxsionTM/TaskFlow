'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatCard, LineChart, DonutChart, Skeleton } from './ui';

export function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminStats().then(setStats).catch((e) => setError(e.message || 'Ошибка загрузки'));
  }, []);

  if (error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>;
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Всего пользователей" value={String(stats.totalUsers)} color="#3b82f6" sub={`Активных: ${stats.activeUsers}`} />
        <StatCard label="Новые сегодня" value={String(stats.newToday)} color="#22c55e" sub={`Неделя: ${stats.newWeek} · Месяц: ${stats.newMonth}`} />
        <StatCard label="Активные подписки" value={String(stats.activeSubscriptions)} color="#a855f7" sub={`Pro: ${stats.proUsers} · Business: ${stats.businessUsers}`} />
        <StatCard label="Баланс пользователей" value={`${stats.totalBalance.toLocaleString('ru-RU')} ₽`} color="#f59e0b" sub={`Free: ${stats.freeUsers}`} />
        <StatCard label="Доход всего" value={`${stats.revenueTotal.toLocaleString('ru-RU')} ₽`} color="#22c55e" sub="Deposits + subscriptions" />
        <StatCard label="Доход сегодня" value={`${stats.revenueToday.toLocaleString('ru-RU')} ₽`} color="#34d399" />
        <StatCard label="Доход за неделю" value={`${stats.revenueWeek.toLocaleString('ru-RU')} ₽`} color="#2dd4bf" />
        <StatCard label="Доход за месяц" value={`${stats.revenueMonth.toLocaleString('ru-RU')} ₽`} color="#38bdf8" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <h3 className="mb-1 text-sm font-semibold">Регистрации пользователей</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">Последние 30 дней</p>
          <LineChart data={stats.registrationsByDay.map((d: any) => ({ date: d.date, value: d.count }))} color="#3b82f6" />
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <h3 className="mb-1 text-sm font-semibold">Доход</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">Последние 30 дней, ₽</p>
          <LineChart data={stats.revenueByDay.map((d: any) => ({ date: d.date, value: d.amount }))} color="#22c55e" />
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <h3 className="mb-1 text-sm font-semibold">Активность пользователей</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">Созданные задачи в день, 30 дней</p>
          <LineChart data={stats.activityByDay.map((d: any) => ({ date: d.date, value: d.count }))} color="#a855f7" />
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <h3 className="mb-3 text-sm font-semibold">Статистика подписок</h3>
          <DonutChart
            center={`${stats.activeSubscriptions} актив.`}
            segments={[
              { label: 'Free', value: stats.freeUsers, color: '#64748b' },
              { label: 'Pro', value: stats.proUsers, color: '#a855f7' },
              { label: 'Business', value: stats.businessUsers, color: '#f59e0b' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
