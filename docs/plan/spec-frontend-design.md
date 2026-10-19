# Plank Run: спецификация фронтенд-архитектуры и дизайн-системы

*Версия 1, 19.10.2026. Статус: к реализации. Основа: код прототипа (`index.html`, `js/*`, `test/*`) и `docs/research/{frontend,design,games,progression,beatmap-audio,backend,compliance}.md`. Файла `verify-frontend-design.md` на момент написания нет. Когда он появится, его поправки важнее этого текста. Версии пакетов сверены с реестром npm 19.10.2026.*

## 0. Ключевые решения

1. SPA на **React 19 + Vite 8 + TanStack Router**, без SSR. Игры и ML живут вне React: React только монтирует `<canvas>` и рисует меню и HUD.
2. Каждая ML-модель работает в **своём module worker** (`tasks-vision` 1.1.1, `forVisionTasks(path, true)`). Кадры передаются как `ImageBitmap` через transfer, в полёте не больше одного кадра. В главный поток приходит готовый `BodyFrame` размером около 100 байт.
3. Анализ планки (`js/plank.js`) переносится в TS без изменения чисел. Совпадение с прототипом проверяют golden-тесты.
4. Игры подключаются как плагины: **детерминированная симуляция** (`sim`, фиксированный шаг 60 Гц, seed, `dmath`, без DOM) отдельно от **вида** (`view`, Canvas2D или PixiJS). Квантованная запись ввода обслуживает реплеи, призраков и пересимуляцию на сервере.
5. Направление дизайна «**Неон + Искра**»: в игре всегда тёмная тема, шрифты Onest + Unbounded, состояние передаётся четырьмя каналами (цвет, форма, слово, звук), а размер HUD задаётся токеном `--view-scale` под расстояние до экрана.
6. Приложение работает **offline-first**: Workbox `injectManifest`, в precache только оболочка, WASM и модели лежат в версионированном Cache и скачиваются явно с прогрессом. Данные хранятся в IndexedDB (Dexie) и OPFS. Всё раздаётся с собственного origin, без сторонних CDN.
7. Миграция идёт по схеме «душитель» (strangler): прототип продолжает работать, сначала новые пакеты подключаются в старое приложение, потом рядом поднимается новая оболочка, и только затем происходит переключение.

## 1. Стек

| Слой | Выбор (версия) | Почему |
|---|---|---|
| Монорепо | pnpm 12.14 workspaces; turbo 2.11 позже | На старте одному разработчику хватит `pnpm -r` |
| Язык | TypeScript **6.0.3** (`strict`, `noUncheckedIndexedAccess`) | TS 7.0.2 (`tsgo`) подключаем только как быстрый typecheck в CI: часть инструментов ещё ходит в JS API компилятора |
| Линт и формат | Biome 2.5.15 | Один инструмент без ESLint. Правила `noRestrictedGlobals` и `noRestrictedImports` охраняют детерминизм и границы пакетов |
| Границы пакетов | dependency-cruiser 18.6 | Проверяет граф из §2 в CI |
| Сборка | Vite 8.3.4 + @vitejs/plugin-react 6.1.2, `worker.format: 'es'` | Rolldown, ленивые чанки игр и воркеров |
| UI | React 19.3.1 | Экосистема, Base UI, Motion, уверенная генерация кода ИИ |
| Роутинг | @tanstack/react-router 1.170 + router-plugin 1.168 (file-based, `autoCodeSplitting`) | Типизированные search-параметры (`?mode=side&game=tunnel`), каждый экран в своём чанке |
| Серверные данные | @tanstack/react-query 5.104 (+ persist-client) | Нужен с этапа аккаунтов. До бэкенда работает адаптер `LocalApi` |
| Клиентское состояние | Zustand 5.0.15 | Настройки, профиль устройства, снимок HUD (10 Гц). Покадровое состояние сюда **не** кладём |
| Локальная БД | Dexie 4.4.6 + dexie-react-hooks 4.4 (`useLiveQuery`); OPFS для аудио | Транзакции, миграции схем, реактивные запросы |
| Схемы | Zod 4.6.7 в `packages/shared` | Один контракт для клиента, API и пересимуляции |
| Стили | Tailwind CSS 4.3.3 (`@theme` из токенов) + CSS-переменные | Токены доступны и в CSS, и в canvas. Требует Safari 16.4+, это ниже нашего минимума |
| Headless-компоненты | @base-ui/react 1.9.0 | Доступные Dialog, Tabs, Slider, Switch, RadioGroup, Toast. Паттерны shadcn копируем, а не тянем |
| Анимация UI | motion 14.4 (`LazyMotion` + `domAnimation`, компонент `m`) | Пружины и layout-анимации. В играх только свои твины |
| Иконки | @phosphor-icons/react 2.1.10 (Bold и Fill), импорт поштучно | Хорошо читаются издалека |
| Шрифты | @fontsource-variable/onest 5.3.1, /unbounded 5.3.0 | OFL, свой хостинг, только подмножества latin, latin-ext, cyrillic, cyrillic-ext |
| i18n | @inlang/paraglide-js 2.29 + `Intl.*` | Сообщения компилируются в функции, лишнее вырезается tree-shaking, забытый ключ ломает сборку |
| ML | @mediapipe/tasks-vision **1.1.1** (сейчас 1.0.1) | Module wasm работает в воркере. Делегаты `CPU` и `GPU` |
| 2D-рендер | Canvas2D; pixi.js 8.22.0 для «Пульса» и «Титана» | Фильтры и батчинг нужны только тяжёлым играм |
| PWA | vite-plugin-pwa 2.0.0 (`injectManifest`), workbox 7.4.1 | Свой SW с явными маршрутами |
| Тесты | Vitest 5.0.5 (+ fake-indexeddb 6.2, fast-check 4.10), @playwright/test 1.64.1, @axe-core/playwright 4.14 | §9 |
| Ошибки | @sentry/react 11.8 → self-hosted GlitchTip в ячейке региона | Требование compliance.md: никаких сторонних сервисов для данных пользователей |
| Метрики | web-vitals 6.2 + свой `/telemetry` | §9.5 |

**Что не используем.** Next.js, Remix, Astro для приложения: SSR, RSC и гидрация ничего не дают камере и canvas, зато мешают офлайну. Лендинг можно сделать отдельной статикой. Phaser, Babylon и R3F: у нас уже свои ввод, звук и цикл, а R3F требует `react <19.4`. @pixi/react, потому что игра не живёт в дереве React. Redux, MobX и XState: автомат сессии из 7 состояний пишется руками и тестируется как чистая функция. Tone.js и howler: свой тонкий движок на Web Audio точнее и легче. Essentia.js (лицензия AGPL). GSAP (лицензия не open source). Rive и dotLottie подключаем, только когда появятся аниматор и бюджет. Runtime CSS-in-JS. MUI и Chakra. Google Fonts CDN, jsDelivr и storage.googleapis.com в рантайме. Firebase SDK. Никакой сторонней аналитики. `localStorage` для данных: допустим только загрузочный флаг темы.

## 2. Монорепо

```
apps/
  web/               SPA + PWA: маршруты, экраны, SessionRunner, SW (src/sw.ts)
  api/               заглушка: README + OpenAPI из zod-схем shared; реализация по backend.md (Hono + Postgres)
  legacy/            прототип как есть (статичный, до переключения)
packages/
  shared/            zod-схемы (Settings, SessionResult, InputRecording, Chart), id (UUIDv7), константы
  body-input/        камера, воркеры, провайдеры, анализаторы, калибровка, кэш моделей, бенчмарк
  game-core/         цикл с фиксированным шагом, rng, dmath, запись и реплей, автомат сессии, DDA, FlashLimiter
  games/fireflies    sim.ts + view.ts + manifest.ts
  games/tunnel
  games/starfall     (онбординг)
  games/pulse        (ритм, PixiJS)
  audio/             AudioEngine, шины, GameClock, SfxBank, VoiceCues, калибровка задержки
  beatmap/           формат chart/1, генератор, линтер, анализ BPM и онсетов (воркер)
  ui/                токены (tokens.json → CSS + TS), React-компоненты, Искра
  i18n/              сообщения ru/en/uz, проверка U+02BB, голосовые клипы по ключам
tools/
  synthetic-camera/  перенесённый test/: three.js-рендер планки → y4m + ground truth
  e2e/               Playwright-проекты
```

Пакеты внутренние, без своей сборки: `exports` указывает на `src/*.ts`, компилирует их Vite.

| Пакет | Может зависеть от | Запрещено |
|---|---|---|
| shared | zod | всё остальное |
| game-core | shared | DOM, React, `Math.random`, `Date`, `performance`, `Math.sin/cos/exp/pow/hypot` в `sim/` |
| games/* | game-core, shared; pixi.js только в `view.ts` | body-input, audio, React; DOM в `sim.ts` |
| body-input | shared, @mediapipe/tasks-vision | React, game-core, games |
| audio | shared | React, games |
| beatmap | shared, game-core (rng) | DOM (работает в воркере и в Node) |
| ui | react, @base-ui/react, motion, phosphor, i18n | body-input, games, audio |
| apps/web | всё | — |
| apps/api | shared, game-core, games/*/sim | ui, body-input, audio |

Главное правило: `sim.ts` каждой игры должен импортироваться в Node для серверной пересимуляции.

## 3. BodyInput

### 3.1 Конвейер

```
CameraManager (1 MediaStream на сеанс) → <video> ─rVFC(meta)─► FrameSource
  createImageBitmap(video) → postMessage({seq,tCapture,image},[image])   ≤1 кадр в полёте на воркер
VisionWorker[face|pose]: detectForVideo → image.close() → Analyzer (features → form → calibration → control)
  → {BodyFrame, actions, inferMs}  ──►  Provider (кольцевая история 2 с) → latest()/sampleAt()/events
```

### 3.2 CameraManager

- Один `getUserMedia({video:{facingMode:'user', width:{ideal:640}, height:{ideal:480}, frameRate:{ideal:30,max:30}}, audio:false})` на весь сеанс. Между калибровкой, игрой и повтором треки не останавливаем: в iOS до 17.2 это вызывало повторный запрос разрешения. Звук не запрашиваем никогда, иначе Web Audio приглушается, а AirPods переходят в режим гарнитуры.
- Слушаем `ended` и `mute` у трека → пауза сессии с причиной `camera` и попытка переподключиться.
- На ноутбуке есть выбор камеры (`enumerateDevices`), выбранное устройство запоминается.
- Ошибки камеры приводятся к кодам прототипа (`insecure | unsupported | denied | notfound | busy | unknown`) и показываются экраном с инструкцией для конкретной платформы.
- Превью зеркалим только через CSS. В анализ идёт сырой кадр, знак оси учитывается там же, где в прототипе.
- Через 60 с в фоне треки останавливаем (приватность, батарея), при возврате поток создаётся заново.

### 3.3 Кадры и backpressure

- Кадр забираем в `requestVideoFrameCallback`. `tCapture` берётся из `metadata.captureTime`, а если его нет, то `expectedDisplayTime − 1 кадр`. Поток без rVFC опрашиваем через rAF по `currentTime`, как в прототипе.
- Базовый путь: `createImageBitmap(video)` с transfer. `new VideoFrame(video)` с transfer включается флагом, только если бенчмарк показал выигрыш. `MediaStreamTrackProcessor` не используем: Chrome отдаёт его только в Window, Safari 18+ только в воркере.
- Backpressure: если воркер занят, кадр закрываем и считаем как `dropped`. Частоту инференса ограничивает уровень устройства (§8): лишние кадры пропускаем до `createImageBitmap`.
- У `performance.now()` воркера другой `timeOrigin`, поэтому при `init` передаём `clockOffset = performance.timeOrigin(main) − performance.timeOrigin(worker)`. Все `t*` в `BodyFrame` хранятся в шкале главного потока.

### 3.4 Воркеры

- `face.worker.ts` и `pose.worker.ts`, по одному WASM-экземпляру на каждый. Загрузчик вызывается с детерминированным query `?task=face|pose`, а в SW стоит `ignoreSearch`. Иначе вторая задача падает с `ModuleFactory not set.`
- Модели позы lite и full переключаются пересозданием задачи в том же воркере.
- Ошибка GPU-делегата при создании или на первом кадре → переход на CPU внутри воркера и событие `delegateChanged`. Это перенос `fallbackToCpu` из прототипа.
- Ошибки воркера (`error`, `messageerror`, `unhandledrejection`) пересылаются в главный поток и уходят в трекер ошибок без данных кадра.

```ts
type ToWorker =
  | { type: 'init'; model: ModelId; urls: ModelUrls; delegate: Delegate; analyzer: AnalyzerConfig; clockOffset: number }
  | { type: 'frame'; seq: number; tCapture: number; image: ImageBitmap | VideoFrame }
  | { type: 'recalibrate' } | { type: 'params'; params: Partial<AnalyzerParams> }
  | { type: 'bench'; durationMs: number } | { type: 'dispose' };
type FromWorker =
  | { type: 'ready'; delegate: Delegate; loadMs: number }
  | { type: 'result'; frame: BodyFrame; actions: BodyAction[]; inferMs: number; debug?: Float32Array }
  | { type: 'bench'; delegate: Delegate; p50: number; p95: number; errors: number }
  | { type: 'error'; fatal: boolean; code: string; message: string };
```

### 3.5 Провайдеры

| Kind | Источник | Оси | Техника | Назначение |
|---|---|---|---|---|
| `face` | BlazeFace, камера спереди | x, y | basic: лицо на месте, не упал, не встал | Основной режим |
| `pose` | Pose Landmarker lite или full, камера сбоку | y (качание), позже x | strict: провис, «домик», колени, упор | Строгая техника |
| `keyboard` | стрелки, пробел как срыв (демо прототипа) | x, y | имитация | Ноутбук, отладка |
| `pointer` | мышь или палец (`pointermove`) | x, y | всегда ок | Демо и доступность |
| `demo` | скриптованный бот с seed | x, y | по сценарию | Экран-витрина, превью игр, тесты |
| `replay` | `InputRecording` | как в записи | как в записи | Призраки, баг-репорты, e2e |

Провайдер выбирает `ProviderRegistry` по `manifest.needs`, режиму камеры и уровню устройства. Игры видят только интерфейс.

### 3.6 Анализаторы (перенос `js/plank.js`)

- `features/front.ts` (`faceFeatures`, `largestFace`) и `features/side.ts` (`sideFeatures`, `blend`, `belowLine`) переносятся без изменений.
- `form.ts` содержит `frontChecks/frontIssue` и `sideChecks/sideIssue` с объектом `THRESHOLDS`. Объект версионируется как `analyzerVersion: '1.0.0'`, тот же номер пишется в записи.
- `control.ts` содержит `CONTROL_RANGE`, чувствительность, One Euro (`minCutoff 1.2, beta 0.4`) и ограничение ±1,2.
- `debounce.ts`: `Debounced` (включение 0,25 с, выключение 0,45 с) и прощение потери детекции до 0,3 с.
- `calibration.ts`: удержание 1,5 с, разброс по последним 20 кадрам, медиана по последним 30, ограничение baseline для `hipDev` значениями [−0,05; 0,02].
- Новое, под флагами: медленный авто-центр против дрейфа (постоянная около 20 с, не работает во время движения), индекс дрожания J в полосе 1–5 Гц для флага усталости, детектор `pulse` (рывок больше порога за 300–500 мс) для ритм-игры, `still` для нот-зарядов.
- Анализатор — чистый TS. Один и тот же код работает в воркере, в Vitest и в Node.

### 3.7 Нормализованный сигнал

```ts
export type FormIssue = 'lost'|'noFace'|'notVisible'|'tooFar'|'moved'|'standing'|'lying'|'noSupport'|'sag'|'pike'|'knees';
export type FormState = 'unknown' | 'ok' | 'warn' | 'broken';
export interface BodyFrame {
  seq: number; tCapture: number; tResult: number;   // мс, шкала performance.now() главного потока
  present: boolean; confidence: number;              // 0..1
  axes: { x: number; y: number };                    // −1..1 (до ±1,2 при перелёте), 0 до калибровки
  form: { state: FormState; issue: FormIssue | null; checks: Partial<Record<CheckId, boolean>> };
  calib: { state: 'none' | 'collecting' | 'done'; progress: number };
  metrics?: Record<string, number>;                  // только debug и телеметрия
}
export type BodyAction =
  | { type: 'calibrated' } | { type: 'formBroken'; issue: FormIssue } | { type: 'formRestored' }
  | { type: 'lost' } | { type: 'found' } | { type: 'still'; ms: number }
  | { type: 'pulse'; dir: 'left'|'right'|'up'|'down'; tCapture: number };
export interface ProviderCaps { axes: ('x'|'y')[]; formCheck: 'none'|'basic'|'strict'; actions: BodyAction['type'][]; typicalLatencyMs: number }
export interface BodyInputProvider {
  readonly kind: ProviderKind; readonly caps: ProviderCaps;
  init(o: { stream?: MediaStream; mode: CameraMode; signal: AbortSignal; onProgress?(p: LoadProgress): void }): Promise<void>;
  start(): void; stop(): void; dispose(): void;
  recalibrate(): void; setParams(p: Partial<AnalyzerParams>): void;   // sensitivity, kneePlank, axis
  latest(): BodyFrame | null;                     // pull: игровой тик
  sampleAt(tCapture: number): BodyFrame | null;   // история 2 с: судейство ритма
  on<K extends keyof ProviderEvents>(k: K, cb: ProviderEvents[K]): () => void;   // frame | action | stats
  stats(): PipelineStats;                          // fps, inferP50/P95, drops, delegate, e2eMs
}
```

`warn` — новое состояние между `ok` и `broken`. Оно включается, когда сырая проблема уже есть, а дебаунс ещё держит «ок», или когда метрика дошла до 70% порога (`hipDev` к `sag` и т. п.). Это даёт янтарное предупреждение до паузы.

### 3.8 Калибровка

Состояния: `searching` (нет человека) → `positioning` (чек-лист из прототипа: лицо и расстояние спереди; тело в кадре, горизонт, упор, ноги, линия сбоку) → `holding` (кольцо 1,5 с) → `done`. Перекалибровка доступна в любой момент: клавиша R, пункт меню паузы, голосовая подсказка «вернись на место» после трёх `moved` подряд. Позже для «Высоты» и «Пульса» добавляется калибровка диапазона: «качнись влево и вправо», амплитуда записывается как `CONTROL_RANGE` пользователя. Результат калибровки не сохраняется между сессиями: поза каждый раз другая. Сохраняются только диапазоны.

### 3.9 Задержка

На каждом кадре измеряем `queueMs` (захват → отправка), `inferMs`, `analyzeMs`, `captureToResult` и `resultToPresent` (следующий rAF). Сумма — оценка «движение → экран». Её видно в отладочной панели (`?debug`, клавиша D, как в прототипе), она уходит в телеметрию как p50 и p95 за сессию и используется как сдвиг окна судейства в ритм-игре. В e2e задержку меряем по ступенькам сценария: время от смены сегмента до пересечения осью 50% амплитуды.

### 3.10 Бенчмарк и откат

- Бенчмарк запускается при первом входе в режим, а также при смене версии ML или UA. Длится 2 с на CPU, затем 2 с на GPU, если есть WebGL2 в OffscreenCanvas и рендерер не SwiftShader. Используются живые кадры, а без разрешения на камеру — встроенный тестовый кадр.
- GPU выбираем, только если его p50 меньше 0,8 × p50 CPU и не было ошибок. Профиль `{uaHash, mlVersion, model, delegate, p50, p95, tier}` сохраняется в IDB.
- Сторож во время игры: если p95 инференса больше бюджета уровня 5 с подряд, качество снижается по шагам: full → lite → частота инференса 30 → 20 → 15 Гц → камера 480×360 → предложение «режим спереди» для боковой камеры. Сначала проверяем, не перешёл ли воркер на CPU сам.

### 3.11 Модели и кэш

- Файлы раздаются с нашего origin: `/ml/tasks-vision@1.1.1/vision_wasm_module_internal.{js,wasm}`, `/ml/models/<name>.<sha8>.{task,tflite}`. Во время сборки генерируется `ml-manifest.json` (url, байты, sha256). CDN-откат прототипа остаётся только как dev-флаг `?cdn`.
- `ModelStore.ensure(['wasm','face'])` скачивает файлы потоком через `fetch` и `ReadableStream`, прогресс считает по байтам из манифеста, проверяет sha256 (`crypto.subtle`) и кладёт результат в Cache `ml-1.1.1`. Воркер запрашивает те же URL и получает их из SW (CacheFirst).
- Интерфейс: карточка «Скачиваем модель позы: 3,1 из 5,8 МБ», кнопка отмены, предупреждение при `saveData` или сотовой сети. После загрузки показывается значок «Работает без интернета».
- Режим спереди требует WASM и лицо (около 4,1 МБ gzip), боковой ещё и позу lite (около 9 МБ). Полная модель скачивается только по запросу и только на уровне A. Старые кэши `ml-*` удаляются в `activate`.

## 4. API игровых плагинов

### 4.1 Цикл и жизненный цикл

`SessionRunner` из `game-core` владеет автоматом сессии: `setup → calibrating → countdown(3 с) → active ⇄ formPaused(≤4 с) ⇄ rest → ended`, плюс пауза `hidden | interrupted | camera | user`. Константы прототипа сохраняются: `END_AFTER 4`, отсчёт 3, вехи каждые 15 с, «ещё десять секунд». Интервалы работы и отдыха задаёт планировщик прогрессии.

Цикл: `rAF → accumulator += frameMs; while (acc ≥ 16,667 && steps < 5) { input = sampleInput(tick); sim.step(input, tick); dispatch(sim.events()); tick++ } view.render(acc/16,667)`. Если шагов больше пяти, отставание сбрасывается, а не накапливается. HUD снимается в Zustand с частотой 10 Гц.

Жизненный цикл плагина: `manifest.load()` → `createSim(seed, params, world)` → `createView(sim, ctx)` → `view.preload()` → `sim.onPhase('warmup'|'active'|'paused'|'rest')` → шаги → `summary()` → `dispose()`. Пока сессия не активна, симуляция не продвигается. Вид продолжает анимировать курсор, который следует за вводом: так в прототипе работает `update(dt, false)`.

### 4.2 Детерминизм

- `createRng(seed)` реализован на sfc32 с инициализацией через cyrb128 от строки. Отдельные потоки: `rng.fork('spawn')`, `rng.fork('wander')`. Частицы и тряска во `view` берут свой `renderRng`, который на счёт не влияет.
- `Math.sin/cos/exp/pow/hypot` в V8 и JavaScriptCore могут расходиться в последнем бите, а серверная пересимуляция идёт в Node. Поэтому в `sim` используется `dmath`: полиномы и таблицы только на `+ − × ÷` и `Math.sqrt` (у него корректное округление). Запрет закреплён правилом Biome.
- Ввод квантуется: `q = round(clamp(v, −1, 1) × 127)`, и симуляция **в живой игре** читает `q/127`. Ввод снимается с частотой 30 Гц: на чётном тике берётся `latest()`, на нечётном значение повторяется. Поэтому живая игра и реплей совпадают бит в бит.
- Координаты мира не зависят от экрана: поле нормировано, а соотношение сторон фиксируется в `WorldSpec` при старте.

### 4.3 Интерфейсы

```ts
export interface GameManifest<P> {
  id: string; version: string; titleKey: MessageKey; hintKey: Partial<Record<CameraMode, MessageKey>>;
  cameraModes: CameraMode[]; renderer: 'canvas2d' | 'pixi';
  needs: { axes: ('x'|'y')[]; formCheck?: 'basic'|'strict'; music?: boolean; actions?: BodyAction['type'][] };
  params: z.ZodType<P>;  defaults: (level: number) => P;
  load(): Promise<GameModule<P>>;              // import() → отдельный чанк
}
export interface GameModule<P> {
  createSim(seed: string, params: P, world: WorldSpec): GameSim;
  createView(sim: Readonly<GameSim>, ctx: ViewContext): GameView;
}
export interface SimInput { x: number; y: number; flags: number; actions: number }  // x,y = q/127
export interface GameSim {
  step(input: SimInput, tick: number): void;   // dt = 1/60 с
  onPhase(p: SimPhase): void;                   // при 'active' после паузы: правило «ничего не исчезает сразу»
  events(): readonly GameEvent[];               // { kind:'catch'|'pass'|'hit'|'coin'|'judge'…, sfx?: SfxId, at?, data }
  hud(): HudModel; summary(): GameSummary; hash(): number;
}
export interface ViewContext {
  canvas: HTMLCanvasElement; theme: ThemeTokens; reducedMotion: boolean; viewScale: number;
  safeRect: Rect;                               // область без HUD
  flash: FlashLimiter; renderRng: () => number; clock: GameClock;
}
export interface GameView {
  preload(): Promise<void>; resize(w: number, h: number, dpr: number, safe: Rect): void;
  render(alpha: number, frameMs: number): void; onEvent(e: GameEvent): void; dispose(): void;
}
export interface HudModel { stats: [HudStat, HudStat?]; combo?: number; judge?: { kind: Judge; seq: number }; ring?: number }
export interface GameSummary { score: number; bestCombo: number; successRate: number; accuracy?: number;
  stats: { key: string; value: number; labelKey: MessageKey; format: 'int'|'pct'|'ratio' }[] }
```

### 4.4 Запись ввода (`inrec/1`)

```ts
export interface InputRecording {
  format: 'inrec/1'; id: string; gameId: string; gameVersion: string; coreVersion: string; analyzerVersion: string;
  seed: string; paramsHash: string; tickHz: 60; inputHz: 30; provider: ProviderKind; mode: CameraMode;
  axes: Int8Array;          // x0,y0,x1,y1… (30 Гц)
  flags: Uint8Array;        // bit0 present, bit1 formOk, bit2 warn, bit3 active, bit4 rest
  actions: Array<{ tick: number; code: number }>;
  checkpoints: Array<{ tick: number; hash: number }>;   // каждые 300 тиков: поиск расхождения
  final: { score: number; hash: number };
}
```

Сериализуется в бинарный контейнер и сжимается `CompressionStream('gzip')`: около 90 Б/с в сыром виде, около 2–3 КБ на минуту после сжатия. Записи лежат в IDB и используются для призраков (вторая `sim` с тем же seed рисуется полупрозрачно), для баг-репортов (`?provider=replay&rec=…`) и для отправки на сервер вместе с итогом сессии. Точки тела (landmarks) никогда не записываются.

### 4.5 HUD и итоги

Главную цифру (время в хорошей технике) рисует **оболочка**, а не игра: это общий фитнес-контракт. Игра отдаёт не больше двух показателей, комбо и метку оценки. HUD собран в DOM поверх canvas: так текст чёткий, доступен для скринридера и масштабируется через `--view-scale`. Игра не рисует в `safeRect`-исключениях. Итог = `GameSummary` + метрики оболочки (`held`, `formPct`, `breaks`, `reason`), всё это валидирует `SessionResultSchema` из `shared`.

### 4.6 Сложность

Оси две (progression.md §9). Физическую задаёт планировщик: интервалы работы и отдыха, вариация, `maxShiftsPerMin` (12, 20 или 30 по уровню). Игровую задают `params` манифеста (скорость, плотность, ширина ворот, окно попадания). `DdaController` из `game-core` держит успех в пределах 65–85% по скользящему окну из 20 событий (`successRate` из событий игры), шаг ±5%. Первые 30 с интервала он не вмешивается, а при флаге усталости замирает. Если промах совпал с `warn` или `broken`, событие в окно не идёт.

### 4.7 Звук

Игры не трогают Web Audio: событие несёт `sfx` и `at: 'now' | 'beat'`, а `AudioEngine` проигрывает токен звука (§6.8) со стерео-панорамой по позиции. Ритм-игра получает `GameClock` (время песни через `AudioContext`, `outputLatency`, калибровку) и сетку долей. Её тик идёт по времени песни, а ввод берётся через `sampleAt(tCapture)` со сдвигом на измеренную задержку. В запись попадают уже выровненные отсчёты, поэтому детерминизм сохраняется. Голосовые подсказки выдаёт только оболочка.

### 4.8 Перенос Fireflies и Tunnel

| Что в прототипе | Как в новой архитектуре |
|---|---|
| `update(dt, running)` с переменным dt | `sim.step` 60 Гц + `onPhase` |
| `Math.random` в `spawn` и блуждании (`heading`) | `rng.fork(...)` |
| `Math.exp` в сглаживании игрока, `Math.hypot`, `cos/sin` | `dmath` |
| **Светлячки: столкновение в пикселях** (`toScreen`, `jarRadius` = clamp(…, 30, 80) px) — счёт зависит от размера экрана | Радиус банки и проверки в мировых единицах. Минимальный размер 30 px остаётся только визуальным |
| `burst()` частиц внутри симуляции | `view.onEvent` + `renderRng` |
| `onEvent('catch'…)` → `sound.chime` | `GameEvent{sfx:'game.catch', data:{combo,type}}` |
| `hudStats()`, `summary()` массивами строк | `HudModel`, `GameSummary` с ключами i18n |
| `setDifficultyHorizon(s)` | `params.horizonSec` из планировщика |
| `resume()` (светлячки живут ещё 1,5 с, ворота не ближе d=0,5) | обработка `onPhase('active')` после паузы |
| `hint(camera)` | `manifest.hintKey` |
| `COLORS` из `main.js`, `shadowBlur` | `ctx.theme`, свечение заранее отрисовано в спрайты (offscreen canvas при `resize`) |

Приёмка: бот `fireflies-bot` и сценарии e2e дают сопоставимый счёт. Тест детерминизма: 10 seed × 3 записи, хэш совпадает в Chromium, WebKit и Node.

### 4.9 Рендер по играм

Canvas2D: «Светлячки», «Тоннель», «Звездопад», «Высота». PixiJS v8 с `preference: 'webgl'`: «Пульс» (дорожки, рельсы, частицы в бит), «Титан». WebGPU включаем только после тестов на устройствах. Для всех: DPR не больше 2 (1,5 на уровне B, 1 на уровне C), никаких аллокаций в горячем цикле, обработка `webglcontextlost`. Рендер в OffscreenCanvas в воркере пока не делаем: ввод и звук живут в главном потоке, выигрыш не доказан.

## 5. Экраны и навигация

| Маршрут | Экран | Телефон, портрет | Телефон, альбом | Ноутбук |
|---|---|---|---|---|
| `/onboarding/*` | Приватность → камера (картинки) → анкета Э1–Э6 → калибровка → «Звездопад» (20 с, учит рулить) → «твой план» | Один вопрос на экран, ответы-карточки ≥64 px, прогресс сверху | Вопрос слева, ответы справа | Колонка 560 px |
| `/` (путь) | Карта пути, «Играть», неделя 3/7, «Искра» | Вертикальная дорожка узлов, «Играть» в зоне большого пальца | Карта слева, «сегодня» справа | Карта + панель «сегодня» и «друзья» |
| `/games` | Выбор игры | Карточки 16:9 с превью `demo`-провайдера, значки «спереди/сбоку» | 2 колонки | 3 колонки, стрелки + Enter |
| `/music` | Библиотека / Мои файлы | Строка: обложка, BPM, длина, сложность ●●○, превью по тапу; «файл остаётся на устройстве» | — | Перетаскивание файла |
| `/setup` | Камера, загрузка модели, калибровка | Превью с силуэтом, чек-лист ●/▲, кольцо удержания | Боковой режим: превью на весь экран, голос | Крупное превью по центру |
| `/session/$id` | Игровой HUD, предупреждение, пауза, отдых | Таймер сверху, полоса статуса по краю | Таймер слева, поле по центру | Сцена 16:9, `--view-scale` 1,5–2 |
| `/results/$id` | Итоги | Цифра времени, 3 метрики, звёзды, «Как было?» (3 кнопки), «Ещё раз» на всю ширину | 2 колонки | 2 колонки |
| `/me` | Прогресс: тепловая карта, график, значки | 1 колонка | 2 колонки | 2 колонки |
| `/friends` | Друзья / Лига, kudos | Вкладки | — | Таблица |
| `/settings/*` | Голос, звук, тема, меньше движения, крупный режим, камера, язык, приватность, «стереть всё», хранилище | Список | — | Две панели |
| `/_dev/*` | Галерея компонентов, отладка конвейера | Только в dev-сборке и тестах | | |

**Брейкпоинты:** compact < 600, medium 600–1024, expanded > 1024. Ориентацию учитываем через `@media (orientation)`, карточки адаптируем через container queries. Учитываем safe-area (`viewport-fit=cover`).

**Сессия без рук.**
- После калибровки игра стартует сама. Отсчёт идёт голосом и звуком.
- Срыв техники → автопауза, возврат в позу → автопродолжение. Срыв дольше 4 с завершает интервал.
- Внутри сессии меню выбирается задержкой: курсор-корпус держим на кнопке 1,2 с, вокруг заполняется кольцо (`DwellButton`). Так выбирают «ещё подход» и «закончить».
- На ноутбуке работают клавиши Space (пауза), Esc (закончить), R, D и C (как в прототипе). В сессии нет кнопок мельче 64 px.
- На экране итогов главное зачитывается голосом. Обновления и предложение установки во время сессии не показываются.

**Голос.** Каталог `VoiceCue` (ключи `voice.*`, тексты из `VOICE` прототипа) с приоритетами: безопасность > техника > старт и отсчёт > вехи > похвала. Одна фраза не чаще чем раз в 2,5 с, повтор той же фразы не чаще раза в 4 с, фраза с высшим приоритетом прерывает текущую. На время голоса музыка приглушается на 9 дБ. В каждом интервале звучит «Дыши ровно, не задерживай дыхание». Источник — заранее записанные клипы (ru, затем uz и en), а `speechSynthesis` служит запасным вариантом. Каждая фраза дублируется субтитром в HUD.

**Читаемость на расстоянии** (design.md §2):

| Режим | `--view-scale` | Что видно |
|---|---|---|
| Телефон спереди, около 0,7 м | 1 | Подписи от 28 px, значения 56, главная цифра 104 |
| Ноутбук спереди, 1–1,5 м | 1,5–2 | То же, умноженное на масштаб |
| Сбоку, около 3 м | 4 | Только главная цифра и цветная полоса со знаком, всё остальное голосом. Телефон в этом режиме предупреждает: «Экран далеко — слушай подсказки» |

Правила: один главный объект на экране, подписи в регистре предложения из 1–3 слов, табличные цифры, без миллисекунд. У новичка не больше трёх типов объектов на поле одновременно.

## 6. Дизайн-система

### 6.1 Направление

«Неон + Искра»: тёмный неон прототипа для игр и бренда, тепло маскота на метаэкранах, дисциплина Fitness+ в HUD (одна цифра и кольцо).

### 6.2 Палитра (контраст по WCAG, пересчитан)

| Токен | Hex | Роль и контраст |
|---|---|---|
| `bg` / `bg-raised` | #0B0D17 / #12152A | Фон |
| `surface` / `surface-2` | #161A33 / #1E2347 | Карточки и поднятые поверхности |
| `text` | #F2F4FF | 17,7:1 на bg, 13,8:1 на surface-2 |
| `text-muted` | #A3A9D1 | 8,4:1 на bg, 6,6:1 на surface-2 |
| `line` / `line-strong` | #2E3566 / #6E78C2 | Декор 1,5:1 / границы контролов 4,2:1 (≥3:1 по 1.4.11) |
| `brand` / `brand-text` | #7C6CFF / #A397FF | Заливка: на ней пишем тёмным (5,0:1), белый даёт только 3,9:1. Текст 7,8:1 |
| `accent` (= `ok`) | #5EF2C2 | Главная кнопка, тёмный текст на ней 13,8:1 |
| `warn` | #FFB547 | 11,0:1 |
| `bad` | #FF5D7A | 6,6:1 на bg, 5,8:1 на surface |
| `info` / `coin` | #4CC9FF / #FFD25E | 10,2 / 13,5:1 |
| Светлая тема (только меню) | bg #F6F5FF, text #12152A (16,7), muted #5A5F85 (5,7), brand-text #5B4BE0 (5,5), ok #0E7A5A (4,9), warn #8A5300 (5,9), bad #C2304F (5,1) | |

Важно: `ok` и `warn` почти не различаются по светлоте (1,25:1) и при дейтеранопии сливаются. Поэтому **форма обязательна**: ● норма, ▲ внимание, ✕ срыв. К форме добавляются слово и звук: «динь», голос, голос с тонировкой экрана. Состояния HUD проверяются на снимках с эмуляцией дальтонизма (§9.3).

### 6.3 Типографика

Onest используется для интерфейса: это единственный из проверенных шрифтов с полным узбекским покрытием (U+02BB, Ғ Қ Ҳ). Unbounded используется для заголовков и цифр. У Unbounded нет Ғ Қ Ҳ, поэтому стек такой: `"Unbounded", "Onest", system-ui`, а для `:lang(uz-Cyrl)` заголовки целиком набираются Onest. Предзагружаем два woff2 (Onest и Unbounded, подмножество cyrillic). Для запасного шрифта задаём `size-adjust`, `ascent-override` и `descent-override`, чтобы таймер не прыгал. В интерфейсе Unbounded не набираем заглавными: широкий шрифт не уместит «ПЕРЕКАЛИБРОВАТЬ». В i18n стоит линтер, который заменяет `'` и `‘` в узбекском тексте на U+02BB.

Шкала меню: 12 / 14 / 16 / 20 / 24 / 32 / 40 / 56 (`clamp` для h1 и h2). Шкала HUD: 28 / 56 / 104 × `--view-scale`.

### 6.4 Токены

```css
@theme {
  --spacing: 4px;                                   /* 4 8 12 16 24 32 48 64 */
  --radius-sm: 10px; --radius: 16px; --radius-lg: 28px; --radius-pill: 999px;
  --font-display: "Unbounded", "Onest", system-ui, sans-serif;
  --font-ui: "Onest", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
:root {
  --view-scale: 1; --tap: 56px; --tap-primary: 64px; --dwell-ms: 1200ms;
  --hud-label: calc(28px * var(--view-scale)); --hud-value: calc(56px * var(--view-scale)); --hud-hero: calc(104px * var(--view-scale));
  --elev-0: var(--bg); --elev-1: var(--surface); --elev-2: var(--surface-2);   /* в тёмной теме глубина передаётся светлотой, не тенью */
  --focus-ring: 0 0 0 3px var(--bg), 0 0 0 5px var(--brand-text);
  --dur-1: 120ms; --dur-2: 220ms; --dur-3: 420ms;
  --ease-out: cubic-bezier(.2,.8,.2,1); --ease-back: cubic-bezier(.34,1.56,.64,1);
  --spring-ui: 400 30;  /* stiffness damping для Motion */ --spring-mascot: 260 14;
  --tint-bad: rgb(255 93 122 / .20); --glow-ok: 0 0 24px rgb(94 242 194 / .45);
}
@media (prefers-reduced-motion: reduce) { :root { --dur-2: 0ms; --dur-3: 0ms; --glow-ok: none; } }
@media (prefers-contrast: more) { :root { --text-muted: #D5D9F5; --line: #6E78C2; } }
```

Источник правды — `packages/ui/tokens.json`. Из него генерируются `tokens.css` (`@theme` и `:root`) и `tokens.ts` для canvas (`ViewContext.theme`). Отдельные цвета в коде игр запрещены.

### 6.5 Компоненты

- **Базовые:** Button (primary, secondary, ghost, danger; размеры 48, 56, 64), IconButton, Card, ChoiceCard (с иллюстрацией, как в прототипе), Segmented, Toggle, Slider, Tabs, Sheet и Dialog, Toast, Badge, Avatar, Skeleton, EmptyState, ProgressBar, ProgressRing.
- **Предметные:** HeroTimer (кольцо толщиной 9% диаметра), StatusBand (полоса по краю: цвет, знак, слово), FormAlert (полноэкранная тонировка и кольцо отсчёта), CountdownRing, DwellButton, CalibrationChecklist, CameraPreview (зеркальное, с силуэтом-гидом), ModelDownloadCard, PermissionCard, PathMap и PathNode (SVG), GameCard, TrackRow, StarRating, RpeButtons, StreakWeek, LeaderboardRow, KudosButton, VoiceCaption, InstallSheet, UpdateToast.

### 6.6 Искра

Компонент `<Iskra mood size skin />` на SVG + Motion. Это шар с глазами, у которого есть параметры: форма век, сжатие (squash), цвет свечения (`ok`, `warn`, `bad`) и зрачки, следящие за курсором. Состояния: `idle`, `cheer`, `worry`, `sad`, `celebrate`, `sleep`, `rest-breathe`. Та же параметрическая модель отрисовывается на canvas (`drawIskra(ctx, params)`), поэтому шар в «Тоннеле» и курсор в «Пульсе» — это и есть Искра. Скины задаются параметрами из `shared`. Rive может прийти позже за тем же интерфейсом `mood`. В режиме reduced motion анимации заменяются сменой поз без движения.

### 6.7 Иконки и доступность

- Иконки Phosphor Bold, а Fill для активных состояний. Размеры 24 и 32 в меню, 48+ в сессии. Знаки ●▲✕ рисуются своими SVG, а не символами шрифта.
- Ориентир — WCAG 2.2 AA. Контраст из §6.2, цвет никогда не единственный канал (1.4.1). Цели касания не меньше 56 px, у главной 64 (запас к 2.5.8). Видимый фокус (`--focus-ring`, 2.4.7, 2.4.11). Весь интерфейс доступен с клавиатуры.
- Скринридер: HUD объявляется через `aria-live="polite"` не чаще раза в 5 с, срыв техники — через `assertive` один раз. У меню нет лимитов времени. Атрибут `lang` переключается вместе с языком.
- Вспышки: `FlashLimiter` пропускает не больше 3 вспышек в секунду (2.3.1), полноэкранные красные вспышки запрещены, пульс в такт идёт только на малой площади. Настройка «Без вспышек» отключает его совсем.
- `prefers-reduced-motion` убирает тряску, параллакс, частицы и конфетти, а смысловые анимации остаются (кольцо и смена состояния). Отдельный переключатель «Меньше движения» действует поверх системного.

### 6.8 Звуковые токены

| Токен | Характер | Когда |
|---|---|---|
| `ui.tap` / `ui.confirm` | Короткий клик / двойной тон | Меню |
| `state.ok` | «Динь» 1046 Гц | Возврат техники, старт |
| `state.warn` | Два тона 440 → 330 Гц | `warn` / `broken` (из `Sound.warn`) |
| `count.tick` / `count.go` | 880 / 1046 Гц | Отсчёт, вехи |
| `game.catch` | Пентатоника вверх по комбо | Светлячки, ноты |
| `game.coin` / `game.hit` | Square-трель / пила вниз | Тоннель |
| `goal.reached` | Арпеджио | Цель |

Шины: `music`, `sfx`, `voice`, общий лимитер. Громкость токенов нормирована. Синтезированные тоны прототипа переносятся в `SfxBank` как есть, файлы-сэмплы допустимы. Вибрацию не используем: телефон лежит на полу.

### 6.9 Темы

Сессия всегда тёмная (`data-theme="dark"` на `/session`). Меню следуют системной теме, есть ручное переключение. Тема сохраняется в загрузочном флаге в `localStorage`, чтобы не было вспышки при загрузке. `theme-color` меняется вместе с темой.

## 7. PWA и офлайн

- **Сервис-воркер** (`src/sw.ts`, Workbox 7.4):
  - precache: HTML, JS/CSS-чанки, шрифты, иконки, звуки. Навигация отдаётся из precache (`createHandlerBoundToURL`).
  - `/ml/**`: CacheFirst в `ml-<версия>`, `ignoreSearch`.
  - `/content/*.json` (каталог, уровни, чарты по хэшу): StaleWhileRevalidate.
  - `/music/library/*`: CacheFirst, но только после явного «скачать для офлайна».
  - `/api/**`: NetworkOnly, офлайн обслуживают Query и outbox.
  - `config.json`: NetworkFirst с таймаутом 3 с.
- **Хранилище:**
  - Dexie: `settings`, `deviceProfile`, `profile`, `plan`, `progress`, `sessions` (неизменяемые, UUIDv7), `recordings`, `outbox`, `tracks` (метаданные), `analyses`, `charts`, `health`. Таблица `health` хранится только на устройстве и никогда не синхронизируется.
  - Пользовательские треки лежат в OPFS: запись через `createSyncAccessHandle` в воркере, а при `createWritable` (Safari 26+) напрямую. Если OPFS нет, файл хранится как Blob в IDB.
  - В настройках показываем `storage.estimate()` и кнопку «Стереть всё на устройстве».
- **`navigator.storage.persist()`** вызываем после первой завершённой сессии или после установки, но не при первом визите. Без аккаунта предлагаем экспорт в JSON: в Safari во вкладке данные могут удалиться через 7 дней.
- **Обновления:** `registerType: 'prompt'`. «Доступна новая версия» показывается только в меню. Применяется по согласию или при холодном старте, но никогда во время сессии. На `vite:preloadError` страница перезагружается. Схемы Dexie версионируются через `version().upgrade()`. Версия кэша ML меняется отдельно от оболочки.
- **Установка:**
  - Chromium: откладываем `beforeinstallprompt` и предлагаем установку на итогах после второй сессии.
  - iOS: `InstallSheet` с инструкцией «Поделиться → На экран „Домой“». С iOS 26 любой сайт с экрана «Домой» открывается как веб-приложение, но манифест всё равно нужен (`display: standalone`, иконки, `scope`).
  - Определение режима: `display-mode: standalone` / `navigator.standalone`. TWA для Google Play — позже.
- **Wake Lock** запрашиваем при старте сессии и снова на `visibilitychange`. Если не работает (установленная PWA на iOS до 18.4), показываем подсказку про автоблокировку. На Android при старте вызываем `requestFullscreen`.
- **Видимость и прерывания:**
  - `hidden` → пауза с причиной `hidden`, `AudioContext.suspend()`, остановка инференса, через 60 с остановка треков камеры.
  - При возврате → экран «Нажми или замри, чтобы продолжить»: новое касание нужно iOS для `resume()`.
  - AudioContext в состоянии `interrupted` (звонок, Siri) → пауза.
  - `navigator.audioSession.type = 'playback'`, чтобы переключатель «без звука» на iPhone не глушил игру.
  - Журнал сессии пишется в IDB каждые 5 с и на `pagehide`: упавшая сессия восстанавливается как «прервана».

## 8. Производительность и уровни устройств

Уровень устройства определяется **бенчмарком** (§3.10), а не по UA:

| Уровень | Критерий (воркер, CPU или GPU) | Камера / инференс | Рендер |
|---|---|---|---|
| A | pose lite p95 ≤ 35 мс, face p95 ≤ 12 | 640×480@30; face 30 Гц, pose 30 Гц; full доступна | DPR 2, все эффекты |
| B | pose lite p95 ≤ 60, face ≤ 25 | 640×480@30; face 30, pose 20 Гц | DPR 1,5, меньше частиц |
| C | хуже B | 480×360@24; face 15–20 Гц; боковой режим «экспериментальный» | DPR 1, без свечения, «Пульс» в lite-виде |
| — | Нет WASM SIMD или module worker | Только демо-провайдеры и сообщение | — |

Минимальные платформы: iOS/iPadOS 17+ (полноценно с 18.4), Chrome Android за последние 2 года, десктопные Chrome, Edge, Safari 17+ и Firefox.

| Метрика | Цель (A/B) | Предел (C) |
|---|---|---|
| FPS игры | 60 | стабильные 30 |
| update + render на главном потоке | ≤ 8 мс | ≤ 16 мс |
| Long tasks > 50 мс в сессии | 0 | 0 |
| Задержка «движение → экран» | ≤ 150 мс | ≤ 250 мс |
| Ошибка синхронизации звука после калибровки | ≤ 20 мс | ≤ 40 мс |
| Память вкладки | ≤ 250 МБ | ≤ 200 МБ (трек ≤ 5 мин) |
| JS первого экрана (gzip) | ≤ 180 КБ | |
| CSS / шрифты при старте | ≤ 30 КБ / ≤ 130 КБ | |
| Чанк Canvas-игры / Pixi-игры | ≤ 60 / ≤ 260 КБ | |
| ML: спереди / сбоку (lite) | ≈ 4,1 / ≈ 9 МБ gzip, один раз | |
| LCP меню (4G, средний Android) | ≤ 2,5 с | |
| 10 минут игры | без троттлинга ниже 30 fps | |

Бюджеты проверяет CI по манифесту Vite (size-limit 14). Отладочная панель D показывает конвейер, fps, дропы и делегат.

## 9. Тестирование

### 9.1 Модульные тесты (Vitest)

- Фильтры, `Debounced`, калибровка, ошибки техники.
- **Паритет с прототипом:** запустить `legacy/js/plank.js` и новый TS на одних и тех же записанных последовательностях точек (JSON из синтетики и от добровольцев) и потребовать совпадения `control`, `issue` и `formOk` с точностью 1e-9.
- `rng` и `dmath` (сравнение с эталоном), round-trip `inrec/1`.
- Детерминизм игр: seed + запись → хэш, снапшоты чекпоинтов.
- Property-тесты на fast-check: ворота «Тоннеля» всегда достижимы при `maxShiftsPerMin`, линтер чартов, генератор плана держит пределы безопасности (≤ 45 с на удержание, +1 уровень за сессию).
- Миграции Dexie на fake-indexeddb, полнота сообщений Paraglide.

### 9.2 Синтетическая камера (развитие `test/`)

- Перенести стенд в `tools/synthetic-camera`. Персонажи Michelle и Xbot, у каждого кадра JSON с ground truth.
- Новые сценарии: контровой свет, тёмная комната, пёстрый фон, второй человек позади, частичный выход из кадра, медленный дрейф, усталое дрожание, планка на коленях, «кивок вместо корпуса».
- Playwright-проект с `--use-file-for-fake-video-capture` и CPU-делегатом. Утверждения по сегментам, как в `e2e.mjs`: знак и амплитуда оси, проблема распознана за 0,8 с или быстрее, калибровка за 2,5 с или быстрее, нет ложных пауз в нейтральных сегментах. Задержка меряется по ступенькам.
- Пока идёт миграция, один и тот же набор прогоняется **против legacy и против нового приложения**, отчёт сравнивает их.
- Тестовый хук `window.__plank` остаётся, но типизированный и только в тестовой сборке. Боты (`fireflies-bot`) работают через провайдеры `demo` и `replay`.
- На PR запускаются короткие видео, по ночам — вся матрица.

### 9.3 Визуальная регрессия и a11y

- `toHaveScreenshot` по `/_dev/gallery` и ключевым экранам с seed-демо.
- Матрица: тёмная и светлая тема × ru, en, uz и псевдолокаль (+40% длины, U+02BB) × 390×844, 844×390 и 1280×800.
- Анимации отключены, шрифты дождались `document.fonts.ready`.
- Снимки состояний HUD (ok, warn, broken) с `Emulation.setEmulatedVisionDeficiency` (deuteranopia, protanopia, achromatopsia).
- Проверка axe на каждом экране, тест горизонтального переполнения (как в `ui.mjs`).

### 9.4 Чек-лист реальных устройств

Устройства: iPhone SE 2/3 (iOS 17), iPhone 12/13 (iOS 18.x), iPhone 15+ (iOS 26), iPad; слабый Android (3–4 ГБ, Helio G8x / Snapdragon 4xx), средний (Snapdragon 7xx), Pixel; ноутбуки с Chrome/Windows на встроенной графике, Safari/macOS, Firefox.

Что проверяем:

1. Выдача и запрет доступа к камере, повторная выдача.
2. Калибровку спереди и сбоку в реальных комнатах.
3. Инференс p50/p95 на CPU и GPU.
4. 10 минут игры: fps и нагрев.
5. Wake Lock во вкладке и в установленной PWA.
6. Переключатель «без звука» и `audioSession`.
7. Bluetooth-наушники и калибровку задержки.
8. Звонок, Siri, блокировку экрана и возврат.
9. Установку и обновление.
10. Холодный старт в авиарежиме.
11. Удаление данных Safari через 7 дней.
12. Нехватку места.
13. Поворот экрана и split view.
14. VoiceOver и TalkBack в меню.
15. Узбекский текст на латинице и кириллице.

### 9.5 Телеметрия и ошибки

Трекер ошибок — Sentry SDK, отправка в self-hosted GlitchTip ячейки региона через `tunnel`. `beforeSend` вычищает PII. Кадры, точки тела и ответы о здоровье не отправляются никогда. Ошибки воркеров пересылаются через главный поток.

Перфоманс-сводка одной сессии:

```
{appVersion, mlVersion, tier, delegate, model, mode, inferP50/P95, fps p5, drops%, e2eMs p50, calibMs, breaks, deviceClass}
```

Сводка уходит батчем в `/telemetry` (через outbox). В настройках есть переключатель отказа. Кнопка «Отправить диагностику» собирает сводку и последнюю запись ввода по согласию. Продуктовая аналитика будет только self-hosted, позже.

## 10. План миграции

Принципы:

- Живой сайт `kaktys281999-sketch.github.io/plank-run/` работает на каждом шаге.
- Новое сначала проверяется внутри legacy, и только потом рядом с ним.
- Все Pages-сайты одного пользователя делят один origin (`*.github.io`), а значит, хранилище и SW тоже. Поэтому SW регистрируем только со `scope: '/plank-run/'`, а до аккаунтов переезжаем на собственный домен. Хостинг для РФ выбирается по compliance.md.

| # | Этап | Что делаем | Готово, когда |
|---|---|---|---|
| M0 | Каркас (≈ 3 дня) | pnpm-монорепо. Прототип переезжает в `apps/legacy` без изменений, `test/` — в `tools/`. GitHub Actions собирает Pages-артефакт: legacy в `/plank-run/`. Базовые прогоны e2e против legacy записываются как эталон | Сайт идентичен, CI зелёный |
| M1 | Чистая логика в TS | `body-input/analyzers`, `game-core` (rng, dmath, цикл, автомат сессии, запись), `games/{tunnel,fireflies}/sim`. Golden-записи с legacy. Библиотечная сборка `dist/legacy-bridge.js` подключается в `apps/legacy` вместо `plank.js` и `filters.js` | Паритет 1e-9, e2e legacy без изменений |
| M2 | Воркер и кэш ML | tasks-vision 1.1.1, `face` и `pose` воркеры, ModelStore, бенчмарк. В legacy работает за флагом `?worker`, затем включается по умолчанию. CDN-откат только для dev | p95 rAF на pose ≤ 17 мс в e2e; телеметрия с живого сайта |
| M3 | Новая оболочка | React, роутер, токены, шрифты, `ui`, ru-сообщения. Экраны настроек, `/setup`, `/session` с портированными играми, итоги, история. Миграция `localStorage['plank-run:v1']` → Dexie (тот же origin). Деплой в `/plank-run/app/` с `noindex` | Паритет e2e legacy и новой версии, визуальные снимки, axe без ошибок |
| M4 | PWA | SW, офлайн, установка, обновления, Wake Lock, голосовые клипы ru, GlitchTip. На главной legacy появляется ссылка «Попробовать новую версию» | Чек-лист устройств §9.4 пройден |
| M5 | Переключение | `/plank-run/` отдаёт новое приложение, legacy уходит в `/plank-run/classic/` на 2 месяца. Редирект сохраняет `?debug`, `?cpu` и `?cdn`. У legacy нет SW, снимать нечего | Ошибки и fps не хуже legacy неделю |
| M6 | Онбординг и путь | Анкета (здоровье только локально), стартовый тест, план, карта пути, «Звездопад», «Искра», звёзды, призрак своего рекорда | Онбординг укладывается в 4 мин |
| M7 | Ритм | `audio` (GameClock, калибровка «кивни в такт»), `beatmap`, «Пульс» на Pixi, библиотека CC-треков, загрузки в OPFS | Синхронизация ≤ 20 мс на A/B |
| M8 | Аккаунты | `apps/api` по backend.md, `HttpApi` вместо `LocalApi`, outbox, токен попытки, реплеи на пересимуляцию, друзья, лига, kudos | Пересимуляция в Node совпадает с клиентом на 100% записей |
| M9 | Локали и магазины | en и uz (латиница), uz-Cyrl по запросу, TWA | Псевдолокаль и uz-снимки чистые |

Откат: каждый этап выкладывается отдельным артефактом. До M5 legacy остаётся основным, после M5 доступен по `/classic/`.

## 11. Риски и открытые вопросы

- Пороги анализатора подобраны на синтетике. Нужны записи 10–20 людей; формат записи точек для этого (только локально и по согласию) определяется в M1.
- `VideoFrame` и `createImageBitmap` с `resize*` в Safari нужно замерить до включения.
- Детерминизм между JavaScriptCore и V8 закреплён `dmath`, но его надо подтвердить ночным кросс-движковым тестом.
- Выбор домена и хостинга для РФ, Узбекистана и остального мира блокирует M8, но не M0–M7.
