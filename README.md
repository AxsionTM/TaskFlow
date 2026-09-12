<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=32&pause=1000&color=3B82F6&center=true&vCenter=true&width=700&height=60&lines=TaskFlow;Task+Manager;Focus+%C2%B7+Habits+%C2%B7+Goals+%C2%B7+Obsidian+Graph" alt="TaskFlow animated title" />
</p>

<h2 align="center">Maxsim (Axsion)</h2>

<p align="center">
  Full-stack Developer · React / Next.js · TypeScript · Python · Product UI
</p>

<p align="center">
  <a href="https://github.com/AxsionTM">
    <img src="https://img.shields.io/badge/GitHub-AxsionTM-black?style=for-the-badge&logo=github" alt="GitHub" />
  </a>
</p>

---

# TaskFlow

<p align="center">
  <strong>Современный планировщик задач и личной продуктивности</strong><br/>
  Задачи · Календарь · Привычки · Цели · Фокус · Obsidian Graph · AI
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Ready%20for%20Work-22c55e?style=for-the-badge" alt="Production ready" />
  <img src="https://img.shields.io/badge/Responsive-Desktop%20%7C%20Tablet%20%7C%20Mobile-8b5cf6?style=for-the-badge" alt="Responsive" />
  <img src="https://img.shields.io/badge/Next.js-14-111827?style=for-the-badge&logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript" />
</p>

## Текущий статус

**TaskFlow полностью собран в рабочую версию и готов к использованию.**

Веб-интерфейс для компьютеров, планшетов и мобильных устройств. Развитие проекта продолжается: новые функции и улучшения добавляются по мере разработки.

>  **Ready for work — дальнейшая разработка продолжается.**

##  Интерфейс TaskFlow

Ниже — общий showcase основных экранов проекта в desktop и mobile вариантах.

<p align="center">
  <img src="./docs/screenshots/taskflow-showcase.png" alt="TaskFlow desktop and mobile showcase" width="100%" />
</p>

<p align="center"><sub>Повестка дня · Привычки · Obsidian Graph · Темы · Профиль</sub></p>

## Навигация

- [Возможности](./docs/features.md)
- [Интерфейс](./docs/interface.md)
- [Архитектура](./docs/architecture.md)
- [Запуск](./docs/setup.md)
- [Развёртывание](./docs/deployment.md)
- [Roadmap](./docs/roadmap.md)

## Быстрый старт

```bash
# PostgreSQL
docker run -d --name taskflow-pg -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=taskflow -p 5432:5432 postgres:16-alpine

# Backend
cd apps/api && cp .env.example .env && npm install
npx prisma db push && npm run dev

# Frontend
cd apps/web && cp .env.example .env && npm install && npm run dev
```

Подробности — в [запуске](./docs/setup.md) и [развёртывании](./docs/deployment.md).
