# Выкладка TenderAI на свой VPS (AdminVPS, Ubuntu 22.04/24.04)

Стек — `docker-compose.yml` в корне репозитория: один сервис `web` (SQLite,
фоновые задачи — авто-синк тендеров, разбор ТЗ — работают в том же процессе,
см. `instrumentation.ts`). Postgres/Redis в проекте пока не доведены до
рабочего состояния (миграции в `prisma/migrations` написаны только под
SQLite) — не переключайте `DATABASE_URL` на `postgres://`, пока это не
починено отдельно.

Всё выполняется через SSH под root на сервере. Домен ниже обозначен как
`ВАШ-ДОМЕН.ru` — замените на свой.

---

## 0. Перед началом

- [ ] A-запись домена `ВАШ-ДОМЕН.ru` → IP вашего VPS (проверить: `ping ВАШ-ДОМЕН.ru`, должен ответить IP сервера)
- [ ] SSH-доступ: `ssh root@ВАШ_IP`

---

## 1. Базовая настройка сервера

```bash
apt update && apt upgrade -y
```

Своп — полезно на тарифах с небольшим RAM, чтобы сборка `next build` внутри Docker не падала по памяти (при ≥4 ГБ RAM можно пропустить):

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Docker + Compose plugin:

```bash
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin git
```

Фаервол (важно открыть SSH **до** включения, иначе потеряете доступ):

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Порт 3000 наружу не открываем — сайт слушает `127.0.0.1:3000`, наружу отдаёт только Caddy (шаг 5).

---

## 2. Склонировать репозиторий

Репозиторий приватный — нужен личный токен GitHub (Settings → Developer settings → Personal access tokens → создать с правом `repo`, только для чтения).

```bash
cd /opt
git clone https://<ВАШ_GITHUB_ЛОГИН>:<ВАШ_ТОКЕН>@github.com/Yralskui/tender-ai.git tender-ai
cd tender-ai
```

Если хотите унести с собой текущую локальную базу (накопленные тендеры), а не начинать с пустой — скопируйте `dev.db` со своего компьютера поверх (см. раздел 7, «перенос базы»). Иначе база наполнится сама за счёт авто-синка в течение ~20 минут после запуска.

`dev.db` — файл, отслеживаемый в git (репозиторий приватный, синхронизируется между вашими машинами). На сервере после первого деплоя пометьте его как «не трогать при git pull», иначе следующее обновление кода перезапишет боевую базу версией из репозитория:

```bash
git update-index --skip-worktree dev.db
```

---

## 3. Настроить `.env`

```bash
cp .env.example .env
nano .env
```

Сгенерировать случайные секреты (выполните дважды, вставьте разные значения в `.env`):

```bash
openssl rand -hex 32
```

Заполнить в `.env`:

| Переменная | Значение |
|---|---|
| `JWT_SECRET` | случайная строка выше |
| `CRON_SECRET` | другая случайная строка |
| `APP_URL` | `https://ВАШ-ДОМЕН.ru` |
| `NEXT_PUBLIC_APP_URL` | `https://ВАШ-ДОМЕН.ru` |
| `GROQ_API_KEY` | ваш ключ Groq |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` | ваша почта |

`chmod 600 .env` — файл содержит секреты.

---

## 4. Собрать и запустить

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=50 web
```

В логах должно быть `▲ Next.js …`, `✓ Ready …` и `[auto-sync] планировщик: CD 20 мин…`.

Быстрая проверка изнутри сервера:

```bash
curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3000/
```

Должно быть `HTTP 200`. Наружу порт 3000 пока не открыт — это нормально, следующий шаг добавит HTTPS.

---

## 5. HTTPS через Caddy (автоматический сертификат)

Caddy сам получает и продлевает сертификат Let's Encrypt — конфиг из двух строк. Домен обязательно должен уже указывать на IP сервера (шаг 0), иначе выпуск сертификата не пройдёт.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
ВАШ-ДОМЕН.ru {
    reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy
```

Через 10–30 секунд сайт должен открыться по `https://ВАШ-ДОМЕН.ru` с валидным замком.

---

## 6. Проверка после выкладки

- [ ] Регистрация / вход (сессия — `secure`-cookie, работает только по HTTPS, поэтому шаг 5 обязателен)
- [ ] Лента тендеров подтягивается (подождите ~20 мин или смотрите `docker compose logs -f web`)
- [ ] Карточка тендера + объём + экономика открываются
- [ ] Письма (email-верификация) приходят — проверить SMTP в `.env`
- [ ] `/privacy` и `/terms` открываются

---

## 7. Дальнейшие обновления

```bash
cd /opt/tender-ai
git pull
docker compose build
docker compose up -d
```

`dev.db` не тронется благодаря `git update-index --skip-worktree dev.db` из шага 2.

Перенос базы с другого компьютера (например, если накопили тендеры локально и хотите заменить пустую боевую базу):

```bash
# с локальной машины:
scp dev.db root@ВАШ_IP:/opt/tender-ai/dev.db
# на сервере:
cd /opt/tender-ai && docker compose restart web
```

Полезные команды:

```bash
docker compose logs -f web   # логи сайта и фоновых задач
docker compose restart web   # перезапуск без пересборки
docker compose down          # остановить (dev.db и data/ на хосте — не теряются)
```

---

## Отложено на потом: Postgres

`src/lib/prisma.ts` умеет подключаться и к Postgres (через `@prisma/adapter-pg`), но
`schema.prisma` жёстко объявляет `datasource db { provider = "sqlite" }`, и вся история
миграций (`prisma/migrations`) написана под SQLite. Сгенерированный Prisma Client
скомпилирован под диалект SQLite — `prisma db push`/`migrate deploy` против Postgres
падают с `P1013` (protocol mismatch), а рантайм-адаптер эту проблему не решает.

Чтобы честно включить Postgres, понадобится: сменить `provider` на `postgresql`,
перегенерировать клиент, создать новую историю миграций и проверить каждую модель на
реальные различия типов (даты, JSON-строки, булевы значения) — отдельная задача, не
блокер для текущего деплоя на SQLite.

---

## Отличия от `DEPLOY.md` (Fly.io)

Этот файл — актуальный путь деплоя (VPS уже куплен). `DEPLOY.md` описывает альтернативу на Fly.io — не используется, но оставлен для справки на случай переезда на Fly в будущем.
