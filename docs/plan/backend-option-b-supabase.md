# Вариант B: Supabase-first (managed) с запланированным выходом

*Предложение архитектора, 19.10.2026. Угол: максимальная скорость одного разработчика с ИИ-ассистентом за счёт управляемого Supabase, при этом lock-in держим низким по правилам из §1. Опирается на `docs/research/*.md`. Лимиты и цены Supabase сверены с официальной документацией и сторонними сводками 2026 года; всё, что не проверено, помечено (н/п). Перед оплатой цены нужно перепроверить на supabase.com/pricing. Поправки из `docs/research/verify-backend-compliance.md` учтены; там, где они расходятся с backend.md и compliance.md, приоритет у них.*

## 0. Коротко

- **Что предлагаю.** Один проект Supabase в регионе Frankfurt: Postgres 17, Auth, PostgREST, Storage, Edge Functions, Realtime, Cron и Queues. Это «глобальная» ячейка. Музыка лежит в Cloudflare R2, где исходящий трафик бесплатен. Аудиоанализ курируемого каталога выполняет отдельный Python-воркер, который запускается по требованию. В фазах 0–1 своих постоянно работающих серверов нет вообще.
- **Почему быстрее своего монолита из backend.md.** Многое уже готово:
  - вход по email-коду и анонимный вход с апгрейдом до аккаунта;
  - OAuth и кастомные OIDC-провайдеры (Yandex, VK, Telegram);
  - файлы с политиками доступа;
  - cron и очереди в той же БД;
  - админка (Studio), бэкапы, логи и линтер безопасности.

  Писать остаётся только доменную логику: SQL-функции и 5–6 Edge Functions. Это экономит примерно 3–5 недель до первого публичного релиза.
- **Где проигрывает.** Региона в РФ нет, а оплатить Supabase российской картой нельзя. 152-ФЗ при этом требует базу в РФ. Значит, RU-ячейка — это self-hosted Supabase (около 11 контейнеров) на российской VM, а это тяжелее, чем «Postgres + один API». Кроме того, PITR работает только на compute не ниже Small, так что минимальная продовая конфигурация Pro + Small + PITR стоит около **$130 в месяц** на проект. В RLS легко оставить дыру, а Edge Functions не потянут ML-анализ аудио.
- **Как держим lock-in низким.**
  - Вся логика живёт в переносимом SQL и в одном Hono-приложении, которое запускается и в Deno, и в Node.
  - `supabase-js` импортируется только в одном пакете-адаптере.
  - Вход без паролей, поэтому при переезде нечего переносить, кроме связок пользователя с провайдерами.
  - Свой домен для API с первого публичного дня.
  - Каждую ночь дамп в независимое от вендора хранилище, раз в месяц репетиция восстановления.

  Выход в self-hosted Supabase займёт 1–2 дня, в «Postgres + свой API» — 2–4 недели.
- **Стоимость глобальной ячейки в месяц.** Ф0: $0–2 на Free или $25 на Pro без паузы. Ф1 (1–10k MAU): примерно $45–90. Ф2 (100k MAU): примерно $250–450. Если нужна RU-ячейка, к этому добавляется примерно $15–20 / $40–80 / $200–400 по тем же фазам.

## 1. Правила: Supabase как дистрибутив Postgres, а не фреймворк

1. **Схема и инварианты — только в SQL-миграциях в git** (`supabase/migrations`). Схему никогда не меняем через Studio. CI ловит расхождение: `supabase db diff --linked` должен быть пустым.
2. **Логика живёт в двух переносимых местах.** Первое — функции PL/pgSQL, они работают в любом Postgres. Второе — одно Hono-приложение в Edge Functions, тот же код запускается в Node-контейнере. Database Webhooks из интерфейса и триггеры, созданные в Studio, запрещены.
3. **Клиент знает про Supabase только через `packages/api-client`.** У пакета четыре интерфейса: `AuthPort` (вход), `DataPort` (данные), `FilesPort` (файлы), `LivePort` (realtime). Игры и интерфейс про него не знают.
4. **Используем только переносимые расширения:** `pgcrypto`, `citext`, `pg_cron`, `pgmq`, `pg_net`. Не используем `pg_graphql` (его выключаем), `pg_jsonschema`, `plv8` и `wrappers`: в managed Postgres российских облаков их может не оказаться (н/п).
5. **Свой домен:** `api.<домен>` (платное дополнение Supabase custom domain) и `media.<домен>`. Ни в CSP, ни в клиенте нет `*.supabase.co`, поэтому переезд сводится к смене DNS.
6. **Вход без паролей:** код на email плюс OAuth. При миграции не придётся переносить хеши паролей.

## 2. Компоненты

```
┌─────────────────────────── Устройство (PWA, офлайн-первый) ───────────────────────────┐
│ камера → MediaPipe (worker) → BodyFrame → game-core (детерминированный TS) → canvas    │
│ Dexie/IndexedDB: история, outbox, план, калибровки, АНКЕТА ЗДОРОВЬЯ (только здесь)     │
│ OPFS: свои треки (аудио не уходит) · Service Worker: оболочка, модели, треки, анализы  │
│ packages/api-client ← единственное место с supabase-js                                 │
└──────┬────────────────┬─────────────────┬───────────────────┬──────────────────────────┘
       │HTTPS (REST/RPC)│HTTPS /functions │WSS (опционально)  │HTTPS + Range
       ▼                ▼                 ▼                   ▼
 api.<домен> = Supabase (Frankfurt) ════════════════════╗   media.<домен> = Cloudflare R2
 ║ Auth (OTP, anon, OAuth/OIDC) │ PostgREST (select+RPC)║   (музыка; egress $0)
 ║ Edge Functions: Hono /api/*  │ Storage: replays,     ║          ▲ S3 put
 ║   attempts, verify, push,    │   avatars, analyses,  ║          │
 ║   export/purge, oauth-bridge │   ingest (приватные)  ║   analysis-worker (Python:
 ║ Realtime: broadcast/presence │ Studio, Logs, Advisors║   ffmpeg, fpcalc, Beat This!,
 ╠═══════════════ PostgreSQL 17 ════════════════════════╣   librosa): локально /
 ║ public (RLS) · private · analytics · auth · storage  ║◄──GitHub Actions / Fly
 ║ pg_cron → pg_net → Edge;  pgmq: verify, push, analyze║   по требованию (через пулер)
 ╚══════════════════════════════════════════════════════╝
 Внешние: SMTP (Resend/SES; в РФ российский ESP) · Sentry · push-сервисы браузеров
```

## 3. Топология и стоимость по фазам

Допущения взяты из backend.md: 8 сессий на одного MAU в месяц, реплей около 6 КБ, около 200 запросов на MAU, музыку кеширует Service Worker.

| | **Ф0: я и друзья (≤50)** | **Ф1: 1–10k MAU** | **Ф2: 100k MAU** |
|---|---|---|---|
| Supabase | Free: 500 МБ БД, 1 ГБ файлов, 50k MAU, 5 ГБ egress (+5 ГБ cached). **Пауза после 7 дней без активности, бэкапов нет.** $0; как только друзья играют регулярно — Pro за $25 | Pro $25 + Small compute (~$15 минус кредит $10) + custom domain ~$10 (н/п) → **~$40** (без PITR; с ним было бы ~$140) | Pro $25 + Large compute ~$110 (н/п) − кредит $10 + PITR на 7 дней $100 (требует compute не ниже Small, Large это покрывает) + домен $10 + перерасход Realtime/Edge/egress $20–40 → **~$255–275** |
| Статика PWA | GitHub Pages (уже есть) | Cloudflare или GitHub Pages: $0 | $0 |
| Музыка | R2 Free (10 ГБ, egress $0) | R2: ~$0–1 | R2: ~$5 (примерно 4 ТБ отдачи бесплатно) |
| Почта для кодов входа | Resend Free (н/п) | $0–20 | $20–40 (или SES ~$5) |
| Аудиоанализ | ноутбук или GitHub Actions: $0 | то же или Fly machine по требованию: $0–3 | Fly или Hetzner: ~$5 |
| Ошибки и аптайм | Sentry Free, UptimeRobot Free | то же | Sentry Team ~$26 или Free с сэмплингом |
| Бэкап у другого провайдера | ночной `pg_dump` → R2 (GitHub Actions) | то же | то же + rclone объектов Storage → R2 |
| **Итого, global** | **$0–2** (Free) / **$25–27** (Pro) | **~$45–90** | **~$250–450** |
| **RU-ячейка, если нужна** | self-hosted Supabase на VM 2 vCPU / 4 ГБ (Selectel/Timeweb): **~$15–20** (н/п) | VM 4/8 + Object Storage + бэкапы WAL-G: **~$40–80** | две VM (БД 8 vCPU / 32 ГБ и сервисы) + CDN для музыки в РФ (там трафик платный): **~$200–400** |

Главное правило по деньгам: музыку никогда не раздаём из Supabase Storage. 4 ТБ по $0,09 за ГБ обошлись бы примерно в $360 в месяц. На 100k MAU Supabase не дешевле своего монолита: там те же $250–450. Выигрываем во времени разработки и в том, что эксплуатировать приходится меньше компонентов.

**Как выбрать регион.**
- **РФ.** Если владелец или аудитория в РФ, RU-ячейку на self-hosted Supabase поднимаем **уже в Ф0**: код и CLI те же, а переносить людей потом дороже.
  - Все сервисы, которые получают ПДн напрямую из браузера российского пользователя, тоже должны быть российскими или self-hosted. Это почта, сбор ошибок, вход и аналитика: иностранный SaaS здесь означает сбор через иностранную БД.
  - Применяются ли нормы о входе (ч. 10 ст. 8 149-ФЗ) к владельцу, который не гражданин РФ, не подтверждено. Перед запуском в РФ нужна консультация российского юриста.
- **Узбекистан и остальной мир.** Подходит Frankfurt. По Закону № ЗРУ-1125 от 26.03.2026 локализация обязательна только для биометрии, генетических данных и данных абонентов местных операторов связи. Ничего из этого мы не храним. Германия, вероятно, входит в утверждённый список из 49 стран (н/п).
- **Ячейки не делят БД.** Регион пользователя хранится в `profiles.home_region`, UUIDv7 уникальны глобально, а друзья и лидерборды живут внутри своей ячейки.

**Российский хостинг не решает проблему доступности.** В режиме «белых списков» мобильного интернета недоступен любой сайт вне перечня, даже размещённый в РФ. RU-ячейка нужна только для 152-ФЗ. Работоспособность обеспечивает **полностью офлайн-PWA** (§7): модели и WASM кешируются при первом запуске, а у игры нет ни одного обязательного сетевого шага.

## 4. Модель данных

Первичные ключи — `uuid` (для сущностей, которые создаёт клиент, — v7). Время хранится в `timestamptz`. Перечисления делаем как `text` + `check`: такие проще менять миграциями, чем enum. Схем четыре:
- `public` — видна через API, всё под RLS;
- `private` — не видна через API: секреты, служебные таблицы, функции `security definer`;
- `analytics` — события;
- служебные RPC, которые может исполнять только `service_role`.

| Таблица | Ключевые колонки | Индексы и заметки |
|---|---|---|
| `profiles` | id → `auth.users` (каскадное удаление), handle citext, display_name, avatar_key, locale, tz, age_band, home_region, lb_visibility (`hidden` по умолчанию, `friends`, `public`), level 1–30, xp, gems, stars_total, deleted_at | unique(handle). xp и gems меняет только сервер (через гранты на колонки) |
| `consents` | user_id, doc (`privacy`, `tos`, `health_disclaimer`, `lb_public`, `ru_pd`), version, accepted_at | только добавление. Принятие дисклеймера — единственный след анкеты на сервере |
| `plan_state` | user_id PK, level, days_per_week, plan_version, week_template jsonb, version int, updated_at | оптимистичная конкуренция по `version` |
| `assessments` | id, user_id, questionnaire_version, start_level (вычисленный уровень), created_at | **и больше ничего**: ни ответов анкеты (даже да/нет), ни флага «осторожного маршрута», ни исключений |
| `devices` | id (выдаёт клиент), user_id, platform, app_version, last_seen_at | (user_id) |
| `games`, `levels` | slug, version, physical_level, config jsonb, score_rules jsonb, status (`draft`, `published`, `retired`) | unique(game_id, slug, version). Триггер запрещает UPDATE опубликованной версии |
| `tracks` | source (`curated`, `cc`, `audius`), title, artist, license_code, license_url, attribution, proof_key, proof_date, regions_allowed text[], status, takedown, audio_key, duration_ms, bpm, energy, tags | только треки, которые раздаём мы |
| `analyses` | PK(fp_key, algo_version), pcm_sha256, chroma_simhash bigint, duration_ms, source (`server`/`client`), trust, payload_key, bpm, confidence, submitted_by | индексы (pcm_sha256) и (корзина длительности, simhash). Аудио пользователей на сервере нет |
| `charts` | track_id, difficulty, generator_version, seed, payload_key, hash | только ручные карты каталога. Авто-карты клиент генерирует детерминированно |
| `private.attempts` | id, user_id, board_key, level_version, seed, issued_at, expires_at, consumed_at, offline_pack | (user_id, issued_at) |
| `workout_sessions` | **id выдаёт клиент**, user_id, device_id, attempt_id, game_id, board_key, mode (`plan`, `free`, `daily`, `challenge`, `test`), started_at, ended_at, active_ms, good_form_ms, score, accuracy, max_combo, stars, rpe, client_version, status (`pending`, `unranked`, `verified`, `flagged`, `rejected`), reason, replay_key, server_seq | (user_id, started_at desc); (board_key, status). Только добавление |
| `leaderboard_entries` | board_key, period (`all`, `2026-W43`, `d:2026-10-19`), user_id, best_score, session_id, achieved_at | PK(board_key, period, user_id); индекс (board_key, period, best_score desc, achieved_at) |
| `friendships`, `invites` | user_id, friend_id, status, requested_by / code, inviter_id, expires_at, uses | по строке на каждое направление; индекс (friend_id) |
| `challenges`, `challenge_participants` | board_key, seed, ghost_session_id, target_score, expires_at / user_id, session_id, best_score | (user_id, status) |
| `ledger` | user_id, kind (`xp`, `gems`, `stars`), delta, reason, ref_id | unique(user_id, kind, reason, ref_id): награда не начислится дважды |
| `items`, `inventory` | kind (скин, шлейф, тема), price_gems, unlock_rule / user_id, item_id, source | |
| `weekly_goals` | PK(user_id, week_start), target, done, freeze_used | |
| `push_subscriptions`, `notification_prefs` | endpoint unique, p256dh, auth, fail_count / reminder_local_time, tz, days_mask, quiet_hours | |
| `app_config` | key, value jsonb, min_app_version | доступна анонимам: фича-флаги |
| `private.user_trust`, `private.audit_log`, `private.rate_limits` | trust_score, shadow_banned / actor, entity, diff / bucket, window, count | |
| `analytics.events` | ts, pseudo_id, name, props jsonb | партиции по месяцам. Сырые события живут 90 дней, дальше только агрегаты |

**Что хранится только на устройстве:**
- **все** ответы анкеты, в том числе ответы «да/нет»: PAR-Q, травмы, боль, давление, беременность;
- отметки о боли после сессии;
- «осторожный маршрут» и исключённые вариации (запястья, плечи). План генерирует клиент из этих данных, а сервер видит только уровень. Уровни 1–5 бывают и у обычных новичков, поэтому по уровню здоровье не вычислить (косвенный вывод суд ЕС тоже считает данными о здоровье);
- вес и рост;
- кадры камеры и landmarks;
- аудио пользователя и названия его треков;
- калибровки задержки.

На новом устройстве короткий вопрос о боли задаётся заново, это занимает около 20 секунд. В CI есть линтер приватности: он проверяет, что в схеме нет колонок с именами вида `pain|injur|pregnan|pressure|parq|weight`.

**Набросок политик RLS:**

```sql
alter table public.workout_sessions enable row level security;
revoke insert, update, delete on public.workout_sessions from anon, authenticated; -- запись только через RPC
create policy ws_own on public.workout_sessions for select to authenticated
  using (user_id = (select auth.uid()));             -- (select …) вычисляется один раз на запрос

revoke update on public.profiles from authenticated;  -- права на колонки, а не только политика
grant update (display_name, avatar_key, locale, tz, lb_visibility) on public.profiles to authenticated;
create policy pr_upd on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy replay_put on storage.objects for insert to authenticated
  with check (bucket_id = 'replays' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy ghost_get on storage.objects for select to authenticated
  using (bucket_id = 'replays' and private.can_read_replay(name)); -- свой, друга, участника вызова

create policy rt_user on realtime.messages for select to authenticated
  using (realtime.topic() = 'user:' || (select auth.uid())::text);

-- роль админа берём только из claim, который ставит custom access token hook, НЕ из user_metadata
create function private.is_admin() returns bool language sql stable
  as $$ select coalesce(auth.jwt() ->> 'app_role' = 'admin', false) $$;
```

Чужие профили видны только через RPC с `security definer`. Они отдают `handle`, `display_name` и `avatar_key`, учитывая `lb_visibility` и дружбу. Саму таблицу наружу не открываем.

## 5. API: PostgREST, RPC или Edge Functions

| Канал | Что через него идёт | Почему |
|---|---|---|
| **Чтение через PostgREST** (под RLS) | каталог (`games`, опубликованные `levels`, `tracks`, `app_config`); свои сессии, план и инвентарь; друзья | кода писать не нужно, ответы кеширует Service Worker |
| **RPC** (PL/pgSQL с `set search_path = ''`; первой строкой проверка `auth.uid()`) | `sync_push(ops)`, `sync_pull(since)`, `get_leaderboard(board, period, scope, around)`, `friend_request`/`accept`/`remove`, `create_challenge`/`join_challenge`, `lookup_analysis`, `request_account_deletion`, `track(events)`, `admin_publish_level` | атомарность, переносимый SQL, работает в контексте пользователя под RLS |
| **Служебные RPC** (исполняет только `service_role`) | `issue_attempt`, `finalize_session`, `export_user`, `merge_guest` | их вызывают только Edge Functions |
| **Edge Functions** (одно Hono-приложение `api` плюс отдельные `verify` и `push`) | `POST /attempts` (HMAC-токены и офлайн-пакеты), `verify` (пересимуляция), `push-dispatch`, `export`, `purge-user`, `merge-guest`, `submit-analysis` (zod-проверка большого payload), `oauth/vk` и `oauth/yandex` (запасной мост) | здесь нужны секреты, внешние вызовы или процессорное время. Код переносится в Node без изменений |

**Валидация.**
- **Схемы.** В `packages/shared` лежат zod-схемы (zod 4): `SessionV1`, `ReplayHeaderV1`, `AnalysisV1`, `ChartV1`, `SyncOp`. Клиент проверяет данные перед записью в outbox, Edge Functions — на входе.
- **Сборка Edge Functions.** Supabase собирает только содержимое `supabase/functions`, поэтому CI копирует `shared` и `game-core` в `functions/_shared` (н/п: проверить на import map).
- **БД.** Жёсткие инварианты закреплены CHECK-ограничениями: `ended_at > started_at`, `active_ms <= 3600000`, `stars between 0 and 3`. Остальное проверяют сами RPC.
- **Общий контракт с Python.** `z.toJSONSchema()` выгружает JSON Schema для `AnalysisV1`, и из неё Python-воркер генерирует pydantic-модель. В итоге TS и Python работают по одному контракту.
- **Типы БД для TS** даёт `supabase gen types`.

## 6. Аутентификация

| Ячейка | Способы входа |
|---|---|
| Global (мир, Узбекистан) | код на email (6 цифр, а не magic link), Google, Telegram как кастомный OIDC-провайдер (такие провайдеры есть с 08.04.2026, Auth v2.187.0). Apple — только когда появится платный аккаунт Apple Developer |
| RU (152-ФЗ; ч. 10 ст. 8 149-ФЗ; ст. 13.55 КоАП по 199-ФЗ, действует с 07.07.2026) | **По умолчанию играем без аккаунта:** норма касается только ресурсов с авторизацией. Аккаунт нужен только для друзей и лидербордов, и войти можно тремя способами: VK ID, Яндекс ID (кастомный OIDC/OAuth) или **российский номер телефона**. Код по SMS отправляется через Send SMS Hook и российский SMS-шлюз (н/п для self-hosted). **Запрещены все иностранные сервисы входа**: Google, Apple, Telegram и другие. Вход по email юридически спорен, поэтому он выключен, пока юрист не даст заключение. Анонимного входа в RU-ячейке нет, чтобы не спорить, считается ли он авторизацией |

Кастомных провайдеров может быть не больше трёх на проект: VK и Яндекс в этот лимит укладываются. Они могут не работать в self-hosted GoTrue (н/п), а VK требует `device_id`. На этот случай есть **мост в Edge Function**:
1. Функция сама проходит OAuth с PKCE.
2. Затем вызывает `auth.admin.generateLink({type:'magiclink'})`.
3. Клиент вызывает `verifyOtp({token_hash})` и получает обычную сессию Supabase.

**Как гость становится пользователем с аккаунтом:**
1. При первом запуске **аккаунт не создаётся**: всё пишется локально. Для фазы «я и друзья» это основной режим.
2. **Анонимный вход (только в global-ячейке) откладываем** до первого социального или рейтингового действия: задать ник, принять вызов по ссылке, попасть в лидерборд. В RU-ячейке на этом шаге сразу предлагаются VK ID, Яндекс ID или телефон. Вход идёт через `signInAnonymously` с hCaptcha. Сразу после него outbox отправляет всё накопленное. Анонимный пользователь получает роль `authenticated` и claim `is_anonymous`, и там, где это важно, политики его проверяют: аноним не попадает в публичный лидерборд и не создаёт инвайты.
3. **Апгрейд до аккаунта** — `updateUser({email})` плюс код из письма или `linkIdentity()` (включаем manual linking). `user_id` не меняется, поэтому все данные остаются на месте. На GitHub есть сообщение о баге конвертации через код, поэтому этот сценарий покрываем e2e-тестом. Запасной путь — **слияние**: пользователь входит в постоянный аккаунт, Edge `merge-guest` получает оба JWT, переносит строки анонима (сессии, ledger, инвентарь, дружбы) и удаляет его. Тот же код решает случай, когда на втором устройстве уже есть аккаунт.
4. Брошенных анонимов cron удаляет через 30 дней: они занимают место и считаются в MAU.

**Настройки Auth:**
- регистрация по паролю выключена;
- свой SMTP (встроенный годится только для тестов);
- access-токен JWT живёт 1 час, refresh-токены ротируются;
- включён «secure email change»;
- лимиты на отправку кодов и анонимный вход по IP.

Ключи используем новые, `sb_publishable_…` и `sb_secret_…`: старые `anon` и `service_role` Supabase выводит из оборота к концу 2026 года.

## 7. Офлайн-синхронизация

- **Офлайн — основной режим, а не исключение.** При старте игры нет ни одного обязательного сетевого шага: вход, каталог и `app_config` берутся из кеша. Модели MediaPipe и WASM скачиваются в кеш при первом запуске. Outbox переживает дни и недели без связи. В режиме «белых списков» это единственное, что работает: хостинг в РФ тут не помогает.
- **Идентификаторы.** UUIDv7 генерирует клиент: для сессий, устройств и операций outbox. Сервер проверяет, что это версия 7 и что метка времени не уходит в будущее больше чем на сутки.
- **Outbox в Dexie.** Каждая запись — `{op_id, kind, payload, created_at, tries, last_error}`. Отправка идёт при старте приложения, на событиях `online` и `visibilitychange→visible`, а также после окончания сессии. Пачками по 20, с экспоненциальной задержкой между повторами. На Background Sync не рассчитываем.
- **Порядок отправки сессии.**
  1. Реплей загружается в Storage по пути `replays/{uid}/{session_id}.bin` с `upsert:false`. Ответ 409 значит «уже загружен» и считается успехом.
  2. Затем вызывается `rpc('sync_push')`: внутри `insert … on conflict (id) do nothing` и `pgmq.send('verify')`. В ответе статус каждой операции: `accepted`, `duplicate` или `rejected:<код>`.
- **Классы данных.**
  - Сессии, ledger и события только добавляются, поэтому конфликтов у них нет.
  - `plan_state`, настройки и `notification_prefs` сверяются по `version`. Если версия не совпала, сервер возвращает текущую строку, и клиент применяет своё изменение заново поверх неё.
  - XP, gems, звёзды, уровень и лидерборды считает сервер. Клиент показывает их с пометкой «ожидает подтверждения».
- **Получение изменений.** `sync_pull(since)` отдаёт строки пользователя с `server_seq > since`. `server_seq` берётся из sequence и обновляется триггером на UPDATE. Курсор хранится в Dexie.
- **Офлайн-сессия без токена попытки.** Она получает статус `unranked`: попадает в историю, засчитывается в план и недельную цель. XP за неё начисляется с дневным потолком около 1,5 объёма плана, что совпадает с правилом безопасности. Если пользователь перед уходом в офлайн успел взять **офлайн-пакет** (5 подписанных попыток на 72 часа), такая сессия может попасть в рейтинг с пометкой «офлайн».

## 8. Лидерборды и античит

**Доски.** Ключ доски (`board_key`) бывает четырёх видов:
- `lvl:<level_id>@<ver>` — уровень;
- `trk:<track_id>:<diff>@<gen_ver>` — трек каталога;
- `fp:<fp_key>:<diff>@<gen_ver>` — свои треки, видны только друзьям и в вызовах;
- `daily:<date>` — «Планка дня» с общим seed.

Периодов два: за всё время (`all`) и ISO-неделя. Ничего не сбрасываем: каждая новая неделя получает новый ключ периода, а cron удаляет недели старше 8. Писать в доски может только `finalize_session` после проверки сессии:
`insert … on conflict (board_key, period, user_id) do update set best_score = excluded.best_score … where excluded.best_score > leaderboard_entries.best_score`.
Ранг считается как `count(*) where best_score > $mine` по индексу. В Ф2 для досок больше 10k строк cron раз в минуту пересобирает `leaderboard_top` (топ-100). Redis не понадобится, пока на доске меньше миллиона строк.

**Как проверяется сессия:**
1. **Токен попытки.** Edge `POST /attempts` проверяет JWT и лимит (не больше 30 попыток в час) и вызывает `issue_attempt` (строка в `private.attempts` плюс seed). Затем подписывает `{aid, uid, board, ver, seed, iat, exp}` HMAC-ключом из секретов Edge Functions. Ключ не попадает ни в БД, ни в дампы, ни в SQL-редактор Studio.
2. **Реплей сигнала управления**, а не landmarks. Заголовок, затем координаты `x,y` в int8 с частотой 30 Гц (дельта-кодирование), биты `present`, `form_ok`, `paused` и метки кадров. Сжимается через `CompressionStream('gzip')`, выходит 2–10 КБ в минуту. Биометрией такой сигнал не является.
3. **Функция `verify` в Edge.** Её запускают два пути. Раз в минуту pg_cron через `pg_net` вызывает её с секретом из Vault. Кроме того, после `sync_push` она сразу будится через `waitUntil`. Функция:
   - берёт пачку из pgmq;
   - проверяет HMAC и то, что попытка ещё не использована;
   - разбирает реплей zod-схемой;
   - **прогоняет `game-core`**.

   Три минуты на 30 Гц — это около 5 400 фиксированных шагов, то есть миллисекунды при лимите 2 с CPU. Счёт должен совпасть **точно**.
4. **Детерминизм.** Фиксированный шаг симуляции, генератор случайных чисел только от seed. В игровой логике никаких `Math.sin`, `Math.exp` или `Math.pow`: V8 и JavaScriptCore могут расходиться в последних битах, поэтому нужны таблицы или своя реализация. CI прогоняет одни и те же фикстуры в Node, Deno, Chromium и WebKit.
5. **Правдоподобие.** Пределы задаются в `levels.score_rules`:
   - очков в секунду не больше максимума уровня;
   - `active_ms` не больше `ended − started`;
   - сессия укладывается во временное окно попытки;
   - точность ритма на Hard не выше 99%;
   - смещение |Δx| за шаг не больше физического предела;
   - медианная реакция на ноту не меньше 120 мс и не постоянна;
   - дисперсия микродрожания выше порога;
   - не больше 20 рейтинговых сессий в день.
6. **Вердикт.**
   - `verified`: результат идёт в доску, ledger, недельную цель и вызовы, друзьям уходит broadcast.
   - `flagged`: сессия попадает в очередь ручной проверки в Studio (view `private.review_queue`).
   - `rejected`: сессия отклонена.

   При теневом бане пользователь видит свои записи, а остальные их не видят. Топ-10 каждой публичной доски проверяется вручную.

Честное ограничение: подделку самого сигнала (бот, который «рулит» вместо человека) так не поймать. Поэтому по умолчанию показываем лидерборд друзей. Публичный лидерборд — только с согласия пользователя (`lb_visibility`); для РФ нужно ещё отдельное согласие на распространение.

## 9. Музыка и битмапы

**Курируемый каталог (L0):**
1. **Загрузка.** Владелец кладёт исходник и доказательство лицензии (скриншот или PDF) в приватный bucket `ingest` и запускает `pnpm track:add` — CLI с secret key. CLI создаёт запись в `tracks` со статусом `ingest`, проверяет, что `license_code` входит в {CC0, PD, CC-BY, own, direct} (NC, ND и SA отсекаются), и ставит задачу `pgmq.send('analyze')`.
2. **analysis-worker** (Python в Docker) проходит по шагам:
   1. ffmpeg нормализует громкость до −14 LUFS и кодирует в AAC .m4a 128k (и, при желании, Opus);
   2. `fpcalc` (Chromaprint, LGPL) запускается отдельным процессом, плюс sha256 декодированного PCM;
   3. **Beat This!** (MIT) находит доли и сильные доли;
   4. librosa считает энергию и онсеты;
   5. секции выделяются по энергии и новизне (allin1 — только после юридической проверки его зависимостей madmom и demucs);
   6. выбираются лучшие окна на 30, 60 и 120 с;
   7. результат собирается в `AnalysisV1` (pydantic по той же JSON Schema).
3. **Публикация.**
   - Аудио уходит в R2 как `media/<sha>.m4a` (immutable, с CORS и Range). Для RU-ячейки — ещё и в российское объектное хранилище.
   - Анализ кладётся в Storage как `analyses/<fp_key>/<algo>.json.gz`, в `analyses` появляется строка с `source=server` и статусом `review`.
   - Владелец проигрывает трек, правит ручные карты (`charts`) и публикует.
4. **Почему не Edge Functions.** У них 256 МБ памяти, 2 с CPU и нет PyTorch и ffmpeg. Воркер подключается к БД через **session pooler Supavisor**: прямые подключения к Supabase идут только по IPv6, а у раннеров GitHub Actions IPv6 нет. Где запускать воркер, зависит от фазы: сначала локально, потом через `workflow_dispatch` в GitHub Actions, в Ф2 — на Fly machine с автоостановкой.

**Свои треки пользователя (L1):**
1. Файл остаётся в OPFS на устройстве.
2. Клиент считает sha256 декодированного PCM и chroma-simhash (rusty-chromaprint-wasm) и вызывает `rpc('lookup_analysis')`. Сначала ищется точное совпадение по sha, потом simhash с расстоянием Хэмминга не больше 6 среди треков той же длительности ±2 с.
3. Если анализа нет, он делается в браузерном воркере на MIT-трекере, и игра начинается сразу. Результат по желанию пользователя уходит в `submit-analysis`: проверка zod, не больше 256 КБ, `source=client`, `trust=low`. Серверный анализ всегда приоритетнее клиентского.
4. Чужой клиентский анализ только ускоряет старт. Испортить им можно лишь доски `fp:*`, а их видят только друзья.
5. Карту клиент генерирует из анализа детерминированно по `(generator_version, level, seed)`.

AcoustID бесплатен для некоммерческих проектов, и бесплатный Plank Run, возможно, под это подходит (н/п). Подключим в Ф2, если поиск по simhash будет часто промахиваться.

## 10. Realtime

- **Ф1.** Используем только **Broadcast из БД**: `realtime.send()` вызывается в `finalize_session` и в RPC дружбы и пишет в приватный канал `user:<uid>`. Так приходят события «сессия проверена», «друг побил твой рекорд», «новый вызов».
  - Postgres Changes не используем: они проверяют RLS для каждого подписчика и плохо масштабируются.
  - Сокет открывается только на социальных экранах.
  - Без Realtime всё работает через запрос изменений при возврате в приложение. Это важно для РФ, где WebSocket бывает нестабилен.
- **Ф3, дуэли.** Канал `duel:<id>`: Presence для лобби, Broadcast состояния на 10 Гц. Сервер не авторитетный: результат выносится после `verify` реплеев обоих игроков.
  - Одна дуэль — это 2 игрока × 10 Гц × 180 с, примерно 3 600 сообщений. В Pro входят 5 млн сообщений и 500 соединений, дальше около $2,50 за миллион (н/п).
  - Путь выхода — Centrifugo или свой WebSocket-сервер с тем же протоколом сообщений.

## 11. Push-уведомления

- **Ключи.** VAPID-ключи хранятся в секретах Edge Functions.
- **Отбор.** Каждые 15 минут pg_cron запускает SQL-запрос. Он находит пользователей, у которых одновременно:
  - `reminder_local_time` попадает в текущее окно по их часовому поясу (`tz`);
  - сегодня не было тренировки;
  - недельная цель не выполнена;
  - сейчас не тихие часы;
  - за сегодня ещё не было пуша (максимум один в день).

  Каждому найденному ставится задача `pgmq.send('push')`.
- **Отправка.** Edge `push-dispatch` отправляет пачками примерно по 200 через web-push в Deno: `npm:`-пакет или аналог из jsr (н/п). При ответе 404 или 410 подписка удаляется.
- **iOS.** Push работает только в установленной PWA. Разрешение просим после действия пользователя.
- **РФ.** Доставка через FCM там может деградировать, поэтому push не считаем критичным каналом.
- **Без тёмных паттернов.** Никаких сообщений вроде «ты всё потеряешь».

## 12. Админка и контент

- **Контент как код.** Игры, уровни 1–30, шаблоны плана, `score_rules` и предметы лежат в `content/*.yaml`. Команда `pnpm content:push` проверяет их через zod и через RPC `admin_upsert_content` создаёт **новые версии**; опубликованное никогда не меняется. Это работает одинаково для всех ячеек, изменения проходят ревью диффа, и их можно откатить.
- **Studio — для эксплуатации:** модерация ников, `review_queue`, поддержка пользователей, SQL-отчёты. Доступ только у владельца, с MFA. Studio работает с правами суперпользователя, поэтому другим людям его не даём.
- **Ф2.** Если появится второй редактор, ему откроется маршрут `/admin` в той же PWA: доступ по claim `app_role in ('admin','editor')` и под RLS. Отдельный бэкенд для админки не нужен.

## 13. Наблюдаемость и бэкапы

- **Встроено в Supabase:**
  - Logs Explorer (API, Auth, Postgres, Edge);
  - Query Performance (pg_stat_statements);
  - **Security и Performance Advisors**: выключенный RLS, view с `security definer`, нет индекса под FK или политику;
  - отчёты об использовании и spend cap.
- **Что добавляем сами:**
  - Sentry в PWA и Edge Functions, без персональных данных и через `tunnel`.
  - `GET /api/health` проверяет БД и глубину очередей pgmq; его опрашивает UptimeRobot.
  - Cron-функция `private.watchdog` раз в 5 минут смотрит возраст самого старого сообщения в очередях `verify` и `push` и долю `rejected`. При аномалии пишет владельцу в Telegram-бот.
  - Для RU-ячейки вместо Sentry — GlitchTip на той же VM.
- **Бэкапы:**
  - На Free бэкапов нет. Поэтому с первого дня каждую ночь делаем `supabase db dump` (роли, схема, данные) через пулер, шифруем age и кладём в R2.
  - На Pro есть ежедневные бэкапы за 7 дней, наш ночной дамп продолжаем.
  - PITR ($100 в месяц) включаем в Ф2, когда потеря данных за сутки станет болезненной.
  - **Объекты Storage в бэкап БД не входят.** Их каждую ночь копирует `rclone sync` с S3-эндпоинта Supabase в R2.
  - **Раз в месяц репетиция:** разворачиваем дамп в `supabase start` и прогоняем pgTAP и smoke-тесты. Это проверяет и бэкап, и путь выхода.

## 14. Чек-лист безопасности

- [ ] RLS включён на **каждой** таблице в `public`. CI падает, если в `pg_tables` есть `rowsecurity = false`. Advisors запускаются в CI (`supabase db lint`).
- [ ] Миграции делают `revoke all … from anon, authenticated` и выдают только необходимое. В доменные таблицы пишем только через RPC.
- [ ] У UPDATE-политик всегда есть `WITH CHECK`. На `profiles` права выданы по колонкам.
- [ ] Политики не читают `user_metadata`: его может менять сам пользователь. Роли берутся из custom access token hook.
- [ ] Функции `security definer` всегда:
  - объявлены с `set search_path = ''`;
  - проверяют `auth.uid()` первой строкой;
  - закрыты через `revoke execute … from public, anon`.

  View создаём с `security_invoker = true`.
- [ ] Есть индексы под `user_id` и под условия политик. В политиках пишем `(select auth.uid())`.
- [ ] Ключ `sb_secret_…` хранится только в секретах Edge Functions, воркера и GitHub Actions. CI ищет в собранном бандле `sb_secret_` и `eyJ`. В Vite нет переменных вида `VITE_*SECRET*`. Ключ ротируем раз в квартал и при любом подозрении.
- [ ] Ограничения нагрузки:
  - `statement_timeout` 5 с для `anon` и `authenticated`;
  - `max_rows = 500` в PostgREST;
  - rate limit в RPC (`private.rate_limits`);
  - лимиты Auth и hCaptcha.
- [ ] У bucket'ов задан `file_size_limit` (реплей 64 КБ, аватар 256 КБ) и список разрешённых MIME. По умолчанию bucket'ы приватные.
- [ ] pg_graphql выключен. На аккаунте Supabase включены MFA и spend cap, на GitHub — 2FA.
- [ ] CSP `connect-src` разрешает только `api.<домен>`, `media.<домен>` и tunnel Sentry.
- [ ] **pgTAP-тесты RLS** (`supabase test db`, хелперы basejump) с пользователями A, B и анонимом. Проверяем, что A не может:
  - читать сессии B;
  - менять себе xp;
  - писать в `leaderboard_entries`;
  - вызывать admin-RPC;
  - читать чужой реплей без дружбы;
  - публиковать уровень.

## 15. Приватность: экспорт и удаление

- **Экспорт.** Edge `GET /api/me/export` собирает JSON из `export_user(uid)` (все строки пользователя) и добавляет подписанные ссылки на реплеи. Локальные данные, включая анкету, выгружает сам клиент из IndexedDB.
- **Удаление.**
  1. RPC `request_account_deletion()` сразу ставит `deleted_at` и скрывает пользователя из досок.
  2. Затем Edge `purge-user` с secret key удаляет объекты `{uid}/*` через Storage API (не SQL-запросом к `storage.objects`).
  3. Потом вызывает `auth.admin.deleteUser`, и каскадные FK удаляют остальное.

  Из бэкапов данные исчезают по мере их ротации (7 дней); это прописано в политике конфиденциальности. Отдельно в приложении есть кнопка «стереть всё на устройстве».
- **Минимизация.**
  - В аналитике вместо ID пользователя псевдо-ID: HMAC(user_id, соль ячейки), без email.
  - IP не храним, кроме окна rate limit.
  - Реплеи хранятся 90 дней. Исключения: личные рекорды, призраки, вызовы и топы досок.
  - Есть журнал согласий с версиями документов.
  - Возрастной порог — 16+.

## 16. Тесты и CI/CD

```
supabase/
  config.toml · migrations/*.sql · seed.sql · tests/*.test.sql (pgTAP)
  functions/api (Hono) · functions/verify · functions/push · functions/_shared (копия shared + game-core)
packages/shared (zod) · packages/game-core · packages/api-client · workers/analysis (Python)
```

- **Локально.** `supabase start` поднимает весь стек вместе со Studio и Mailpit, дальше `supabase functions serve` и `pnpm dev`. Без интернета всё работает так же.
- **CI на каждый PR:**
  - проверка типов и тесты Vitest;
  - детерминизм `game-core` в Node, Deno и в Playwright (Chromium и WebKit);
  - `supabase db reset` и `supabase test db`;
  - `deno test` для функций против локального стека;
  - `db lint`;
  - линтер приватности схемы;
  - поиск секретов в бандле.
- **CD.**
  1. Изменения из main сначала уходят на staging. В Ф0 его нет; в Ф1 это постоянная ветка Supabase Branching, около $10 в месяц (н/п).
  2. Smoke-e2e на staging.
  3. После ручного подтверждения в prod уходят `supabase db push` и `functions deploy`.
  4. В RU-ячейку те же миграции применяются через `supabase db push --db-url`. Функции копируются через rsync в `volumes/functions`, после чего edge-runtime перезапускается.

  Миграции пишем только по схеме expand → backfill → contract. Каждую ночь проверяем, не разошлась ли схема прода с миграциями.
- **Preview-ветки на каждый PR** одному разработчику не нужны: хватает локального стека.

## 17. Путь выхода по шагам

**A. В self-hosted Supabase** (для RU- или UZ-ячейки, при санкционных проблемах или ради цены). Занимает 1–2 дня.
1. Поднять VM от 4 ГБ RAM и `supabase/docker` с **закреплёнными** версиями. Образы зеркалируем в свой реестр: Docker Hub из РФ работает ненадёжно.
2. Применить миграции. Восстановить `pg_dump` схем `public`, `private`, `analytics`, `auth` и `storage` на той же версии GoTrue. JWT-ключи можно перенести, а можно принудительно разлогинить всех.
3. Скопировать объекты Storage через `rclone`. Развернуть функции, задать секреты, SMTP и redirect-URL провайдеров входа.
4. Переключение:
   1. включить флаг `read_only` в `app_config`;
   2. снять финальный дамп с последними изменениями;
   3. сменить DNS `api.<домен>`;
   4. снять флаг.

   Простой — минуты. После переключения прогнать pgTAP и smoke-тесты.

**B. В «Postgres + свой API»** (Hono на Node, Better Auth и pg-boss из backend.md). Занимает 2–4 недели.
1. Код Edge Functions уже написан на Hono. Его собираем в Node-контейнер и заменяем `Deno.env` на `process.env`.
2. PostgREST заменяем роутами Hono. Каждый роут в транзакции выполняет `set local role authenticated; select set_config('request.jwt.claims', $1, true)` и вызывает **те же** SQL-функции. В обычном Postgres создаём заглушки `auth.uid()` и `auth.jwt()` поверх `current_setting('request.jwt.claims')`. RLS и RPC остаются без изменений.
3. Auth: `auth.users` и `auth.identities` переносим в таблицы Better Auth с теми же UUID и связками `provider/subject`. Паролей нет, поэтому пользователь просто входит заново кодом или через OAuth.
4. Storage переносим в S3 (R2 или Yandex) с теми же ключами `{uid}/…`. Подписанные URL выдаёт наш API.
5. pgmq заменяем на pg-boss или таблицу с `SKIP LOCKED`. pg_cron оставляем, если провайдер его поддерживает, иначе используем cron из pg-boss. Realtime заменяем на свои WebSocket-комнаты или Centrifugo.
6. В клиенте меняем реализацию `api-client` (интерфейсы те же), выпускаем новую версию и переключаем DNS.

## 18. Риски

| Риск | Вероятность / ущерб | Что делаем |
|---|---|---|
| Пауза Free-проекта, нет бэкапов | высокая в Ф0 / средний | ночной дамп с первого дня; Pro, как только друзья играют регулярно |
| Аудитория в РФ: нет региона, нельзя оплатить, 152-ФЗ и 149-ФЗ | высокая, если РФ / высокий | self-hosted RU-ячейка с Ф0, способы входа по ячейке, уведомление РКН |
| Вендор закроет доступ из РФ или аккаунт владельца по санкционным правилам (н/п) | низкая–средняя / высокий | отрепетированный выход A, свой домен, дамп у другого провайдера |
| Дыра в RLS | средняя / высокий | запись только через RPC, pgTAP, Advisors в CI, права на колонки |
| Утечка secret key | низкая / критический | ключ только в секретах, поиск по бандлу, ротация, на клиенте его нет |
| Дорогой PITR ($100) | — / средний | до Ф2 логические дампы; потеря до 24 часов данных — осознанный выбор |
| Лимиты Edge Functions (2 с CPU, 256 МБ) | средняя / средний | ML в Python-воркере; тяжёлые пачки делим; при росте Hono переезжает в Node-воркер |
| Отличия Deno от Node (web-push, crypto) | средняя / низкий | Web Crypto, `deno test`, запасной Node-воркер |
| Баг конвертации анонима через код | средняя / средний | e2e-тест, запасной путь `merge-guest` |
| Анонимы раздувают MAU | средняя / низкий | анонимный вход только при необходимости, очистка cron'ом, hCaptcha |
| Self-hosted Supabase тяжёлый (около 11 контейнеров, обновления) | высокая для RU / средний | выключить Analytics и imgproxy, закрепить версии, обновлять раз в квартал по чек-листу |
| Supabase поменяет цены | средняя / средний | ничего специфичного для Supabase в логике; выход B оценён |
| Отравление клиентских анализов | низкая / низкий | поле `trust`, приоритет серверных анализов, доски `fp:*` только для друзей |
| Детерминизм расходится между движками | средняя / средний | без трансцендентных функций; CI на четырёх рантаймах |

## 19. Что строить первым

1. **M0 (2–3 вечера).**
   - `supabase init` и локальный стек.
   - `api-client` с интерфейсами, Dexie и outbox; перенос истории из localStorage.
   - Первая миграция (`profiles`, `workout_sessions`, `devices`) с RLS и pgTAP-тестами; CI.
   - Проект Free во Frankfurt (или RU-VM по правилу из §3) и ночной дамп.
2. **M1 (неделя 1).** Анонимный вход при первом социальном действии и ник, `sync_push` и `sync_pull`, история на нескольких устройствах. Апгрейд до аккаунта через код на email (свой SMTP) и тест конвертации.
3. **M2 (неделя 2).** Контент как код (игры, уровни с версиями), `app_config`, кеш каталога в Service Worker. Стартовая оценка в онбординге → `plan_state`.
4. **M3 (неделя 3).** Друзья и инвайт-ссылки, лидерборд друзей (пока только с проверкой правдоподобия), broadcast «друг побил рекорд». → **Переход на Pro.**
5. **M4 (недели 4–5).** Детерминированный `game-core` выделяется в отдельный пакет. Формат реплея, Edge `attempts` и `verify`, pgmq и cron, статусы сессий, ledger для XP, звёзд и gems, недельные цели. Публичные доски открываем только после этого шага.
6. **M5 (недели 6–7).** Музыка: CLI `track:add`, Python-воркер, R2, таблицы `analyses` и `charts`. Ритм-игра работает на анализе. Свои треки: `lookup_analysis` и `submit-analysis`.
7. **M6 (неделя 8).** Вызовы и призраки (через подписанные ссылки на реплеи), web push.
8. **M7 (перед публичным запуском).**
   - Экспорт и удаление аккаунта, журнал согласий.
   - Проверка безопасности по §14.
   - Custom domain, Sentry, staging-ветка.
   - **Первая репетиция выхода A** в Selectel или Yandex Cloud.
   - Решение по региону: нужна ли RU-ячейка.
9. **Позже:** PITR (Ф2), `leaderboard_top`, дуэли на Realtime.

## Источники

- Исследования этого репозитория: backend.md, compliance.md, frontend.md, beatmap-audio.md, music-sources.md, progression.md, games.md.
- Supabase Edge Functions limits — https://supabase.com/docs/guides/functions/limits
- Supabase anonymous sign-ins — https://supabase.com/docs/guides/auth/auth-anonymous ; сообщение о баге конвертации через OTP — https://github.com/supabase/supabase/issues/25787
- Supabase API keys (старые `anon` и `service_role` выводятся из оборота к концу 2026 года) — https://supabase.com/docs/guides/api/api-keys
- Supabase self-hosting with Docker (минимум 4 ГБ RAM и 2 ядра) — https://supabase.com/docs/guides/self-hosting/docker
- Цены 2026 года (сторонние сводки, сверить с supabase.com/pricing) — https://makerkit.dev/blog/saas/supabase-pricing , https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/ , https://toolradar.com/blog/supabase-pricing-2026
