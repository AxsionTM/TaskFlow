# Запуск TaskFlow локально

## Требования

Node.js 20+, Docker (для PostgreSQL), Python 3.11+ (только для `apps/ai`, опционально).

## 1. База данных

```bash
docker run -d --name taskflow-pg \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=taskflow \
  -p 5432:5432 postgres:16-alpine
```

## 2. Backend (`apps/api`)

```bash
cd apps/api
cp .env.example .env   # заполнить DATABASE_URL, JWT_SECRET
npm install
npx prisma db push
npx tsx scripts/promote-admin.ts you@mail.com  # выдать себе admin (после регистрации)
npm run dev            # http://localhost:3001
```

## 3. Frontend (`apps/web`)

```bash
cd apps/web
cp .env.example .env   # NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev            # http://localhost:3000
```

## 4. AI-сервис (опционально)

```bash
cd apps/ai
pip install -r requirements.txt
uvicorn main:app --port 8000
```

Backend использует встроенные эвристики, если сервис недоступен.

## Полезные команды

| Команда | Где | Назначение |
|---|---|---|
| `npm run build` | api, web | production-сборка |
| `npx tsc --noEmit` | api, web | проверка типов |
| `npm run test:admin` | api | E2E админки |
| `npm run test:notes` | api | E2E заметок |
| `npm run test:agent` | api | E2E AI-агента (rule) |
| `npm run test:agent-llm` | api | E2E AI-агента (LLM-стаб) |
| `npm run test:security` | api | E2E безопасность |
| `npm run test:notifmaint` | api | E2E уведомления + maintenance |
| `npx prisma studio` | api | просмотр БД |

E2E требуют поднятый API и чистую тестовую БД.
