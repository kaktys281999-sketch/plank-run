# Вариант A. Переносимый модульный монолит: TypeScript + PostgreSQL

*Архитектурное предложение от 19.10.2026. Опирается на `docs/research/*.md` с поправками из `verify-backend-compliance.md`. Пометка (н/п) означает, что факт не перепроверялся. Цены хостингов в 2026 году нестабильны: Hetzner поднимал их 01.04 и 15.06, CPX и CCX подорожали на 113–176%. Поэтому стоимость дана диапазонами.*

## 0. Тезис

Бэкенд — один Docker-образ на Node 24 LTS (Hono + Drizzle + Better Auth + pg-boss). Единственное хранилище состояния — PostgreSQL, файлы лежат в любом S3-совместимом хранилище. Образ одинаково работает на VPS за €6, в Yandex Cloud, на Railway или Fly. Регион не выбран, поэтому главное свойство архитектуры — переносимость: ячейки `ru` и `global` отличаются только `.env`.

Почему именно этот вариант:

1. **РФ отсекает почти всё готовое.** Первичная запись ПДн россиян разрешена только в базу в РФ, в том числе через иностранный SaaS прямо из браузера. Cloudflare в РФ режут, иностранный вход запрещён. Supabase Cloud, Firebase, Convex и Workers в RU-ячейку не поставишь. Наш вариант — один контейнер и Postgres у любого российского облака.
2. **Античит без второй кодовой базы.** Детерминированная симуляция `game-core` на TS работает и в браузере, и на сервере. Пересимуляция реплея занимает миллисекунды в том же процессе.
3. **Local-first.** Игра полностью работает без сети. Это обязательно: в режиме «белых списков» недоступен любой наш сервер, даже российский. Сервер отвечает за синхронизацию, друзей, рейтинги и каталог. Поэтому на Ф0–1 хватает одного узла.
4. **Всё в Postgres:** очереди, cron, сессии, rate-limit, лидерборды. Бэкапить и переносить нужно один объект.
5. **Удобно для ИИ-ассистента:** популярный стек, типы от zod до SQL, миграции — SQL в git.

Честные слабости (§18):
- эксплуатация лежит на вас;
- первые 1–2 недели этот вариант медленнее Supabase: нет готовых Auth UI, Storage и Studio;
- нет встроенного realtime;
- Better Auth с 07.07.2026 принадлежит Vercel;
- на Ф0–1 единственный узел — точка отказа.

## 1. Принципы

- Источник правды для игры — устройство. Сервер — для нескольких устройств, друзей, рейтингов, проверки и каталога.
- **Аккаунт не обязателен.** Гость получает всю игру и весь прогресс, вход нужен только для социальных функций. Заодно это законно снимает ч. 10 ст. 8 149-ФЗ: норма касается только ресурсов с авторизацией.
- Один образ: роль процесса задаёт `ROLE=api|worker|all`, ячейку — `CELL=ru|global`.
- Модуль владеет своей схемой Postgres. Модули общаются только через `service.ts`, это проверяет dependency-cruiser в CI.
- Внешние сервисы подключаются через адаптеры: `BlobStore`, `Mailer`, `SmsSender`, `JobQueue`, `PushSender`.

## 2. Компоненты

```
┌─────────────────────────── Устройство (PWA) ───────────────────────────┐
│ камера → MediaPipe worker → BodyFrame → game-core (детерминир. sim)     │
│ Dexie: sessions, outbox, settings, АНКЕТА О ЗДОРОВЬЕ (только здесь)     │
│ OPFS: свои треки   SW: оболочка, WASM+модели, аудио, анализы — офлайн   │
└────────────┬───────────────────────────────────────────┬───────────────┘
   статика (тот же origin)                  HTTPS /v1 JSON, cookie __Host-
             ▼                                           ▼
┌──────────────── Ячейка global | ru  (один и тот же образ) ─────────────┐
│ Caddy: TLS, статика PWA, reverse proxy /v1, лимит тела                  │
│   └─► api (Hono, Node 24, ROLE=api) ×1..N                               │
│        auth · me · progress · catalog · sessions · boards · social      │
│        challenges · music · notify · privacy · admin                    │
│        общие пакеты: contracts (zod) · game-core · progression          │
│   ┌────────────────┐   SQL (Drizzle/pg)   ┌──────────────────────────┐ │
│   │ PostgreSQL 17  │◄────────────────────►│ worker (ROLE=worker)     │ │
│   │ схемы модулей  │  pg-boss: jobs, cron │ verify-session, boards,  │ │
│   │ + pgboss.*     │                      │ push, export, delete,    │ │
│   └───────┬────────┘                      │ weekly, cleanup          │ │
│           └─ pg_dump / WAL → S3 бэкапов (другой провайдер, та же страна)│
│   S3: audio/ · analysis/ · replays/u/{uid}/ · exports/ · licenses/      │
│   └─► раздача: R2 (global) / Yandex Object Storage + CDN или Caddy (ru) │
└────────────────────────────────────────────────────────────────────────┘
Вне прода: audio-worker (Python: ffmpeg, Beat This!, librosa) — CLI/контейнер
по требованию, пишет через admin API.  Позже: global directory, Centrifugo.
```

## 3. Топология и стоимость

| | Ф0: я и друзья (≤100) | Ф1: 1–10k MAU | Ф2: 100k MAU |
|---|---|---|---|
| Схема | 1 VPS 2 vCPU / 4 ГБ, docker compose: Caddy + app (`ROLE=all`) + Postgres | VM 4 vCPU / 8 ГБ: 2× api + worker; Postgres managed | 2–3 api за балансировщиком, 1–2 worker, PG HA + PgBouncer, Valkey по необходимости |
| global | Hetzner CX23 / CAX11 (€5.49–5.99) или Netcup; без VPS — Railway $5 + Neon Free | Hetzner / DO + DO Managed PG ($15–30) или Neon Launch (~$5–25 по использованию) | VM + LB; PG 4 vCPU / 16 ГБ HA с PITR (DO, Scaleway) |
| ru | Timeweb Cloud / Selectel VPS | Yandex Compute + Managed PostgreSQL + Object Storage + CDN, или VPS с self-managed PG | Yandex Cloud: NLB, MDB HA, CDN |
| Прочее | Почта: Resend / SES free tier; ru — SMS-шлюз РФ. Ошибки: Sentry free (global), GlitchTip (ru) | почта $0–20; SMS ~3–5 ₽ за шт. (н/п) | почта $10–90; Sentry Team ~$26 |
| **global, в месяц** | **$6–12** | **$40–90** | **$250–500** |
| **ru, в месяц** | **600–1500 ₽** | 3–5 тыс. ₽ на VPS или 8–12 тыс. ₽ с Yandex MDB (н/п) | 25–45 тыс. ₽ (н/п), из них 30–50% — CDN |

- **Ф0.** Если друзья в РФ, первая ячейка — российский VPS, и уведомление в РКН подаётся до открытия входа. Иначе VPS в ЕС. Для Узбекистана этого достаточно: ЗРУ-1125 от 26.03.2026 требует локализовать только биометрию, генетику и данные абонентов связи. Казахстанскую ячейку заранее не строим: тамошний режим, похоже, ослабляется.
- **Нагрузка ничтожная.** 800k сессий в месяц — это ≈0,3 RPS в среднем и примерно в 20 раз больше в пик. Второй узел на Ф2 нужен ради отказоустойчивости. База растёт на ≈0,4 ГБ в месяц, реплеи лежат в S3 с TTL 90 дней.
- **Дорогая часть — музыка:** ≈1,5 ТБ первых загрузок в месяц на Ф2. В R2 исходящий трафик бесплатный, в РФ за него платим CDN. Объём снижаем отрезками по 45–90 с в AAC и immutable-кэшем в Service Worker.
- **Ячейки.** Пользователь выбирает страну проживания (не по IP), клиент берёт адрес API из `cells.json`. Друзья и доски живут внутри ячейки. Связи между ячейками появятся позже через global directory (только handle→cell). Для ru это трансграничная передача: нужны согласие и уведомление в РКН.

## 4. Модель данных

### 4.1 Идентификаторы
- Все PK — `uuid` v7, генерирует приложение, поэтому версия Postgres не важна. Id сессий, устройств и операций outbox создаёт **клиент**, и загрузка идемпотентна.
- Ячейка видна только во внешних ссылках, префиксом: `ru-7KQ2M9XA`. `user_id` наружу не показываем, в рейтингах — только handle и скин.
- Время — `timestamptz`. Недели — ISO-недели в часовом поясе пользователя.

### 4.2 Только на устройстве
Это никогда не уходит на сервер:
- анкета PAR-Q целиком, включая ответы «да/нет» (травмы, давление, беременность);
- причина «осторожного маршрута», рост и вес, флаги боли;
- кадры, landmarks, детальные метрики техники;
- калибровки камеры и аудиозадержки;
- аудиофайлы пользователя и их названия.

Генератор плана (`packages/progression`) работает на устройстве. Сервер получает только результат: уровень, расписание, версию анкеты и отметку «дисклеймер вер. N принят». Этим снимаются ст. 10 152-ФЗ, ст. 9 GDPR и MHMDA.

### 4.3 Таблицы по схемам модулей

| Таблица | Ключевые колонки | Индексы, ограничения |
|---|---|---|
| `auth.users`, `auth.accounts`, `auth.sessions`, `auth.verifications`, `auth.passkeys` (Better Auth) | users: id, email citext null, phone null, home_cell, deleted_at; accounts: provider_id, account_id (OAuth-токены после входа не храним); sessions: token_hash, expires_at | unique(email), unique(phone) where deleted_at is null; unique(provider_id, account_id); unique(token_hash) |
| `core.user_roles` | user_id, role (`admin`, `editor`, `moderator`) | PK(user_id, role) |
| `core.profiles` | user_id PK, handle citext, skin_id, locale, tz, age_band, fitness_level, lb_visibility (`hidden`/`friends`/`public`, по умолчанию `friends`), lb_shadow, updated_seq | unique(handle); check(fitness_level between 1 and 30); check(handle ~ `^[a-z0-9_]{3,20}$`) |
| `core.consents` | user_id, kind (`tos`, `privacy`, `pd_ru`, `public_lb`, `analytics`, `disclaimer`, `age16`), doc_version, granted, at | (user_id, kind, at desc); только вставка |
| `core.devices` | id (от клиента), user_id, platform, app_version, last_seen_at | (user_id) |
| `progress.plans` | user_id, generator_version, questionnaire_version, starts_on, items jsonb, status | unique(user_id) where status='active' |
| `progress.ledger` | user_id, currency (`xp`/`gems`), delta, reason, ref_id | unique(user_id, currency, reason, ref_id): повтор не начислит дважды |
| `progress.user_state`, `progress.weekly`, `progress.unlocks` | xp, gems, stars, streak_weeks, freezes / iso_week, sessions_done, good_form_s / item_id | кэш ledger; PK(user_id, iso_week); PK(user_id, item_id) |
| `game.levels` | game_slug, slug, version, status, config jsonb, score_rules jsonb | unique(game_slug, slug, version); триггер запрещает UPDATE опубликованной версии |
| `game.attempts` | user_id, board_id, seed, issued_at, expires_at, consumed_by | unique(consumed_by); (user_id, issued_at desc) |
| `game.sessions` | **id от клиента**, user_id, device_id, attempt_id, board_id, chart_ref, mode, started_at, ended_at, active_ms, good_form_ms, score, accuracy, stars, rpe, sim_version, payload_hash, status (`received`/`verified`/`unranked`/`flagged`/`rejected`), offline, received_at, updated_seq | (user_id, started_at desc); unique(attempt_id); check(ended_at > started_at); check(active_ms ≤ 3 600 000); BRIN(received_at) |
| `game.replays` | session_id PK, format_ver, sha256, inline bytea (≤16 КБ) или s3_key, keep_until | (keep_until) |
| `game.board_best` | board_id, period (`all` / `2026-W43`), user_id, score, session_id, achieved_at | PK(board_id, period, user_id); (board_id, period, score desc, achieved_at) |
| `social.friend_edges`, `social.friend_requests` | user_id, friend_id / from_id, to_id, status | PK(user_id, friend_id), строка на каждое направление; unique(from_id, to_id) where status='pending' |
| `social.invites`, `social.challenges`, `social.challenge_entries`, `social.blocks`, `social.reports` | code, kind, expires_at, max_uses / board_id, seed, ghost_session_id / score | check(uses ≤ max_uses); PK(challenge_id, user_id) |
| `music.tracks` | source, title, artist, license_code, license_url, attribution, proof_key, proof_date, regions, audio_key, audio_sha256, lufs, status (`draft`/`published`/`takedown`) | unique(audio_sha256); check(license_code IN белый список) |
| `music.analyses` | fp_kind (`file_sha256`/`chromaprint`), fp, algo_version, trust (`server`/`client`), data_key, bpm, created_by null | unique(fp_kind, fp, algo_version) |
| `music.charts` | analysis_id, generator_version, difficulty, segment, notes_key, hand_tuned | unique(analysis_id, generator_version, difficulty, segment) |
| `notify.push_subs`, `notify.prefs` | endpoint, p256dh, auth, fail_count / local_time, tz, days_mask, quiet_hours | unique(endpoint) |
| `ops.sync_ops`, `ops.audit_log`, `ops.privacy_jobs` | user_id, op_id / actor_id, action, entity, diff / kind, status, file_key | TTL 30 дней; (entity, entity_id) |

- `board_id` — строковый ключ: `lvl:<level_id>@<version>` или `chart:<hash>`. Правка уровня создаёт новую доску.
- `updated_seq` берётся из общей последовательности, проставляется триггером и служит курсором pull-синхронизации.
- Продуктовая аналитика на Ф0–1 — SQL по `sessions` и `weekly`, без сторонних трекеров.

## 5. API

- **Стиль.** REST + JSON под `/v1`, описан через `@hono/zod-openapi`. Схемы лежат в `packages/contracts` (zod 4) и общие для PWA и сервера. Клиент — типизированный `hono/client`.
- **Валидация.** Входные объекты проверяются как `.strict()`, поэтому mass assignment невозможен. Лимит тела — 64 КБ на запрос и 512 КБ на батч. Ошибки — в формате RFC 9457.
- **Версии.** Внутри `/v1` изменения только добавляются. Ломающие уходят в `/v2`, и `/v1` после этого живёт ещё ≥6 месяцев. `GET /v1/config` отдаёт `minClientVersion`; запись от слишком старого клиента получает 426. У реплея, анализа и карты свой `format_ver`. CI ловит ломающие изменения OpenAPI через oasdiff.

```
GET  /v1/config                       ячейка, способы входа, флаги, minClientVersion
*    /v1/auth/*                       Better Auth: oauth/{yandex|vk|google}, phone-otp, email-otp, passkey
GET  /v1/me · PATCH /v1/me/profile · PUT /v1/me/consents/{kind} · GET /v1/me/state
GET|PUT /v1/me/plan                   снимок плана; сервер ограничивает смену уровня
POST /v1/sync                         батч outbox (≤50) → результат по каждой операции
GET  /v1/sync/changes?since=<seq>     статусы сессий, state, друзья, вызовы
PUT  /v1/sessions/{id}                идемпотентная загрузка с реплеем · GET /v1/sessions?cursor=
GET  /v1/catalog                      игры, уровни, треки, скины (ETag / 304)
POST /v1/attempts {board_id, n≤5}     токены попыток, в том числе заранее для офлайна
GET  /v1/boards/{id}?period=all|week&scope=friends|global&around=me
GET  /v1/ghosts/{session_id}          реплей-«призрак»
GET|POST|DELETE /v1/friends…, /v1/invites…, /v1/blocks, /v1/reports
POST /v1/challenges · GET /v1/challenges · POST /v1/challenges/{id}/join
GET  /v1/analyses/{fp_kind}/{fp}      кэш анализа трека · POST /v1/analyses (по согласию)
PUT|DELETE /v1/push/subscriptions/{device_id} · PUT /v1/me/notify-prefs
POST /v1/me/export · DELETE /v1/me · /v1/admin/* (роль + 2FA) · /healthz · /readyz
```

## 6. Аутентификация

- **Сессии.** Better Auth 1.7 (MIT), серверные сессии в Postgres. Cookie `__Host-` с флагами HttpOnly, Secure и SameSite=Lax живёт 60 дней и продлевается при использовании.
- **Один origin.** PWA и API отдаются с одного адреса: Caddy раздаёт статику и проксирует `/v1`. Поэтому нет CORS, а CSP `connect-src 'self'` закрывает утечки.
- **CSRF.** SameSite, проверка `Origin` и приём только `application/json`.
- **Паролей нет.**

| Способ | global / uz | ru | Примечание |
|---|---|---|---|
| Гость (вся игра) | да | **да, по умолчанию** | Данные только на устройстве |
| Яндекс ID, VK ID | Яндекс — по желанию | **да** | generic OAuth; у VK — OAuth 2.1, PKCE S256, `device_id` |
| Телефон, SMS-код | — | **да** | плагин `phoneNumber`, российский SMS-шлюз, только +7 |
| Email-код | да | **выключен** | По ч. 10 ст. 8 149-ФЗ спорно, это зона риска |
| Google / Apple / Telegram | да (Telegram популярен в UZ) | **нет** | ст. 13.55 КоАП (199-ФЗ, с 07.07.2026) касается любого иностранного IdP |
| Passkeys | Ф1 | Ф1 | WebAuthn |

- **Флаги.** Применяется ли запрет к владельцу, который не резидент РФ, не подтверждено. Поэтому флаг `AUTH_FOREIGN_IDP` есть и у global-ячейки, а до запуска в РФ нужен юрист.
- **Гость → аккаунт.** Анонимных пользователей на сервере не заводим, гость живёт в Dexie. При входе клиент сливает outbox обычной синхронизацией:
  - сессии сохраняют свои id и получают `unranked`, потому что токенов попыток у них нет;
  - план — по правилу «последняя запись побеждает» (LWW);
  - разблокировки объединяются.

  Логики слияния на сервере нет. Если понадобится рейтинг до входа, подключим плагин `anonymous`: его `onLinkAccount` в одной транзакции переносит строки анонима и удаляет его.
- **Связывание аккаунтов.** Автоматически — только если email подтверждён у обоих провайдеров. В остальных случаях пользователь связывает явно из настроек, будучи залогиненным. Иначе возможен захват аккаунта.
- **Лимиты.** SMS: 1 в минуту и 5 в сутки на номер, 20 в час на IP, после второй отправки капча (защита от SMS-pumping). Не больше 5 попыток ввода кода. Админам обязательны passkey или TOTP.

## 7. Офлайн-синхронизация

**Клиент.** Каждое изменение пишется локально и в `outbox`: `{op_id: uuidv7, type, entity_id, payload, schema}`. Отправка идёт при старте, на `online`, при возврате на вкладку и после сессии, с экспоненциальной задержкой и джиттером. На Background Sync не рассчитываем: в Safari его нет. Очередь переживает дни без сети: для «белых списков» это норма.

**Протокол.** `POST /v1/sync` принимает до 50 операций, каждую в своём savepoint. Ответ на каждую — `applied`, `duplicate` или `rejected{code}`. Клиент удаляет операцию при любом из трёх ответов и оставляет при 5xx или сбое сети. Идемпотентность держится на естественных ключах или на `ops.sync_ops(user_id, op_id)`.

**Конфликты:**
- **Сессии неизменяемы:** `INSERT … ON CONFLICT (id) DO NOTHING`. Тот же id с другим `payload_hash` даёт `rejected{conflict}`.
- **XP, gems и звёзды клиент не присылает.** Сервер выводит их из сессий через `ledger`. Клиент показывает оптимистичное значение до ответа сервера.
- **Разблокировки** — множество, которое только растёт.
- **Профиль** — LWW по полю по `client_ts`, зажатому в окно `[received_at − 30 дней; +5 мин]`.
- **План** — LWW по `generated_at`. Смену уровня сервер обрезает до +1 за сессию и +3 за неделю: это и правило безопасности, и защита досок.

**Pull.** `GET /v1/sync/changes?since=<seq>` отдаёт строки с `updated_seq > since`. Сервер отдаёт данные только до «безопасного горизонта» (seq старше 2 с), потому что транзакции коммитятся не по порядку. Клиент запрашивает с перекрытием и убирает дубли.

**Рейтинг офлайн.** Клиент заранее берёт до 5 токенов попыток на доску, каждый живёт 7 дней. Сессия с таким токеном попадает в рейтинг с пометкой «офлайн». Без токена она `unranked`, но засчитывается в историю и недельную цель.

## 8. Лидерборды и античит

**Конвейер.** `PUT /sessions/{id}` ставит статус `received` и задачу pg-boss `verify-session`. Воркер проверяет:
1. **Токен попытки:** он чей нужно, не истёк, не использован, для той же доски, и `started_at ≥ issued_at`.
2. **Границы из `levels.score_rules`:** очки в секунду, длительность, предел точности, `active_ms ≤ ended_at − started_at`, число сессий в час.
3. **Реплей:** контрольная сумма и строгий декодер.
4. **Пересимуляцию:** `game-core@sim_version` с тем же seed и картой. Счёт должен совпасть **точно**, очки целые.
5. **Статистику сигнала:** нулевой джиттер, нечеловеческая реакция или периодичность → `flagged`.

После `verified` сервер делает upsert в `board_best` для `all` и недели (`WHERE excluded.score > board_best.score`), пишет начисления в `ledger` и обновляет `weekly`. Сессию со статусом `flagged` видят только автор и модератор.

**Реплей.** Заголовок: `format_ver`, `sim_version`, seed, `board_id`, 30 Гц. На каждый тик — `int8 x`, `int8 y` и байт флагов (в кадре, техника, пауза). После delta + varint + `CompressionStream('deflate')` выходит ≈2–3 КБ в минуту. Это управляющий сигнал, а не landmarks. Ритм-игра позиционная, поэтому ноты судятся по тому же сигналу.

**Детерминизм.**
- Фиксированный шаг 1/30 с, в подсчёте очков только целые или fixed-point.
- PRNG только по seed, `Math.random` и `Date` в симуляции запрещены.
- Сервер держит несколько версий симуляции через npm-алиасы (`game-core-v3`, `-v4`), чтобы проверять старых клиентов.
- CI прогоняет golden-реплеи на Node, Chromium и WebKit.
- Минута реплея — единицы миллисекунд CPU, весь объём Ф2 укладывается меньше чем в час CPU в месяц.

**Чтение.**
- Топ-N — индексный скан.
- Ранг — `count(*) WHERE score > $mine`, приемлемо до ~10⁶ строк.
- Доска друзей — JOIN с `friend_edges`.
- Топ-100 кэшируется в процессе на 30 с.
- Valkey ZSET подключаем только при p95 > 50 мс. Это кэш, который всегда можно пересобрать из Postgres.

**Пределы.** Бот с правдоподобным синтетическим сигналом пересимуляцию пройдёт: веб не умеет аттестовать устройство. Поэтому:
- по умолчанию показывается доска друзей;
- публичная доска — только по согласию (в РФ это ещё и согласие на распространение);
- топ-10 проверяется вручную, есть теневой бан;
- у пользовательских песен только доски друзей.

## 9. Музыка и битмапы

**Курируемый каталог (40–80 треков).** Python в проде не нужен. Команда `pnpm music:ingest ./masters/*.wav` запускает контейнер `audio-worker` локально или на почасовой VM. Конвейер:
1. ffmpeg loudnorm до −14 LUFS и кодирование в AAC;
2. Beat This! (MIT, без DBN из madmom) — доли и сильные доли;
3. librosa — энергия и онсеты;
4. секции по энергии и новизне; allin1 — только после юридической проверки его зависимостей;
5. AnalysisJSON v1 загружается через `/v1/admin/tracks` вместе со снимком лицензии.

Ключи объектов — хеши содержимого (`audio/{sha256}.m4a`, `analysis/{sha256}/{algo}.json.gz`), кэш `immutable`. Когда треков станут сотни, контейнер станет постоянным воркером на таблице с `SELECT … FOR UPDATE SKIP LOCKED`: у pg-boss нет Python-клиента.

**Лицензии.**
- `license_code` берётся из белого списка: CC0, CC-BY-4.0, royalty-free с разрешением на игры, прямой договор. Это CHECK-ограничение, поэтому NC, ND и SA в каталог не попадут.
- `proof_key` хранит снимок страницы лицензии, `regions` — разрешённые регионы.
- Экран атрибуций собирается из таблицы.
- `takedown` скрывает трек и удаляет объект.

**Свои треки.** Файл не покидает устройство.
- Клиент считает `file_sha256`. MP3, пересланные через мессенджер, у друзей побайтно совпадают, так что кэш работает, и запрашивает `GET /v1/analyses/file_sha256/{h}`.
- При промахе анализ идёт в Worker трекером под MIT. Если пользователь согласен, `POST /v1/analyses` отправляет только ритм-факты с пометкой `trust=client`.
- Позже добавим Chromaprint (WASM, MIT), чтобы узнавать перекодированные копии.
- При удалении аккаунта у его анализов обнуляется `created_by`, и связь «человек ↔ песня» исчезает.

**Карты** клиент генерирует детерминированно по `generator_version`, сложности, отрезку и seed. Сервер может повторить генерацию для проверки. В `music.charts` хранятся только ручные карты.

**Доставка.** global — R2, ru — Yandex Object Storage + CDN или Caddy ячейки. CORS — только свой origin. Service Worker отвечает на Range-запросы, иначе Safari не играет аудио из кэша.

## 10. Realtime

До Ф2 realtime не нужен: социальность закрывают асинхронные вызовы, призраки и push.

Для дуэлей — WebSocket в том же процессе (`@hono/node-ws`). Комната живёт в памяти: 2 игрока × 20 Гц, один узел держит тысячи комнат. Сервер ретранслирует сообщения, а вердикт выносит по реплеям обоих через `verify-session`. При нескольких узлах Caddy липко маршрутизирует по `room_id`. Для presence или кластера — Centrifugo с Valkey отдельным контейнером. WebRTC P2P не берём: TURN платный и плохо переносит фильтрацию в РФ.

## 11. Push-напоминания

- **Отправка.** Web Push с VAPID-ключами отдельно на ячейку. `web-push` 3.6.7 (MPL-2.0, релиз 01.2024) пиним; протокол простой и при необходимости заменяется своим кодом.
- **Отбор.** Cron pg-boss раз в 5 минут ищет тех, у кого наступило локальное время напоминания: сегодня не отправляли, недельная цель не выполнена, не тихие часы.
- **Ошибки.** Ответ 404 или 410 удаляет подписку.
- **Payload** без ПДн, потому что идёт через push-сервисы Google, Apple и Mozilla. Тон без вины.
- **Ограничения.** На iOS push работает только в установленной PWA. В РФ доставка через FCM ненадёжна (н/п).
- **Запасной вариант.** Экспорт **.ics** с повторяющимся напоминанием в календарь. Работает без push и без сервера.

## 12. Админка и контент

**Контент как код.** Уровни, игры, скины и сезоны лежат JSON-файлами в `content/` в git и проверяются той же zod-схемой, что и в игре. CI-команда `content:publish` идемпотентно создаёт новые версии и сбрасывает ETag каталога. Для одного человека с ИИ это удобнее CMS: диффы, ревью, откат.

**Веб-админка** (`/admin`, ленивый маршрут того же SPA) нужна только для того, чего нет в git:
- треки и лицензии;
- очередь `flagged` и жалоб;
- пользователи, бан и теневой бан;
- флаги и очереди.

Все действия пишутся в `audit_log`. Сырые данные смотрим в Drizzle Studio через SSH-туннель.

## 13. Наблюдаемость и бэкапы

- **Логи:** pino JSON с `request_id` и хешем `user_id`. IP — только в памяти rate-limit. Хранение 14 дней.
- **Ошибки.**
  - global: Sentry, `beforeSend` вычищает PII.
  - ru: **только GlitchTip внутри ячейки.** Иностранный SaaS, получающий данные из браузера россиянина, — это первичный сбор ПДн за рубежом. По той же причине в RU-ячейке нет иностранных ESP, аналитики и CDN.
- **Метрики:** `/metrics`, `pg_stat_statements`, страница в админке (p95, очереди, доля `flagged`, возраст бэкапа). Внешний пинг `/readyz` с алертами в Telegram.
- **Бэкапы.**
  - Ф0: каждую ночь `pg_dump -Fc`, шифрование age, загрузка в S3 *другого провайдера той же страны*. Для ru иначе нельзя: копия за рубежом — это хранение за рубежом. Ротация 7/4/6: дневные, недельные и месячные копии.
  - С Ф1: PITR или WAL-G, RPO ≤ 5 мин.
- **Учения.** Раз в месяц GitHub Action восстанавливает последний дамп в свежий Postgres и прогоняет миграции.
- **Бонус local-first:** после катастрофы клиенты сами дозагрузят сессии из Dexie.

## 14. Безопасность: чек-лист

- [ ] TLS и HSTS через Caddy; один origin; CSP `default-src 'self'`.
- [ ] Cookie `__Host-` (HttpOnly, Secure, SameSite=Lax); проверка `Origin` на запись.
- [ ] zod `.strict()`, лимиты тела, строгий декодер реплеев с фаззингом.
- [ ] Rate-limit через `rate-limiter-flexible` с хранилищем в Postgres: SMS/OTP, sync, attempts, invites.
- [ ] Роли БД: `app` без DDL, `migrator` только в CI, `readonly`. Postgres недоступен снаружи.
- [ ] Секреты в sops+age по ячейкам; контейнер не от root; Renovate + osv-scanner; на VPS только SSH-ключи, ufw, unattended-upgrades.
- [ ] Бакеты приватные, подписанные URL на 5 мин; публичен только `audio/`.
- [ ] Админка за 2FA с журналом; стоп-слова для ников, блоки, жалобы.
- [ ] Чата нет: в РФ он грозит статусом ОРИ.

## 15. Приватность

- **На сервере** только идентификатор входа, handle, возрастная группа, уровень, итоги сессий и друзья. Остальное — на устройстве (§4.2).
- **Экспорт.** Zip с JSON и реплеями, подписанная ссылка на 24 ч, файл удаляется через 7 дней.
- **Удаление.** Сессии отзываются и профиль скрывается сразу. В течение 30 дней каскадно удаляются строки и объекты `replays/u/{user_id}/`, обнуляется `created_by` в анализах. Из бэкапов данные уходят вместе с ротацией, это прописано в политике. Для Google Play есть публичная страница удаления.
- **Сроки.** Реплеи — 90 дней, кроме рекордов. Неактивный аккаунт удаляется через 24 месяца.
- **Согласия.** Журнал с версиями документов. Для ru — отдельное согласие на обработку ПДн и на публичный рейтинг, а уведомление в РКН подаётся до открытия входа.

## 16. Тесты и CI/CD

- **Монорепо** pnpm: `apps/web`, `apps/server`, `packages/{contracts,game-core,progression}`, `content/`, `tools/audio-worker`.
- **Unit (Vitest):** начисления и границы; property-тесты (fast-check) для sync и ledger.
- **Интеграционные:** Testcontainers с настоящим Postgres 17, тест в транзакции с откатом. БД не мокаем: `ON CONFLICT` и pg-boss проверяются только на живой базе.
- **Детерминизм и E2E:** golden-реплеи на Node и в браузерах. Playwright с фейковой камерой (уже есть в `test/`) против compose, сценарий «офлайн → игра → онлайн → доска».
- **Миграции:** `drizzle-kit generate` → ревью SQL → `migrate` отдельным шагом. Ломающие изменения — по схеме expand → backfill → contract.
- **CD:** GitHub Actions собирает образ amd64 + arm64 и пушит его в GHCR и Yandex Container Registry. Дальше матрица по ячейкам с одним digest: `migrate` → `compose pull && up -d` → проверка `/readyz` → при сбое откат на прошлый тег. С Ф1 — две реплики api, выкатка без простоя (или Kamal 2).

## 17. Миграции и путь выхода

| Сценарий | Как | Трудоёмкость |
|---|---|---|
| Сменить хостинг | `pg_dump`/`pg_restore` или логическая репликация, `rclone sync`, DNS | часы |
| Перенести пользователя между ячейками | `cell-move`: выгрузить по user_id, загрузить, удалить (UUID глобальны) | минуты |
| Global-ячейка на edge | Hono на Workers, Postgres через Hyperdrive, `JobQueue` на Queues | 1–2 недели |
| Уйти с Better Auth или Drizzle | таблицы наши, миграции — чистый SQL | ~неделя |
| Вынести модуль в сервис | у модуля уже есть своя схема и `service.ts` | дни |

## 18. Риски

| Риск | Вероятность / вред | Меры |
|---|---|---|
| Эксплуатация на одном человеке | высокая / средний | managed PG с Ф1, автообновления, алерты, runbook; сбой не мешает играть |
| Ошибка в своей авторизации | средняя / высокий | без паролей, Better Auth, тесты на захват аккаунта, 2FA |
| Vercel сменит курс Better Auth | низкая / средний | MIT, пин версии, таблицы наши |
| Ужесточение в РФ | высокая / высокий | ячейки, флаги входа, гостевой режим, юрист до запуска |
| Белые списки отрежут сервер | высокая (РФ) / средний | офлайн-PWA, outbox на дни, токены попыток заранее |
| Расхождение детерминизма | средняя / средний | целочисленная симуляция, golden-тесты, несколько версий |
| SMS-pumping | средняя / средний | лимиты, капча, только +7, приоритет VK и Яндекса |
| Читеры в топе | высокая / низкий | доски друзей, пересимуляция, ручная проверка |
| Бэкенд раньше продукта | высокая / средний | минимальные M1–M2, остальное — по сигналам от друзей |

## 19. Что строить первым

1. **M0, без сервера (≈1 нед.).** Dexie, UUIDv7, outbox, `contracts`, `game-core` с seed и записью реплея. Модели и WASM отдаются со своего origin и кэшируются с первого запуска.
2. **M1, ячейка для друзей (1–2 нед.).** Hono, схема v1, вход по конфигу ячейки (ru — Яндекс и VK, global — email-OTP и Google), `/v1/sync`, compose на VPS, ночной бэкап и учение по восстановлению, Sentry или GlitchTip.
3. **M2, друзья и проверка (1–2 нед.).** Инвайты, друзья, attempts, `verify-session` с пересимуляцией, доска друзей, призрак своего рекорда.
4. **M3, контент и права (1 нед.).** Каталог из `content/`, версии уровней, экспорт и удаление, журнал согласий, минимальная админка.
5. **M4, ритм (2 нед.).** Ingest-CLI, хранилище, атрибуции, кэш анализов, версии карт.
6. **M5, мета (1 нед.).** Ledger, звёзды, скины, недельная цель, push и .ics.
7. **M6, публичный запуск (1–2 нед.).** Managed PG с PITR, 2 реплики, k6, DPIA, уведомление в РКН, вход по телефону для ru.
8. **Потом:** публичные доски, global directory, дуэли на WebSocket, затем Centrifugo.

## 20. Итог

Первые две недели вариант A уступает Supabase. На 100k MAU он дороже Cloudflare: $250–500 против $50–150. Supabase с PITR стоит от ≈$130 на проект и в РФ неприменим. Зато только этот вариант одинаково работает при любом регионе: один и тот же образ ставится в Yandex Cloud для РФ и на VPS за €6 для остального мира. Античит не требует второй кодовой базы, всё состояние живёт в Postgres, а уйти от провайдера можно за часы. Регион не выбран, команда — один человек, законы меняются раз в полгода. В этих условиях это самый дешёвый способ не принимать необратимых решений.
