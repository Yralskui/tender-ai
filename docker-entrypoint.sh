#!/bin/sh
set -e

PERSIST="${PERSIST_DIR:-/data}"
mkdir -p "$PERSIST/app-data/tz-cache" "$PERSIST/uploads"

# SQLite — на постоянном диске
if [ ! -f "$PERSIST/dev.db" ]; then
  echo "[entrypoint] Первый запуск: prisma migrate deploy…"
  npx prisma migrate deploy
  if [ -f /app/dev.db ]; then
    mv /app/dev.db "$PERSIST/dev.db"
  fi
fi
ln -sfn "$PERSIST/dev.db" /app/dev.db

# Кэш ТЗ и состояние auto-sync
rm -rf /app/data
ln -sfn "$PERSIST/app-data" /app/data

# Загруженные РУ / прайсы
mkdir -p /app/public
ln -sfn "$PERSIST/uploads" /app/public/uploads

echo "[entrypoint] БД: $PERSIST/dev.db | data: $PERSIST/app-data"
exec "$@"
