# TenderAI — деплой и производительность

## Архитектура (прод)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js web │────▶│  PostgreSQL │
└─────────────┘     │ (только UI)  │     └─────────────┘
                    └──────┬───────┘            ▲
                           │                    │
                    ┌──────▼───────┐            │
                    │    Redis     │◀───────────┤
                    └──────┬───────┘            │
                           │                    │
                    ┌──────▼───────┐            │
                    │ npm run worker│───────────┘
                    │ синк, ТЗ, кэш │
                    └──────────────┘
```

- **Web**: `BACKGROUND_JOBS_IN_NEXT=0` — не синкает и не rebuild в процессе Next.
- **Worker**: `npm run worker` — синк ЕИС, разбор ТЗ, уведомления, кэш ленты.
- **Redis**: счётчики и кэш (без Redis — память в процессе).

## Локальная разработка

```bash
npm install
npx prisma db push
npm run dev          # терминал 1
npm run worker       # терминал 2 (опционально; иначе фон в Next)
```

## Docker (Postgres + Redis + worker + web)

```bash
cp .env.example .env
# Заполните JWT_SECRET, CRON_SECRET, GROQ_API_KEY

docker compose up -d --build
docker compose exec web npx prisma db push
```

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `BACKGROUND_JOBS_IN_NEXT` | `0` в проде — фон только в worker |
| `WORKER_MODE` | `1` в процессе worker |
| `DATABASE_URL` | `postgresql://…` (прод) или SQLite `file:./dev.db` (dev) |
| `REDIS_URL` | `redis://localhost:6379` |
| `ZAKUPKI_HTTP_CONCURRENCY` | Параллельных запросов к ЕИС (по умолчанию 2) |
| `ZAKUPKI_HTTP_MIN_GAP_MS` | Пауза между запросами (400 ms) |
| `AUTO_SYNC_DISABLE` | `1` — отключить планировщик в Next |

## PostgreSQL (прод)

1. Скопируйте `prisma/schema.prisma`, замените `provider = "sqlite"` на `postgresql`.
2. `DATABASE_URL=postgresql://user:pass@host:5432/tenderai`
3. `npx prisma migrate deploy`

Или используйте `docker-compose.yml` из репозитория.

## CDN

Статика Next.js (`/_next/static`) отдаётся автоматически при деплое на Vercel/Fly/NGINX.
Для своего сервера: настройте `cache-control` для `/_next/static/*` (immutable, 1 year).

## Производительность

- `importedFromEis` — индексируемая колонка вместо `requirements CONTAINS`.
- Кэш ленты — инкрементальный rebuild при смене РУ.
- Очередь zakupki — не более 2–3 одновременных HTTP к ЕИС.
