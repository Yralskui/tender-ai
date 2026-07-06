# TenderAI — что реализовано (снимок на июль 2026)

Документ для быстрого входа в контекст после паузы. Подробности деплоя — `docs/DEPLOY.md`.

---

## Стек и запуск

| Компонент | Описание |
|-----------|----------|
| **Next.js 16** | UI, API routes, SSR карточек тендеров |
| **Prisma + SQLite** (dev) / Postgres (prod) | Пользователи, тендеры, документы, уведомления |
| **Worker** `npm run worker` | Фон: синк ЕИС, разбор ТЗ, кэш ленты, email-уведомления |
| **dev:all** `npm run dev:all` | Next + worker в одном терминале (`scripts/dev-with-worker.mjs`) |

```powershell
# Перед стартом — убить сиротские node-процессы после Ctrl+C
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
npm run dev:all
```

В логе воркера после `старт` должно быть:
`zakupki TLS OK {"via":"curl","status":200}`

---

## Аутентификация и email

### Регистрация с подтверждением почты
- Поля в `User`: `emailVerifiedAt`, `emailVerificationToken`, `emailVerificationExpiresAt`
- Регистрация **не** выдаёт cookie до верификации → редирект на `/auth/verify-email`
- Логин блокирует неверифицированных (`EMAIL_NOT_VERIFIED`)
- API: `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`
- Старые пользователи: `emailVerifiedAt = createdAt` (grandfather)

### Отправка писем (`src/lib/email.ts`)
- SMTP (Mail.ru / bk.ru) + fallback **Resend** (`RESEND_API_KEY`)
- Mail.ru **требует пароль приложения**, не обычный пароль → `535 NEOBHODIM parol prilozheniya`
- В dev при ошибке SMTP — письмо в консоль (`[email:dev-fallback]`), не падаем
- Если задан `SMTP_HOST` в `.env` — не перебираем 4 хоста на каждое письмо

### Переменные `.env` (см. `.env.example`)
```
APP_URL=http://localhost:3000
SMTP_HOST=smtp.bk.ru
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...          # пароль приложения!
ZAKUPKI_CA_FILE=./certs/russian_trusted_root_ca_combined.pem
```

---

## Zakupki.gov.ru и TLS (Windows)

Node.js **не** доверяет российским CA из коробки. Решение:

1. PEM-файл: `certs/russian_trusted_root_ca_combined.pem` (корень + sub CA)
2. `ZAKUPKI_CA_FILE` в `.env` — путь резолвится от корня репо (`src/lib/zakupkiTls.ts`)
3. На Windows fetch идёт через **curl.exe** с `--cacert` (`src/lib/zakupkiQueue.ts`)
4. Worker грузит `.env` через `scripts/load-env.cjs` (CRLF-safe: `src/lib/loadEnvFile.ts`)

**Типичные проблемы:**
- «ZAKUPKI_CA_FILE не задан» — сиротский worker или неверный cwd → `Stop-Process node` + `dev:all`
- TLS OK в логе, но «файлов ТЗ не найдено» — у тендера нет файла на ЕИС, не ошибка TLS

---

## Синк тендеров и разбор ТЗ

### Импорт с ЕИС (`src/lib/zakupkiImport.ts`, `zakupkiDocuments.ts`)
- Синк по CD-ленте, обновление карточек
- Скачивание вложений в `data/tz-cache/{regNumber}/`
- Парсинг DOCX/PDF/XLSX → `productSpecs`, `tzProducts`, `tzVolumes`
- Флаг `tzParsedFromFile` — разобрано из файла, не только HTML карточки

### Фоновый worker (`src/worker/run.ts`)
- Тик синка ~20 мин, tz-enrich пачками по 20 тендеров
- Очереди на файлах: `data/job-queues/` (`fileJobQueue.ts`, `feedCacheJobQueue.ts`)
- `BACKGROUND_JOBS_IN_NEXT=0` — Next не дублирует фоновые задачи

### Разбор ТЗ на карточке
- Кнопка «Разобрать ТЗ сейчас» → `POST /api/tenders/[id]/analyze-tz`
- Счётчик характеристик в сообщении = **то же число**, что в блоке «Наборы и позиции ТЗ» (`summarizeTzDisplayCounts` в `tenderPresentation.ts`), а не сырой `productSpecs.length`

### Парсер и UI «наборов»
- `buildProcurementBundles` (`tzProcurementBundles.ts`) — изделие + признаки
- Мусор (КТРУ, № позиции, юридический текст) отфильтровывается (`tzSanitizer.ts`)
- Медтекстиль: `medicalTextileOozParser.ts`, таблицы DOCX: `docxTableParser.ts`

---

## Лента тендеров и кэш

- `TenderMatch` — предрасчёт ранга/совпадения для компании
- Очередь `feed-cache`: rebuild / stale / global
- **stale** — пересчёт при смене каталога компании (хэш документов)
- **global** — обновление после разбора ТЗ для всех компаний
- Шум в логах `global x1` — схлопывание задач в `feedCacheJobQueue.ts`

---

## Документы на карточке тендера

- Список с ЕИС: `GET /api/tenders/[id]/documents/list`
- Скачивание: `GET /api/tenders/[id]/documents/download?name=...`
- **Проект контракта** часто не в локальном кэше (качаем в приоритете ТЗ)
- UI: `DocumentDownloadLink` — анимированная карточка ошибки вместо JSON 404
- Страница: `/tenders/[id]/documents/unavailable` — если открыли ссылку в браузере

---

## Оплата и промокоды

- Модели: `PromoCode`, `PromoCodeRedemption` (миграция `20260702120000_promo_codes`)
- `src/lib/pricing.ts`, `src/lib/promoCodes.ts`
- API: `POST /api/payment/promo/validate`, `POST /api/payment/promo/redeem`
- UI: вкладки месяц/год + поле промокода в `PaywallClient.tsx`, `LandingPricing.tsx`
- Сид демо-промо: `npm run` / `scripts/seed-promo-codes.ts`

---

## Уведомления

- Типы: новый тендер, высокое совпадение, дедлайн, истечение документа, ключевые слова в названии
- Миграция: `20260627120000_notification_title_keywords`
- Instant email при создании (`notificationService.ts`) — нужен рабочий SMTP/Resend
- UI: колокольчик, настройки в профиле (`NotificationPrefsPanel.tsx`)

---

## Прочее

| Функция | Файлы |
|---------|--------|
| Метки тендеров | `TenderLabel`, API `/api/tender-labels` |
| Нацрежим | `NationalRegimePanel`, `nationalRegime.ts` |
| Экономика по прайсам | `buildTenderEconomics`, supplier price sync |
| Docker prod | `docker-compose.yml`, `Dockerfile` |
| Postgres заметки | `prisma/POSTGRES.md` |

---

## Отладочные скрипты

В `scripts/debug-*.ts`, `scripts/fetch-tender-tz.ts` — одноразовые проверки парсера/матчинга. Не вызываются из продакшена.

---

## Что не коммитить / не пушить публично

- Секреты в `.env` (SMTP_PASS, JWT_SECRET, API keys)
- `data/tz-cache/` — гигабайты, в `.gitignore`
- `data/job-queues/` — runtime, в `.gitignore`
- `dev.db` — локальная SQLite (лучше `prisma db push` на новой машине)

---

## История коммитов (ориентир)

После этого снимка смотрите `git log` — сообщения коммитов сгруппированы по фичам (auth, zakupki TLS, promos, UX документов).
