# PostgreSQL в продакшене

Локально по-прежнему **SQLite** (`dev.db`). В проде `prisma.ts` сам переключается на Postgres, если `DATABASE_URL` начинается с `postgresql://`.

## Шаги деплоя

1. Поднять Postgres (см. `docker-compose.yml` или свой хостинг).
2. В `prisma/schema.prisma` заменить `provider = "sqlite"` на `provider = "postgresql"`.
3. Задать в `.env`:
   ```env
   DATABASE_URL=postgresql://tender:tender@postgres:5432/tenderai
   BACKGROUND_JOBS_IN_NEXT=0
   REDIS_URL=redis://redis:6379
   ```
4. `npx prisma migrate deploy` (или `db push` на чистой БД).
5. Запустить **два процесса**: `npm run start` (web) и `npm run worker`.

## Обратно на SQLite (dev)

Уберите `DATABASE_URL` или оставьте только `file:./dev.db` в `prisma.config.ts` — код снова использует `dev.db`.
