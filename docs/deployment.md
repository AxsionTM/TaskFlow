# Развёртывание TaskFlow

Три проекта на Vercel: `web`, `api`, `ai`.

## Переменные окружения

### API (`apps/api`)

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | секрет JWT (без него production не стартует) |
| `FRONTEND_URL` | URL frontend для CORS и OAuth-редиректов |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USERNAME`, `EMAIL_PASSWORD`, `EMAIL_FROM` | SMTP для кодов и восстановления пароля |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile, антибот регистрации |
| `AI_SERVICE_URL` | URL Python AI-сервиса (опционально) |
| `AI_LLM_URL`, `AI_LLM_KEY`, `AI_LLM_MODEL` | LLM для AI-агента (опционально) |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | OAuth (опционально) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (сгенерировать: `npx web-push generate-vapid-keys` в `apps/api`) |
| `CRON_SECRET` | секрет планировщика push (длинная случайная строка; Vercel Cron пришлёт её сам, если переменная задана) |
| `REG_MAX_PER_HOUR_IP`, `REG_MAX_EMAILS_PER_HOUR_IP`, `REG_MIN_INTERVAL_SEC`, `REG_PENDING_TTL_MIN`, `REG_MIN_VERIFY_DELAY_SEC` | лимиты регистрации |

### Web (`apps/web`)

| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL API |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | site key виджета Turnstile |

## База данных

Деплой API выполняет `prisma generate && prisma db push`. Бэкапы — на стороне провайдера БД, проверяйте их перед изменениями схемы.

## Web Push (уведомления с закрытой вкладкой и на телефоне)

1. В `apps/api`: `npx web-push generate-vapid-keys`.
2. В Vercel-проекте **api** задайте env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT=mailto:ваш@email` и `CRON_SECRET` (случайная строка, например
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
3. Крон уже описан в `apps/api/vercel.json` (`/cron/dispatch` каждую минуту;
   Vercel сам добавит `Authorization: Bearer $CRON_SECRET`). Частота раз в минуту
   требует платный план Vercel — на бесплатном cron срабатывает редко: тогда
   заведите бесплатный внешний крон (например, cron-job.org) на
   `https://<ваш-api>/cron/dispatch?key=<CRON_SECRET>` каждую минуту.
4. Схема БД применяется сама (`vercel-build`: `prisma generate && prisma db push`).
5. Пользователь включает push в Профиле → Уведомления → «Push на телефон»
   (нужен HTTPS; iPhone — только из сайта, добавленного на экран «Домой»).

## После деплоя

1. Зарегистрируйте аккаунт через UI и подтвердите email.
2. Выдайте себе admin: `npx tsx scripts/promote-admin.ts you@mail.com` с продовым `DATABASE_URL`.
3. Откройте `/admin`, проверьте Dashboard, Maintenance Mode и рассылку уведомлений.
