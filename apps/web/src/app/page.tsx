'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Flame,
  Focus,
  Goal,
  LayoutDashboard,
  ListChecks,
  Menu,
  Network,
  Sparkles,
  Target,
  Timer,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const features = [
  {
    icon: ListChecks,
    title: 'Задачи и проекты',
    text: 'Создавайте задачи, проекты, подзадачи, приоритеты и статусы без лишней сложности.',
  },
  {
    icon: CalendarDays,
    title: 'Календарь и планы',
    text: 'Планируйте день, неделю и месяц, чтобы видеть нагрузку и не держать всё в голове.',
  },
  {
    icon: Flame,
    title: 'Привычки',
    text: 'Формируйте полезные привычки и отслеживайте серии, прогресс и регулярность.',
  },
  {
    icon: Goal,
    title: 'Цели',
    text: 'Разбивайте большие цели на понятные шаги и следите за движением к результату.',
  },
  {
    icon: Timer,
    title: 'Фокус',
    text: 'Запускайте Pomodoro-сессии и работайте концентрированно, не отвлекаясь на лишнее.',
  },
  {
    icon: Network,
    title: 'Граф связей',
    text: 'Связывайте задачи и проекты между собой и получайте визуальную карту своей работы.',
  },
  {
    icon: Sparkles,
    title: 'AI-помощник',
    text: 'Разбивайте сложные задачи и получайте идеи по планированию рабочего дня.',
  },
  {
    icon: Bell,
    title: 'Напоминания',
    text: 'Не пропускайте важное благодаря срокам, напоминаниям и уведомлениям.',
  },
];

const steps = [
  ['01', 'Создайте аккаунт', 'Регистрация занимает меньше минуты. Никаких сложных настроек.'],
  ['02', 'Добавьте свои дела', 'Создавайте проекты, задачи, цели и привычки так, как удобно именно вам.'],
  ['03', 'Планируйте и выполняйте', 'Используйте календарь, фокус-режим и аналитику, чтобы двигаться вперёд.'],
];

const stats = [
  ['01', 'Задачи', 'Всё важное собрано в одном месте'],
  ['02', 'Привычки', 'Регулярность превращается в результат'],
  ['03', 'Цели', 'Большие планы становятся конкретными'],
  ['04', 'Фокус', 'Меньше отвлечений — больше сделанного'],
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="TaskFlow">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
        <Check className="h-5 w-5" strokeWidth={3} />
      </span>
      <span className="text-lg font-bold tracking-tight">TaskFlow</span>
    </Link>
  );
}

function ProductPreview() {
  const miniTasks = [
    ['Закончить дизайн главной', true],
    ['Подготовить план на неделю', true],
    ['30 минут чтения', false],
    ['Обновить портфолио', false],
  ];

  return (
    <div className="relative mx-auto w-full max-w-6xl">
      <div className="absolute -inset-10 rounded-[3rem] bg-primary/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0d1220] shadow-2xl shadow-black/30">
        <div className="flex h-11 items-center gap-2 border-b border-white/10 px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
          <div className="ml-4 flex h-6 flex-1 items-center rounded-md bg-white/[0.04] px-3 text-[10px] text-slate-500">
            taskflow.local/app
          </div>
        </div>

        <div className="grid min-h-[430px] grid-cols-[170px_1fr] md:grid-cols-[210px_1fr]">
          <aside className="border-r border-white/10 bg-white/[0.02] p-4">
            <div className="mb-7 flex items-center gap-2 text-sm font-semibold text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <Check className="h-4 w-4" />
              </span>
              TaskFlow
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                [LayoutDashboard, 'Сегодня', true],
                [CalendarDays, 'Календарь', false],
                [Target, 'Цели', false],
                [Flame, 'Привычки', false],
                [Timer, 'Фокус', false],
              ].map(([Icon, label, active]) => (
                <div
                  key={label as string}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${active ? 'bg-primary/15 text-primary' : 'text-slate-500'}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label as string}
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0 p-5 md:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-primary">Сегодня</p>
                <h3 className="text-xl font-semibold text-white md:text-2xl">Добрый день 👋</h3>
                <p className="mt-1 text-xs text-slate-500">Вот что запланировано на сегодня</p>
              </div>
              <div className="hidden rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right sm:block">
                <p className="text-[10px] text-slate-500">Прогресс дня</p>
                <p className="mt-0.5 text-sm font-semibold text-white">68%</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['12', 'задач', 'на сегодня'],
                ['4', 'выполнено', 'за сегодня'],
                ['2ч 40м', 'фокус', 'на этой неделе'],
              ].map(([value, label, sub]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <p className="text-lg font-semibold text-white">{value}</p>
                  <p className="text-[11px] font-medium text-slate-300">{label}</p>
                  <p className="mt-1 text-[10px] text-slate-600">{sub}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-white">Мои задачи</p>
                  <span className="text-[10px] text-primary">Сегодня</span>
                </div>
                <div className="space-y-2">
                  {miniTasks.map(([task, done]) => (
                    <div key={task} className="flex items-center gap-2.5 rounded-lg bg-black/10 px-2.5 py-2">
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${done ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-600'}`}>
                        {done && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className={`text-[11px] ${done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{task}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-white">Активность</p>
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-5 flex h-28 items-end gap-1.5">
                  {[32, 48, 40, 64, 55, 78, 92, 68, 84, 70, 96, 75].map((height, index) => (
                    <div key={index} className="flex-1 rounded-t-md bg-primary/20">
                      <div className="w-full rounded-t-md bg-primary" style={{ height: `${height}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[9px] text-slate-600">
                  <span>Пн</span><span>Ср</span><span>Пт</span><span>Вс</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualShowcase() {
  const chips = [
    ['Задачи', 'Планируй и выполняй без лишнего'],
    ['Календарь', 'Весь день перед глазами'],
    ['Граф', 'Связи между задачами'],
    ['Фокус', 'Работай глубже и спокойнее'],
    ['AI', 'Помощь с планированием'],
  ];

  return (
    <div className="relative mx-auto w-full max-w-7xl">
      {/* Desktop: native UI mockup. The portrait promo artwork is intentionally hidden. */}
      <div className="hidden md:block">
        <ProductPreview />
      </div>

      {/* Mobile: portrait artwork is a much better fit than a squeezed desktop dashboard. */}
      <div className="relative md:hidden">
        <div className="absolute -inset-5 rounded-[2.5rem] bg-primary/10 blur-3xl" />
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#050812] p-1.5 shadow-2xl shadow-black/50">
          <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-black">
            <div className="relative aspect-[9/16] w-full">
              <Image
                src="/showcase/taskflow-ui-showcase.png"
                alt="TaskFlow на мобильном устройстве"
                fill
                priority
                sizes="(max-width: 767px) 92vw, 0px"
                className="object-cover object-center"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
        {chips.map(([title, text]) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.025] px-3 py-3">
            <p className="text-xs font-semibold text-white">{title}</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  // Если уже вошли — сразу в приложение, а не на лендинг.
  // Токен живет в localStorage конкретного домена, поэтому важно
  // открывать один и тот же канонический URL (без www / превью-доменов).
  useEffect(() => {
    try {
      if (localStorage.getItem('token')) router.replace('/app');
    } catch {}
  }, [router]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#070a12] text-white selection:bg-primary/30">
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
        <div className="absolute left-[-20%] top-[-15%] h-[520px] w-[520px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute right-[-15%] top-[20%] h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-[130px]" />
        <div className="absolute bottom-[-20%] left-[30%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[140px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#070a12]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Logo />

          <nav className="hidden items-center gap-7 text-sm text-slate-400 md:flex">
            <a href="#features" className="transition hover:text-white">Возможности</a>
            <a href="#how" className="transition hover:text-white">Как это работает</a>
            <a href="#preview" className="transition hover:text-white">Интерфейс</a>
            <a href="#about" className="transition hover:text-white">О TaskFlow</a>
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">
              Войти
            </Link>
            <Link href="/register" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:bg-primary/90">
              Регистрация
            </Link>
          </div>

          <button
            className="rounded-xl border border-white/10 p-2 text-slate-300 sm:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Открыть меню"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/[0.07] bg-[#070a12] px-5 py-4 sm:hidden">
            <div className="flex flex-col gap-1 text-sm">
              {[
                ['#features', 'Возможности'],
                ['#how', 'Как это работает'],
                ['#preview', 'Интерфейс'],
                ['#about', 'О TaskFlow'],
              ].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2.5 text-slate-400 hover:bg-white/5 hover:text-white">
                  {label}
                </a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                <Link href="/login" className="rounded-xl border border-white/10 py-2.5 text-center text-slate-300">Войти</Link>
                <Link href="/register" className="rounded-xl bg-primary py-2.5 text-center font-semibold text-primary-foreground">Регистрация</Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-20 pt-20 sm:px-8 sm:pt-28 lg:px-10 lg:pb-28">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Всё для продуктивности — в одном месте
          </div>
          <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
            Планируй меньше.
            <span className="block bg-gradient-to-r from-primary via-violet-400 to-blue-400 bg-clip-text text-transparent">
              Успевай больше.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
            TaskFlow помогает управлять задачами, проектами, привычками и целями в одном понятном пространстве. Планируй день, сохраняй фокус и двигайся к результату.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/20 transition hover:-translate-y-0.5 hover:bg-primary/90">
              Начать бесплатно
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
            <a href="#preview" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 text-sm font-semibold text-white transition hover:bg-white/[0.07]">
              Посмотреть интерфейс
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
            {['Бесплатная регистрация', 'Без сложной настройки', 'Все основные функции внутри'].map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div id="preview" className="mt-16 scroll-mt-24 sm:mt-20">
          <VisualShowcase />
        </div>
      </section>

      <section id="about" className="relative z-10 border-y border-white/[0.07] bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:px-10 lg:py-20">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Почему TaskFlow</p>
            <h2 className="max-w-lg text-3xl font-bold tracking-tight sm:text-4xl">Не просто список задач, а рабочее пространство.</h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
              Вместо десятка разрозненных приложений соберите свою систему продуктивности в одном месте. TaskFlow объединяет планирование, выполнение и анализ.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.map(([number, title, text]) => (
              <div key={number} className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-primary/20 hover:bg-white/[0.04]">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-mono text-primary/70">{number}</span>
                  <Zap className="h-4 w-4 text-primary/70 transition group-hover:text-primary" />
                </div>
                <h3 className="mt-7 text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Возможности</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Всё необходимое для продуктивного дня</h2>
          <p className="mt-4 text-sm leading-6 text-slate-400 sm:text-base">TaskFlow растёт вместе с твоей системой работы — от простых задач до полноценного планирования.</p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition duration-300 hover:-translate-y-1 hover:border-primary/25 hover:bg-white/[0.045]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary transition group-hover:scale-105 group-hover:bg-primary/15">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-5 text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="relative z-10 border-y border-white/[0.07] bg-white/[0.015] scroll-mt-20">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Как это работает</p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">От идеи до результата — три простых шага</h2>
            </div>
            <Link href="/register" className="group inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Создать аккаунт
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {steps.map(([number, title, text], index) => (
              <div key={number} className="relative rounded-2xl border border-white/[0.08] bg-[#090d17] p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-primary">{number}</span>
                  {index < steps.length - 1 && <ArrowRight className="hidden h-4 w-4 text-slate-700 lg:block" />}
                </div>
                <div className="mt-12 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-primary">
                  {index === 0 ? <Users className="h-5 w-5" /> : index === 1 ? <ListChecks className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/15 via-violet-500/10 to-transparent p-8 sm:p-12 lg:p-16">
          <div className="absolute right-[-80px] top-[-120px] h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <CircleDot className="h-5 w-5" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Готов навести порядок в своих делах?</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Создай бесплатный аккаунт и попробуй TaskFlow на своих задачах. Никаких длинных инструкций — просто начни.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="group inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90">
                Начать бесплатно
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link href="/login" className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-black/10 px-6 text-sm font-semibold text-white transition hover:bg-white/5">
                Уже есть аккаунт
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-7 text-xs text-slate-600 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-slate-400">TaskFlow</span>
            <span>— планируй. выполняй. развивайся.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/login" className="transition hover:text-slate-300">Войти</Link>
            <Link href="/register" className="transition hover:text-slate-300">Регистрация</Link>
            <span>© 2026 TaskFlow</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
