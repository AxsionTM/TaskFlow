# Архитектура TaskFlow

Монорепозиторий из трёх приложений:

```text
apps/
  web/   — Next.js 14 + React 18 + Tailwind + Zustand (3 деплоя: web)
  api/   — Express + Prisma + PostgreSQL (деплой: api)
  ai/    — FastAPI, эвристики (деплой: ai, опционально)
```

## Frontend (`apps/web`)

- Next App Router: `/`, `/login`, `/register`, `/verify`, `/forgot`, `/app`, `/admin`
- Состояние — Zustand-сторы (`tasks`, `auth`, `notes`, `focus`, `birthdays`, `projects`, ...), серверное состояние не дублируется
- API-клиент `lib/api.ts`: Bearer JWT, централизованная обработка 401/403/429/503
- Темы через CSS-переменные и `ThemePicker`; админка зафиксирована в тёмном скоупе `.tf-admin`

## Backend (`apps/api`)

Слои: routes → Prisma → PostgreSQL. Общая логика вынесена в `common/` (auth, admin-guard, rate limits, mailer, verification codes, error log).

| Модуль | Маршруты |
|---|---|
| auth | register, verify-email, resend-code, login, forgot/verify-reset/reset-password, me, OAuth |
| tasks | CRUD, complete, trash/restore, reminders, checklist |
| projects, tags, habits, goals, focus, birthdays | CRUD + специализированные |
| notes | CRUD, превью в списке, связь 1-к-1 с задачей |
| agent | chat, confirm, conversations CRUD — оркестрация AI |
| ai | breakdown, priority, day-plan, productivity (прокси + локальные эвристики) |
| notifications | inbox пользователя, read/read-all |
| export | JSON/CSV/Obsidian, импорт ZIP/MD с лимитами |
| graph | узлы и связи для графа |
| admin | stats, users, tasks, subscriptions, transactions, revenue, logs, errors, flags, maintenance |

## AI Agent

```text
USER → AI Chat → rule-движок / LLM → tool calls → backend → Prisma → DB
```

- Без ключа — детерминированный RU-движок (`modules/agent/engine.ts`): интенты, даты (`nl-dates.ts`), контекст диалога
- С ключом (`AI_LLM_KEY`) — function calling к OpenAI-совместимому API (`llm.ts`)
- 30+ инструментов (`tools.ts`) работают только с `userId` из JWT; опасных вызовы требуют confirm-токен
- Диалоги хранятся в `AIConversation` / `AIMessage` / `AIToolCall`

## База данных

PostgreSQL + Prisma. Ключевые модели: `User`, `Account`, `Task` (+`TaskTag`, `ChecklistItem`, `Reminder`, `Comment`), `Note` (1-к-1, cascade), `Project` (+members, sections), `Tag`, `Habit` (+logs), `Goal`, `FocusSession`, `Birthday`, `Notification`, `VerificationCode`, `PendingRegistration`, `Transaction`, `Subscription`, `AdminLog`, `ErrorLog`, `FeatureFlag`, `SystemSetting`, AI-модели.

## Безопасность

JWT HS256 (fail-fast без секрета в production), bcrypt-12, ownership-проверки на каждый запрос, `requireAdmin` на все `/admin/*`, блокировка + инвалидация токенов при смене пароля, поуровневые rate limits, валидация zod с лимитами размеров, санитизация ошибок, Socket.IO с проверкой комнат.
