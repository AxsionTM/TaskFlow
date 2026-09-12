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
| `REG_MAX_PER_HOUR_IP`, `REG_MAX_EMAILS_PER_HOUR_IP`, `REG_MIN_INTERVAL_SEC`, `REG_PENDING_TTL_MIN`, `REG_MIN_VERIFY_DELAY_SEC` | лимиты регистрации |

### Web (`apps/web`)

| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL API |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | site key виджета Turnstile |

## База данных

Деплой API выполняет `prisma generate && prisma db push`. Бэкапы — на стороне провайдера БД, проверяйте их перед изменениями схемы.

## После деплоя

1. Зарегистрируйте аккаунт через UI и подтвердите email.
2. Выдайте себе admin: `npx tsx scripts/promote-admin.ts you@mail.com` с продовым `DATABASE_URL`.
3. Откройте `/admin`, проверьте Dashboard, Maintenance Mode и рассылку уведомлений.
