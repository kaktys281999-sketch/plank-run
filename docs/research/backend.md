# Бэкенд для Plank Run: сравнение вариантов и рекомендация

*Исследование на 19.10.2026. Как проверялись данные: WebFetch к сайтам вендоров падал с ошибкой DNS, а лимит веб-поиска закончился в середине работы. Поэтому цифры взяты из выдачи поиска, в основном по официальным страницам (supabase.com, developers.cloudflare.com, fly.io, render.com, vercel.com), а версии библиотек и лицензии из реестров npm и PyPI. Если факт известен из моих общих знаний и в этой сессии не проверялся, рядом стоит пометка **(н/п)**. Перед решением о деньгах перепроверьте цены на страницах из раздела Sources.*

## 0. Коротко

- **Рекомендация.** Переносимый модульный монолит на TypeScript: **Hono** (Node 22+ или Bun, Docker) + **PostgreSQL** + **Drizzle** (SQL-миграции в git) + **Better Auth** + **pg-boss** (очереди и cron в той же Postgres) + любое **S3-совместимое** хранилище. На старте ни Redis, ни Python не нужны.
- **Supabase** — сильный план Б, если хочется готовые Auth и Storage прямо сейчас. Его используем только как «Postgres + Auth», без Edge Functions и без логики в клиенте.
- Сильнее всего выбор платформы ограничивает **регион**. С 9 июня 2025 года российские провайдеры режут трафик к Cloudflare до первых ~16 КБ. Hetzner и DigitalOcean тоже под ограничениями. А по 152-ФЗ (редакция с 01.07.2025) первичный сбор ПДн граждан РФ в иностранные базы запрещён. Если аудитория в РФ, нужен отдельный «российский» деплой того же образа. Это закладываем в дизайн с первого дня.
- Античит честно ограничен. Главная мера — **детерминированная пересимуляция** игры на сервере по записанному сигналу управления. Подделку сигнала она не ловит, тут остаются статистика и ручная проверка топа.

## 1. Профиль нагрузки

Видео и инференс остаются на устройстве. На сервер уходят только: аккаунт; результаты анкеты; итог сессии (~1 КБ); реплей сигнала управления (2–10 КБ сжатого на минуту); запросы к лидербордам; push-подписки; каталог уровней и треков; готовые битмапы. Это лёгкий CRUD с пиками вечером: при 100k MAU и ~8 сессиях в месяц на человека выходит ~800k сессий в месяц, то есть единицы RPS в среднем. Дорогими могут стать только **раздача музыки** (egress) и **realtime-дуэли**.

## 2. Сравнение платформ

| | Модель данных | Бесплатный тариф (проверено) | Self-host / выход | Realtime | VK / Yandex / Telegram | Lock-in |
|---|---|---|---|---|---|---|
| **(a) Supabase** | Postgres + RLS, PostgREST | Free: 50k MAU, 500 МБ БД, 1 ГБ файлов, 5 ГБ egress, 2 проекта, **пауза после 7 дней без активности**; Pro $25/мес (100k MAU, без паузы); Edge Functions 500k вызовов; Realtime 200 соединений / 2M сообщений | Docker-стек из многих сервисов (н/п); данные выносятся через `pg_dump` | Broadcast/Presence/Postgres Changes | Свой OIDC/OAuth-провайдер (с апреля 2026) → Yandex, VK ID, Telegram OIDC | **Низкий** по данным, средний по Auth и RLS |
| **(b) Firebase** | Firestore (NoSQL) | Spark: 50k чтений и 20k записей в день, 1 ГиБ; Auth 50k MAU, дальше от $0.0055/MAU (по сторонним обзорам); Cloud Storage теперь требует Blaze | Нет | Слушатели Firestore | Только кастомный токен | **Высокий** |
| **(c) PocketBase** | SQLite, один Go-бинарник | Бесплатно (MIT), платите только за VPS | Полный: файл БД + бинарник | SSE-подписки | Встроены OAuth2 VK и Yandex (н/п), Telegram сами | Средний; **pre-1.0** (v0.40.5, окт. 2026) |
| **(d) Convex** | Документная реактивная БД + TS-функции | Starter: ~1M вызовов функций, 0.5 ГБ БД (по сторонним источникам); Pro $25 за разработчика | Self-host по FSL→Apache-2.0 на SQLite или Postgres | Встроенная реактивность | Через Convex Auth или внешний OIDC | **Высокий**: код завязан на рантайм |
| **(e) Appwrite** | Документные коллекции поверх MariaDB (н/п) | Free: 75k MAU, 500k чтений и 250k записей БД; **пауза после 7 дней без активности в консоли, трафик пользователей не считается**; удаление через 90 дней паузы | Docker (BSD-3, н/п) | Realtime API | OAuth2-провайдеры (список н/п) | Средний |
| **(f) Свой TS-монолит** | Postgres (Drizzle/Prisma) | Зависит от хостинга (раздел 3) | Полный | WS в монолите → Centrifugo | Better Auth: Google, Apple, email OTP, Yandex-хелпер, generic OAuth для VK, плагин Telegram | **Минимальный** |
| **(g) Cloudflare edge** | D1 (SQLite) или Hyperdrive→Postgres, R2, Durable Objects | Workers 100k запросов в день; D1 500 МБ на базу (Free), 10 ГБ максимум (Paid); DO 100k запросов в день, 5 ГБ SQLite; Queues 10k операций в день; R2 10 ГБ, **egress бесплатно** | Hono-код переносим; DO, Queues и D1 — проприетарные API | **Durable Objects** — лучшие «комнаты» | Те же библиотеки, что в (f) | Средний и высокий; **в РФ трафик к CF режут** |
| **(h) FastAPI-воркер** | Только для аудиоанализа | — | Полный | — | — | — |

Выводы по пунктам:
- **Firebase** не подходит. Лидерборды и связи «друзья × уровни» плохо ложатся на NoSQL, привязка максимальная, а в РФ сервисы Google под риском.
- **Convex** удобен в разработке, но вся логика пишется под его рантайм, а выход означает переписать бэкенд.
- **Appwrite Cloud Free** не годится для продакшна из-за паузы по активности в консоли.
- **PocketBase** отлично подходит для фазы «я и друзья» (один бинарник за €5). Но он масштабируется только вертикально, обратная совместимость до 1.0 не гарантирована, и переезд с него потребует миграции SQLite→Postgres.
- **Cloudflare** технически идеален для дуэлей и раздачи музыки. Но для аудитории в РФ это неприемлемый риск, а D1 упирается в 10 ГБ на базу.

## 3. Хостинг и регион

| Хостинг | Факты 2026 | Для нас |
|---|---|---|
| Vercel Hobby | Только некоммерческое использование; 1M вызовов функций, 100 ГБ трафика | Только статика PWA; долгие WebSocket там не держать |
| Cloudflare Pages/Workers | См. выше; ограничения в РФ | Мировая аудитория |
| Fly.io | Новым организациям бесплатного тарифа нет, только триал; машина 256 МБ — $2.19/мес; Managed Postgres от $38/мес | API-контейнер |
| Railway | Hobby $5/мес, сумма засчитывается в usage (сторонний источник) | Быстрый старт |
| Render | Free-сервис засыпает через 15 мин, просыпается ~1 мин; free Postgres удаляется через 30 дней | Только для демо |
| Hetzner | Два повышения в 2026: CX23 €5.49, CAX11 €5.99, часть линеек временами недоступна к заказу; в РФ ограничен | Дёшево для мировой аудитории и Узбекистана |
| Neon | Free: 100 CU-часов и 0.5–1 ГБ на проект (источники расходятся), scale-to-zero через 5 мин | Postgres для фазы 0 |
| Yandex Cloud | Managed PostgreSQL, Object Storage (S3 API), Serverless Containers (1M вызовов бесплатно); цены +5–8% с 01.05.2026 | **Обязательный кандидат для РФ** (152-ФЗ) |

**Регион и residency.** В Узбекистане с 26.03.2026 обязательная локализация оставлена только для биометрических и генетических данных и данных абонентов связи. Остальное можно хранить за рубежом при соблюдении условий. В РФ правило жёстче: первичная запись ПДн граждан РФ должна происходить в базе в России.

Поэтому проектируем **ячейки (cells)**: один и тот же Docker-образ и схема БД разворачиваются в «ru» (Yandex Cloud, Selectel или Timeweb) и в «global» (Hetzner или Fly + Neon). В `users.home_region` хранится регион пользователя. ID везде UUIDv7 (глобально уникальны), внешних ключей между регионами нет, ключи объектов имеют префикс региона. На старте ячейка одна, но код не предполагает, что база единственная. Статику PWA и модели MediaPipe для РФ отдаём с российского хостинга или CDN, не через Cloudflare или jsDelivr.

## 4. Рекомендуемая архитектура MVP

```
PWA (vanilla JS → позже TS) ── IndexedDB outbox (Dexie) ── Service Worker
   │  HTTPS, cookie-сессия
   ▼
[api] Hono (Node/Bun, Docker)                       [worker] тот же образ, роль "worker"
  ├─ /auth/* — Better Auth (Postgres-сессии)          ├─ pg-boss: пересимуляция реплеев,
  ├─ модули: profile, assessment, plan, catalog,     │   пересчёт лидербордов, web-push,
  │   sessions, leaderboards, social, admin          │   очистка, cron-напоминания
  ├─ game-core (общий TS-пакет: детерминированная     └─ (опц.) Python FastAPI: beat tracking
  │   симуляция; работает и в браузере, и на сервере)      только для курируемого каталога
  └─ /rt (WebSocket, фаза 3: дуэли)
   │
PostgreSQL 16/17 (источник правды; очереди pg-boss; лидерборды)
S3 API: R2 (global) / Yandex Object Storage (ru) / MinIO (локально)
Sentry (ошибки) · OpenTelemetry (трейсы) · PostHog (продуктовая аналитика, псевдо-ID)
```

**Почему именно так.** Hono работает на Node, Bun, Deno и Workers. Значит, при желании можно уйти на edge без переписывания. Postgres — единственная stateful-зависимость. Hono 4.13, Fastify 5.12 и NestJS 12 живы, но Hono проще и переносимее. NestJS для команды из одного человека избыточен.

Миграции — Drizzle (стабильная 0.45.4, ветка 1.0 в RC). Вариант — Prisma 7.10: в npm тег `latest` указывает на 8.0.0-rc, так что версию надо пинить. Очереди — **pg-boss 12** на Postgres, с cron, без Redis. Graphile Worker 0.18 тоже хорош, но всё ещё 0.x. BullMQ требует Redis.

**Фазы.**
- **Ф0, «я и друзья», ~$0–6 в месяц.** Один VPS с docker compose (Caddy + api + Postgres), `pg_dump` каждую ночь в S3. Либо API на Fly/Railway и Neon Free.
- **Ф1, публичный запуск.** Managed Postgres с PITR, отдельный worker, Sentry и PostHog.
- **Ф2.** Друзья, челленджи, «призраки», push.
- **Ф3.** Realtime-дуэли, Valkey для кэша и rate-limit, вторая ячейка.

## 5. Lock-in и путь выхода

| Вариант | Что привязывает | Путь выхода | Трудозатраты |
|---|---|---|---|
| Свой монолит | Ничего, кроме Postgres | Перенос контейнера и `pg_dump`/`pg_restore` | Часы |
| Supabase | Схема `auth.*`, RLS на `auth.uid()`, Storage API, Edge Functions (Deno), Realtime | Данные через `pg_dump`; пользователей и OAuth-связки экспортируем, пароли выносятся как bcrypt-хеши (н/п); Storage копируется S3-инструментами | Дни, если логика была в своём API; недели, если в RLS и Edge Functions |
| PocketBase | SQLite-схема и хуки | Экспорт и перенос в Postgres, переписать хуки | 1–2 недели |
| Convex / Firebase | Модель данных и функции | Переписать бэкенд целиком | Месяц и больше |
| Cloudflare | DO, Queues, D1, bindings | Hono переносится; DO → WS-сервер; D1 → Postgres | 1–3 недели |

## 6. Аутентификация

**Lucia** v3 объявлена deprecated: npm-пакет 3.2.2 помечен устаревшим, проект стал учебником. **Auth.js** с сентября 2025 сопровождает команда Better Auth в режиме патчей; v5 так и осталась beta, в npm это 4.24.15 и 5.0.0-beta. **Better Auth** — MIT, версия 1.7.11. В июле 2026 его купил Vercel, библиотека осталась открытой. Выбор: Better Auth, сессии в Postgres, httpOnly-cookie.

| Провайдер | Better Auth | Supabase Auth | Примечания |
|---|---|---|---|
| Email OTP / magic link | Плагины `emailOTP`, `magicLink` (н/п) | Встроено | OTP-код надёжнее ссылки: почтовые сканеры «съедают» одноразовые ссылки |
| Google, Apple | Встроены | Встроены | Apple на вебе требует платный Apple Developer (н/п) |
| Yandex ID | Готовый хелпер в generic OAuth (с 1.6.23) | Свой OIDC/OAuth | — |
| VK ID | generic OAuth вручную | Свой OAuth (н/п, нужен device_id) | OAuth 2.1, PKCE S256 обязателен, в callback приходит `device_id` |
| Telegram | Сторонний плагин `better-auth-telegram` (OIDC; есть баги с `origin` и `bot_id`) | Свой OIDC | Telegram теперь даёт **OIDC** (oauth.telegram.org, PKCE); старый виджет помечен legacy, его подпись проверяется на сервере |
| Telegram Mini App | Свой эндпоинт | Свой | Проверять `initData` по HMAC (ключ от bot token) или Ed25519 (third-party), плюс свежесть `auth_date`; `initDataUnsafe` не доверять |

## 7. Модель данных (черновик)

Все PK — `uuid` (v7). Время в `timestamptz`. Для каждой таблицы указан ключевой индекс.

| Таблица | Ключевые колонки | Индексы и заметки |
|---|---|---|
| `users` | id, email (citext), email_verified, home_region, created_at, deleted_at | unique(email); таблица Better Auth с переименованием моделей |
| `auth_accounts` / `auth_sessions` | provider_id, account_id, user_id / token, expires_at | unique(provider_id, account_id); имя `auth_sessions`, чтобы не путать с тренировками |
| `user_roles` | user_id, role (`admin`, `editor`) | PK(user_id, role) |
| `profiles` | user_id PK, handle, display_name, avatar_key, locale, tz, age_band, lb_visibility (`public`, `friends`, `hidden`) | unique(lower(handle)) |
| `assessments` | id, user_id, questionnaire_version, answers jsonb, test_results jsonb, computed_level, created_at | (user_id, created_at desc) |
| `plans` / `plan_items` | id, user_id, assessment_id, template_id, status / plan_id, day_idx, level_id, target_sec, session_id | (user_id) where status='active'; PK(plan_id, day_idx) |
| `games`, `exercises` | id, slug, config jsonb | unique(slug) |
| `levels` | id, game_id, exercise_id, slug, version, difficulty, config jsonb, score_rules jsonb, status (`draft`, `published`), published_at | unique(game_id, slug, version); опубликованная версия неизменяема |
| `tracks` | id, source (`curated`, `cc`, `user_hash`), title, artist, license, attribution, audio_key null, duration_ms, audio_sha256 | unique(audio_sha256); аудио пользователя на сервер **не загружаем**, храним только хеш |
| `beatmaps` | id, track_id, algo_version, difficulty, data (bytea/jsonb), note_count, produced_by | unique(track_id, algo_version, difficulty) |
| `attempts` | id, user_id, level_id, level_version, beatmap_id, seed, issued_at, expires_at, consumed_at | (user_id, issued_at); токены попыток |
| `workout_sessions` | **id от клиента**, user_id, attempt_id null, level_id, level_version, beatmap_id, device_id, started_at, ended_at, active_ms, score, accuracy, status (`pending`, `verified`, `flagged`, `rejected`, `unranked`), client_version, received_at | (user_id, started_at desc); (level_id, score desc) where status='verified'; запись append-only |
| `session_replays` | session_id PK, format_ver, hz, codec, size, sha256, data bytea или storage_key, keep_until | Хранить PB, «призраков» и топ; остальное удалять через 90 дней |
| `leaderboard_entries` | level_id, period (`all`, `2026-W42`), user_id, best_score, session_id, achieved_at | PK(level_id, period, user_id); (level_id, period, best_score desc, achieved_at) |
| `friendships` | user_id, friend_id, status (`pending`, `accepted`, `blocked`), requested_by, created_at | PK(user_id, friend_id), по строке на каждое направление; (friend_id) |
| `invites` | code, inviter_id, expires_at, uses | unique(code) |
| `challenges` / `challenge_participants` | id, creator_id, level_id, ghost_session_id, target_score, expires_at / challenge_id, user_id, session_id, result | (user_id, status) |
| `duels` (Ф3) | id, level_id, room_id, started_at, result jsonb | — |
| `devices` | id (от клиента), user_id, platform, last_seen_at | (user_id) |
| `push_subscriptions` | id, user_id, device_id, endpoint, p256dh, auth, fail_count, last_ok_at | unique(endpoint) |
| `notification_prefs` | user_id, reminder_local_time, tz, days_mask, quiet_hours | — |
| `audit_log` | id, actor_id, entity, entity_id, action, diff jsonb, at | (entity, entity_id) |
| `pgboss.*` | Создаётся pg-boss | — |

Аналитические события уходят в PostHog, а не в основную БД. Если нужны свои, кладём их в отдельную партиционированную таблицу `events`.

## 8. Эскиз API

Стиль: **REST + OpenAPI** (`@hono/zod-openapi` или oRPC). Он понятен мобильным клиентам и внешним инструментам, его легко кэшировать (ETag на каталоге) и тестировать. tRPC привязывает к TS-клиенту, GraphQL для такого CRUD избыточен. Прямой доступ клиента к БД в стиле Supabase требует идеального RLS.

```
POST /auth/*                          (Better Auth)
GET  /me · PATCH /me/profile · GET /me/export · DELETE /me
POST /assessments · GET /plans/current · POST /plans/current/regenerate
GET  /catalog?since=…                 (games, levels, tracks; ETag)
POST /attempts            → {attempt_id, token, seed, expires_at}
PUT  /sessions/{id}       (идемпотентный upsert)  · POST /sessions:batch (офлайн-синк)
PUT  /sessions/{id}/replay (binary ≤64 КБ)       · GET /sessions?cursor=
GET  /leaderboards/{level}?period=all|week&scope=global|friends&around=me
GET  /friends · POST /friends/requests · POST /friends/requests/{id}/accept · DELETE /friends/{uid}
POST /challenges · GET /challenges · GET /ghosts/{session_id}
POST /tracks/lookup {sha256} · GET /beatmaps?track=…&algo=… · POST /beatmaps (от клиента, с проверкой)
POST /push/subscriptions · DELETE /push/subscriptions/{id}
/admin/levels (CRUD + publish) · /admin/review (flagged sessions)
GET  /rt (WebSocket, Ф3)
```

## 9. Лидерборды: Postgres или Redis

Источник правды — `leaderboard_entries`. При финише проверенной сессии выполняется `INSERT … ON CONFLICT (level_id, period, user_id) DO UPDATE SET best_score = excluded.best_score … WHERE excluded.best_score > leaderboard_entries.best_score`. Топ-N читается по индексу за миллисекунды. Ранг пользователя считается как `count(*) WHERE best_score > $mine`: это индексный скан, приемлемый до ~10⁶ строк на доску. Лидерборд друзей строится через JOIN с `friendships` по десяткам или сотням строк.

**Redis/Valkey ZSET** (`ZADD GT`, `ZREVRANK` за O(log n)) добавляем, когда доска перевалит за миллион записей или нужны сотни RPS. Он остаётся кэшем, который можно пересобрать из Postgres. Для self-host лучше Valkey (BSD). Redis 8 перешёл на тройную лицензию с AGPL (н/п).

## 10. Realtime (дуэли, Ф3)

Трафик дуэли — ~10–20 Гц маленьких сообщений от двух игроков.

| Вариант | За | Против |
|---|---|---|
| WebSocket в монолите (Hono/`ws`) | Ноль новых сервисов | Один узел; для нескольких узлов нужен pub/sub |
| **Centrifugo** (Go, OSS; Redis-движок для кластера) | Масштабируется, presence, history | Отдельный сервис; часть функций только в PRO |
| Supabase Realtime Broadcast | Готово | Free: 200 соединений и 2M сообщений в месяц; Pro: 500 соединений и 5M, сверх — $2.50 за 1M |
| Durable Objects / PartyKit (`partyserver`) | Идеальная модель «комната = объект» | Привязка к Cloudflare, в РФ трафик режут |
| WebRTC DataChannel P2P | Почти бесплатно | Нужны signaling и TURN (стоит денег), сложнее |

План: WS-комнаты в монолите, при росте — Centrifugo. Сервер только ретранслирует и выносит вердикт по реплеям обоих игроков.

## 11. Офлайн-синхронизация

- Клиент генерирует **UUIDv7** для сессии, устройства и попытки. Сессия кладётся в outbox в IndexedDB (Dexie 4).
- Отправка — `PUT /sessions/{id}`, на сервере `INSERT … ON CONFLICT (id) DO NOTHING`, затем возвращается текущий статус. Повторы безопасны, и сессии неизменяемы, поэтому конфликтов слияния нет. Профиль и настройки — last-write-wins по `updated_at`.
- Background Sync API есть только в Chromium (н/п). Синхронизируемся на событиях `online`, `visibilitychange` и при старте приложения.
- Офлайн-сессия без серверного `attempt`-токена получает статус `unranked`. В рейтинг она попадает только после пересимуляции и проверки лимитов, с пометкой «офлайн».
- Битмапы и каталог кэшируются Service Worker'ом по хешу и версии. PGlite, PowerSync и Zero для такой модели избыточны.

## 12. Античит для очков, посчитанных на клиенте

Честно: PWA не может доказать, что человек реально стоял в планке. Ключ, зашитый в клиент, извлекается. Аттестации устройства (Play Integrity, App Attest) в вебе нет. Поэтому защита многоуровневая и вероятностная.

1. **Токен попытки.** `POST /attempts` выдаёт `{attempt_id, seed, level_version, exp}` с серверной HMAC-подписью. Он ограничивает частоту попыток и даёт серверу seed для детерминизма.
2. **Компактный реплей сигнала** (не landmarks): `steer` в int8 на 20–30 Гц, флаги «поза ок / пауза», тайминги нажатий нот, контрольная сумма. Это ~2–10 КБ в минуту. Биометрией такой сигнал не является.
3. **Пересимуляция.** `game-core` — детерминированный модуль (фиксированный шаг, без `Math.random`, только seed). Воркер прогоняет реплей и сравнивает счёт; расхождение ставит статус `rejected`.
4. **Границы правдоподобия на уровень** (`levels.score_rules`): максимум очков в секунду, минимальная и максимальная длительность, предел точности ритма (100% на Hard подозрительно), разумность `ended_at - started_at` относительно `received_at`.
5. **Статистика сигнала.** У человека есть микродрожание и разброс задержки реакции. «Идеально гладкий» сигнал или нулевая дисперсия отправляют сессию в `flagged`.
6. **Rate limit** на `attempts` и `sessions` по пользователю и IP (`rate-limiter-flexible` или Valkey). Теневой бан и ручная проверка топ-10 каждой доски. По умолчанию показывается рейтинг среди друзей, там мотивации жульничать меньше.

## 13. Аудиоанализ и Python

По умолчанию beat/onset-детекция идёт **на клиенте** через Web Audio (например, `web-audio-beat-detector` под MIT или свой spectral flux). Пользовательский файл никуда не уходит, что снимает вопросы авторских прав и трафика. На сервер отправляется битмап с ключом `audio_sha256 + algo_version`, и другие владельцы того же файла получают его из кэша.

Python (FastAPI + librosa 1.0, ISC) нужен только для пакетной обработки курируемого и CC-каталога. Это отдельный воркер, который забирает задачи из таблицы через `SELECT … FOR UPDATE SKIP LOCKED`.

Лицензии: madmom (модели CC BY-NC-SA, только некоммерческое использование), essentia и essentia.js (AGPL-3.0), aubio (GPL-3) — для будущего коммерческого продукта это ловушки.

## 14. Эксплуатация

- **Миграции.** `drizzle-kit generate` → SQL-файлы проходят ревью и коммитятся в git, `migrate` запускается в CI перед деплоем. `push` в прод не используем. Ломающие изменения делаем по схеме expand → backfill → contract.
- **Бэкапы.** Supabase Pro хранит ежедневные бэкапы 7 дней. PITR стоит ~$100/мес за 7 дней хранения, в spend cap не входит и при включении заменяет ежедневные бэкапы. При self-host: WAL-G или pgBackRest в S3 и **ежемесячное тестовое восстановление**. В Ф0 достаточно `pg_dump` каждую ночь в объектное хранилище другого провайдера.
- **Наблюдаемость.** Sentry (клиент + сервер; `@sentry/node` 11), OpenTelemetry SDK (трейсы в Grafana Cloud, SigNoz или Jaeger), PostHog (воронки онбординга, удержание). Во внешние сервисы отправляем только псевдонимный `user_id`, без email. Для RU-ячейки — self-host GlitchTip или PostHog (н/п).

## 15. Приватность

- Видео, кадры и landmarks не покидают устройство. Это закреплено в политике и проверяется в коде (CSP `connect-src` разрешает только свой API).
- Анкета минимальна: возрастная группа вместо даты рождения. Рост и вес опциональны, их лучше хранить только на устройстве. **Никаких диагнозов и травм в свободном тексте**, это медицинские данные с особым режимом.
- Есть экспорт данных и удаление аккаунта: каскад плюс удаление объектов из S3. Минимальный возраст 13–16 лет в зависимости от региона.
- Реплеи удаляются по `keep_until`. IP хранятся только в логах rate-limit, и недолго.

## 16. Оценка стоимости в месяц

Допущения: 8 сессий на MAU в месяц, реплей ~6 КБ, ~200 API-запросов на MAU, музыка кэшируется Service Worker'ом.

| | 0–100 MAU (Ф0) | 10k MAU | 100k MAU |
|---|---|---|---|
| **Рекомендованный стек** | VPS €5–6 (или Neon Free + Fly ~$2–5); итого **$0–7** | VPS 2–4 vCPU €10–20 + managed Postgres $25–40 + R2 ~$1 + email OTP ~$10–20 (н/п) → **~$50–90** | 2 узла API + worker €40–80, Postgres 8 ГБ RAM с PITR $150–250, Valkey €5–10, R2 $5–10, email $30–60 → **~$250–450** |
| Supabase (план Б) | $0, но пауза после 7 дней тишины | Pro $25 + compute ~$10–60 (н/п) → **~$40–100** | Pro + compute Medium/Large + PITR $100 + egress → **~$300–600** (н/п) |
| Firebase | $0 | ~$20–80 (чтения Firestore) | Auth сверх 50k MAU: ~50k × $0.0055 ≈ **$275 только за Auth**, плюс Firestore |
| Cloudflare edge | $0 | Workers Paid ~$5+ (н/п) → **~$10–30** | **~$50–150**, самый дешёвый вариант (но см. РФ) |

Главный риск по деньгам — раздача курируемой музыки. 100k × 10 треков × 4 МБ ≈ 4 ТБ в месяц. Поэтому её держим в R2 (egress бесплатный) или на CDN, а не в Supabase Storage или на VPS с лимитом трафика (у Hetzner в 2026 пересмотрены и включённые объёмы трафика, н/п).

## 17. Подводные камни

1. **Supabase RLS.** Таблица, созданная SQL-ом без `ENABLE ROW LEVEL SECURITY`, открыта всем через API. Другие типичные ошибки: политики на основе `user_metadata` (её правит сам пользователь); `UPDATE` без `WITH CHECK`; view без `security_invoker`; `security definer`-функции в публичной схеме; нет индексов на колонках из политик (н/п, общеизвестная практика).
2. **Ключи.** `service_role`/secret key и ключ подписи токена попыток никогда не попадают в бандл. Секреты лежат только на сервере, ротация расписана.
3. **JWT.** Долгоживущий access-токен в `localStorage` нельзя отозвать, и его крадут через XSS. Лучше серверные сессии в httpOnly-cookie (`SameSite=Lax`) плюс проверка `Origin` для CSRF. Если всё же JWT — проверять `iss`, `aud`, `exp` и алгоритм.
4. **Magic link** открывают корпоративные почтовые сканеры. Используем OTP-код и лимиты на отправку писем (иначе email bombing).
5. **OAuth.** Обязательны PKCE и `state`. VK ID требует `device_id`. Telegram OIDC переключается в BotFather необратимо. Подпись виджета и Mini App проверяется только на сервере.
6. **Free-тарифы засыпают.** Supabase ставит на паузу после 7 дней без активности, Appwrite — после 7 дней без входа в консоль. Render удаляет БД через 30 дней, у Fly нет бесплатного тарифа. Neon засыпает через 5 мин, и первый запрос после этого медленный.
7. **Россия.** Замедление Cloudflare, Hetzner и DO, требования 152-ФЗ, а Google и Apple могут быть недоступны для части пользователей. Нужны вход через Yandex, VK и Telegram и своя ячейка в РФ. Свежего статуса блокировок на 2026 год я не нашёл, это надо проверить.
8. **Web Push на iOS** работает только для PWA, добавленной на домашний экран (н/п). Библиотека `web-push` стабильна, но не обновлялась с января 2024.
9. **Детерминизм.** Float-математика в разных движках может расходиться. В `game-core` используем фиксированный шаг, фиксированную точку или квантование, и тестируем «реплей → тот же счёт» в CI на Node и в браузерах.
10. **Версии уровней.** Рекорды привязаны к `level_version`. Если править опубликованный уровень, лидерборд превращается в мусор.
11. **Пред-1.0 зависимости** (PocketBase, Drizzle 0.x, Graphile Worker 0.x, Prisma 8 RC под тегом `latest`) — версии пинить.
12. **Лицензии** аудиобиблиотек (раздел 13) и музыки: CC BY требует атрибуции, CC NC запрещает коммерческое использование.

## Sources

- Supabase pricing — https://supabase.com/pricing
- Supabase billing — https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase MAU — https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users
- Supabase Realtime limits/pricing — https://supabase.com/docs/guides/realtime/limits , https://supabase.com/docs/guides/realtime/pricing
- Supabase Edge Functions pricing — https://supabase.com/docs/guides/functions/pricing
- Supabase Queues — https://supabase.com/blog/supabase-queues
- Supabase PITR / backups — https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery , https://supabase.com/docs/guides/platform/backups
- Supabase custom OIDC providers — https://supabase.com/blog/custom-oauth-oidc-providers
- Firebase pricing (сторонние обзоры) — https://magora-systems.com/firebase-pricing/ , https://blog.logto.io/firebase-authentication-pricing , https://agentdeals.dev/vendor/firebase
- Convex — https://news.convex.dev/self-hosting/ , https://agentdeals.dev/vendor/convex , https://www.saasodds.com/blog/convex-pricing
- Appwrite — https://appwrite.io/changelog/entry/2025-07-23 , https://appwrite.io/blog/post/announcing-database-reads-and-writes-pricing , https://agentdeals.dev/vendor/appwrite-cloud
- PocketBase — https://github.com/pocketbase/pocketbase/releases , https://github.com/pocketbase/pocketbase/discussions/7612
- Better Auth / Auth.js — https://better-auth.com/blog/authjs-joins-better-auth , https://better-auth.com/docs/plugins/generic-oauth , https://better-auth.com/docs/authentication/other-social-providers , https://github.com/better-auth/better-auth/pull/9138
- Better Auth → Vercel — https://www.achromatic.dev/blog/vercel-acquires-better-auth-nextjs-saas , https://seedtable.com/exits/better-auth
- Lucia — https://github.com/lucia-auth/lucia , https://registry.npmjs.org/lucia
- Telegram — https://core.telegram.org/bots/telegram-login , https://github.com/vcode-sh/better-auth-telegram , https://docs.telegram-mini-apps.com/packages/tma-js-init-data-node/validating
- VK ID — https://python-social-auth.readthedocs.io/en/latest/backends/vk.html , https://github.com/movemoveapp/vkid , https://authjs.dev/getting-started/providers/vk
- Cloudflare — https://developers.cloudflare.com/workers/platform/pricing/ , https://developers.cloudflare.com/d1/platform/limits/ , https://developers.cloudflare.com/d1/platform/pricing/ , https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/ , https://developers.cloudflare.com/durable-objects/platform/pricing/ , https://developers.cloudflare.com/hyperdrive/platform/pricing/ , https://developers.cloudflare.com/r2/pricing/ , https://blog.cloudflare.com/cloudflare-acquires-partykit
- Ограничения в РФ — https://blog.cloudflare.com/russian-internet-users-are-unable-to-access-the-open-internet/ , https://therecord.media/cloudflare-russia-restricting-access-crackdown
- 152-ФЗ с 01.07.2025 — https://www.lidings.com/media/legalupdates/localization_pd_update/ , https://denuo.legal/en/insights/news/250303/
- Узбекистан, закон о ПДн 2026 — https://kun.uz/en/news/2026/03/27/uzbekistan-amends-personal-data-law-to-facilitate-global-payment-systems , https://kun.uz/en/news/2026/08/04/uzbekistan-approves-49-countries-for-simplified-personal-data-transfers
- Neon — https://neon.com/faqs/free-plan-limits-and-quotas
- Hetzner 2026 — https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ , https://northflank.com/blog/hetzner-cloud-server-price-increases
- Fly.io — https://fly.io/pricing/ , https://fly.io/docs/about/pricing/
- Render — https://render.com/docs/free , https://render.com/changelog/free-postgresql-instances-now-expire-after-30-days-previously-90
- Railway (сторонний) — https://www.srvrlss.io/provider/railway/
- Vercel Hobby — https://vercel.com/docs/limits/fair-use-guidelines , https://vercel.com/docs/plans/hobby
- Yandex Cloud — https://yandex.cloud/en/blog/pricing-update-2026 , https://yandex.cloud/en/docs/managed-postgresql/pricing , https://yandex.cloud/en/services/serverless-containers
- Centrifugo — https://centrifugal.dev/docs/server/engines
- Версии и лицензии пакетов (проверено 19.10.2026) — https://registry.npmjs.org/better-auth , https://registry.npmjs.org/drizzle-orm , https://registry.npmjs.org/prisma , https://registry.npmjs.org/pg-boss , https://registry.npmjs.org/essentia.js , https://pypi.org/pypi/madmom/json , https://pypi.org/pypi/librosa/json
