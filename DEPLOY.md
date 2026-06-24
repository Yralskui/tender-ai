# Выкладка TenderAI на Fly.io

**Почему Fly.io:** Railway занят, а TenderAI нужен **постоянный диск** (SQLite `dev.db`, кэш ТЗ, загрузки РУ). Fly даёт volume + один всегда включённый сервер (auto-sync в `instrumentation.ts`).

Бесплатный поддомен: `https://tender-ai.fly.dev` (имя `app` в `fly.toml` должно быть уникальным — при `fly launch` можно выбрать другое).

Домен покупать **не обязательно** на старте.

---

## 1. Установить Fly CLI

Windows (PowerShell):

```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

Или: https://fly.io/docs/flyctl/install/

```bash
fly auth login
```

---

## 2. Подготовить проект

```bash
cd tender-ai
npm run build   # локально убедиться, что собирается
```

---

## 3. Создать приложение

```bash
fly launch --no-deploy
```

- Выберите регион **ams** (Амстердам) или **fra** (Франкфурт)
- Подтвердите создание **volume** `tender_data` (10 GB)
- Имя приложения должно быть **глобально уникальным** (например `tender-ai-ural`)

Если volume не создался автоматически:

```bash
fly volumes create tender_data --region ams --size 10
```

---

## 4. Секреты (обязательно)

Сгенерируйте длинные случайные строки для `JWT_SECRET` и `CRON_SECRET`.

```bash
fly secrets set ^
  JWT_SECRET="ваш-секрет-32+символов" ^
  CRON_SECRET="другой-секрет" ^
  GROQ_API_KEY="gsk_..." ^
  APP_URL="https://ВАШЕ-ИМЯ.fly.dev"
```

Опционально (почта):

```bash
fly secrets set SMTP_HOST=smtp.bk.ru SMTP_PORT=465 SMTP_USER=... SMTP_PASS=... SMTP_FROM="TenderAI <...>"
```

Проверить:

```bash
fly secrets list
```

---

## 5. Деплой

```bash
fly deploy
```

Открыть в браузере:

```bash
fly open
```

Логи:

```bash
fly logs
```

---

## 6. Перенести локальную базу (опционально)

Если хотите **текущие 6900+ тендеров** с компьютера, а не пустую БД:

```bash
fly ssh sftp shell
```

В sftp:

```
put dev.db /data/dev.db
bye
```

Перезапуск:

```bash
fly apps restart
```

Кэш ТЗ (тяжёлый, можно не переносить — подтянется заново):

```
mkdir /data/app-data/tz-cache
# put -r data/tz-cache/* /data/app-data/tz-cache/
```

---

## 7. Проверка после выкладки

- [ ] Регистрация / вход
- [ ] Лента тендеров
- [ ] Карточка тендера + объём + экономика
- [ ] Загрузка РУ
- [ ] В логах: `[auto-sync] планировщик: CD … мин`

---

## Стоимость (ориентир)

- VM ~1 GB RAM: ~$5–7/мес
- Volume 10 GB: ~$1.5/мес  
Итого **~$7–9/мес** (~700–900 ₽).

---

## Альтернатива: VPS (Timeweb / Hetzner)

Если нужен сервер в РФ или дешевле на год:

1. VPS 2 GB RAM, Ubuntu 24
2. Docker + этот же `Dockerfile`
3. `docker run -v tender_data:/data -p 80:3000 --env-file .env.production`

Тот же образ, другой хостинг.

---

## Переменные окружения

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `JWT_SECRET` | да | Сессии |
| `CRON_SECRET` | да | auto-sync API |
| `APP_URL` | да | Ссылки в письмах |
| `GROQ_API_KEY` | желательно | AI-разбор |
| `SMTP_*` | нет | Почта |
| `AUTO_SYNC_DISABLE` | нет | `1` — выключить планировщик |
| `PERSIST_DIR` | в Fly уже `/data` | Путь к volume |
