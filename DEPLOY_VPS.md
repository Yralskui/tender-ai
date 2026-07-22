# Выкладка TenderAI на свой VPS (AdminVPS, Ubuntu 22.04/24.04)

Стек — `docker-compose.yml` в корне репозитория: Postgres + Redis + worker + web.
Всё выполняется через SSH под root на сервере.

Домен ниже везде обозначен как `ВАШ-ДОМЕН.ru` — замените на свой.

---

## 0. Перед началом

- [ ] A-запись домена `ВАШ-ДОМЕН.ru` → IP вашего VPS (проверить: `ping ВАШ-ДОМЕН.ru`, должен ответить IP сервера)
- [ ] SSH-доступ: `ssh root@ВАШ_IP`

---

## 1. Базовая настройка сервера

```bash
apt update && apt upgrade -y
```

Своп — полезно на тарифах с небольшим RAM, чтобы сборка `next build` внутри Docker не падала по памяти:

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

Порты Postgres (5432) и Redis (6379) наружу не открываем — они видны только внутри Docker-сети между контейнерами.

---

## 2. Склонировать репозиторий

Репозиторий приватный — нужен личный токен GitHub (Settings → Developer settings → Personal access tokens → создать с правом `repo`, только для чтения).

```bash
cd /opt
git clone https://<ВАШ_GITHUB_ЛОГИН>:<ВАШ_ТОКЕН>@github.com/Yralskui/tender-ai.git
cd tender-ai
```

---

## 3. Настроить `.env`

```bash
cp .env.example .env
nano .env
```

Сгенерировать случайные секреты (выполните трижды, вставьте разные значения в `.env`):

```bash
openssl rand -hex 32
```

Заполнить в `.env`:

| Переменная | Значение |
|---|---|
| `JWT_SECRET` | случайная строка выше |
| `CRON_SECRET` | другая случайная строка |
| `POSTGRES_PASSWORD` | ещё одна случайная строка (не `tender`!) |
| `APP_URL` | `https://ВАШ-ДОМЕН.ru` |
| `NEXT_PUBLIC_APP_URL` | `https://ВАШ-ДОМЕН.ru` |
| `GROQ_API_KEY` | ваш боевой ключ (свой, не dev-ключ из старого `.env`) |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` | ваша боевая почта |

`BACKGROUND_JOBS_IN_NEXT=0` и `DATABASE_URL`/`REDIS_URL` уже прописаны в `docker-compose.yml` — руками не трогать.

---

## 4. Собрать и запустить

```bash
docker compose build
docker compose up -d postgres redis
docker compose run --rm web npm run db:migrate
docker compose up -d
```

Проверить, что всё поднялось:

```bash
docker compose ps
docker compose logs -f web
```

В логах должно появиться что-то вроде `[auto-sync] планировщик: …`. `Ctrl+C` — выйти из просмотра логов (контейнеры продолжат работать).

Приложение слушает `127.0.0.1:3000` на хосте — наружу пока не открыто, это нормально, следующий шаг добавит HTTPS.

---

## 5. HTTPS через Caddy (автоматический сертификат)

Caddy сам получает и продлевает сертификат Let's Encrypt — конфиг из двух строк.

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
- [ ] Лента тендеров подтягивается (подождите ~20 мин или посмотрите `docker compose logs -f worker`)
- [ ] Карточка тендера + объём + экономика открываются
- [ ] Письма (email-верификация) приходят — проверить SMTP в `.env`
- [ ] `/privacy` и `/terms` открываются

---

## 7. Дальнейшие обновления

```bash
cd /opt/tender-ai
git pull
docker compose build
docker compose run --rm web npm run db:migrate
docker compose up -d
```

Полезные команды:

```bash
docker compose logs -f web        # логи сайта
docker compose logs -f worker     # логи фоновых задач (авто-синк, разбор ТЗ)
docker compose restart web worker # перезапуск без пересборки
docker compose down               # остановить всё (данные в volumes сохранятся)
```

---

## Отличия от `DEPLOY.md` (Fly.io)

Этот файл — актуальный путь деплоя (VPS уже куплен). `DEPLOY.md` описывает альтернативу на Fly.io с SQLite — не используется, но оставлен для справки на случай переезда на Fly в будущем.
