# Plank Run: спецификация фронтенд-архитектуры и дизайн-системы

*Версия 1, 19.10.2026. Статус: к реализации.*

*Основа: код прототипа (`index.html`, `js/*`, `test/*`), `docs/research/*.md` и поправки из `verify-frontend-design.md`, `verify-backend-compliance.md` и `verify-progression-games.md`; при расхождении поправки важнее исследований. Версии пакетов сверены с реестром npm на 19.10.2026.*

## 0. Ключевые решения

1. **Оболочка.** SPA на React 19, Vite 8 и TanStack Router, без SSR. Игры и ML живут вне React.
2. **ML в воркерах.** Одна модель — один module worker (`tasks-vision` 1.1.1). Кадр уходит как `ImageBitmap` через transfer, в полёте не больше одного. Обратно приходит `BodyFrame` около 100 байт.
3. **Анализ планки.** `js/plank.js` переносится в TS без изменения чисел, совпадение проверяют golden-тесты.
4. **Игры как плагины.** Детерминированная `sim` (60 Гц, seed, `dmath`) отделена от `view` (Canvas2D или PixiJS). На квантованной записи ввода работают реплеи, призраки и пересимуляция на сервере.
5. **Дизайн «Неон + Искра».** Шрифты Onest и Unbounded. Состояние передаётся цветом, формой, словом и звуком. Размер HUD под дистанцию задаёт `--view-scale`.
6. **Offline-first.** В precache только оболочка. WASM и модели скачиваются явно, с прогрессом, в версионированный Cache. Все файлы с собственного origin.
7. **Миграция «душителем».** Прототип работает до конца. Новые пакеты сначала обкатываются внутри него, затем рядом поднимается новая оболочка.

## 1. Стек

| Слой | Выбор (версия) | Почему |
|---|---|---|
| Монорепо | pnpm 12.14 workspaces (turbo 2.11 позже) | Одному разработчику хватит `pnpm -r` |
| Язык | TypeScript **7.0.2** (нативный `tsgo`), `strict`, `noUncheckedIndexedAccess` | Явный выбор «TS 7 + Biome», как в официальном примере MediaPipe; typescript-eslint (TS < 6.1) не нужен. Если инструменту нужен JS API компилятора, ставим ему `typescript@6.0.3` |
| Линт и формат | Biome 2.5.15 | `noRestrictedGlobals` и `noRestrictedImports` с overrides по пакетам охраняют детерминизм и границы §2; строгий `node_modules` pnpm не даёт импортировать необъявленное |
| Сборка | Vite 8.3.4, @vitejs/plugin-react 6.1.2, `worker.format: 'es'` | Rolldown, ленивые чанки игр и воркеров |
| UI | React 19.3.1 | Экосистема; ИИ надёжнее всего пишет на React |
| Роутинг | @tanstack/react-router 1.170 + router-plugin 1.168, file-based, `autoCodeSplitting` | Типизированные search-параметры, экран = чанк |
| Серверные данные | @tanstack/react-query 5.104 + persist-client | С этапа аккаунтов; до бэкенда — адаптер `LocalApi` |
| Клиентское состояние | Zustand 5.0.15 | Настройки, профиль устройства, снимок HUD 10 Гц; покадрового состояния здесь нет |
| Локальная БД | Dexie 4.4.6 + dexie-react-hooks 4.4; OPFS для аудио | Миграции схем, `useLiveQuery` |
| Схемы | Zod 4.6.7 в `shared` | Один контракт для клиента, API и пересимуляции |
| Стили | Tailwind CSS 4.3.3 (`@theme` из токенов) | Токены и в CSS, и в canvas; Safari 16.4+ нас устраивает |
| Headless-компоненты | @base-ui/react 1.9.0 | Доступные Dialog, Tabs, Slider, Switch, Radio, Toast |
| Анимация UI | motion 14.4 (`LazyMotion` + `domAnimation`) | Пружины, layout; в играх свои твины |
| Иконки | @phosphor-icons/react 2.1.10 | Начертания Bold и Fill читаются издалека |
| Шрифты | @fontsource-variable/onest 5.3.1 и /unbounded 5.3.0 | OFL, свой хостинг, подмножества latin(-ext) и cyrillic(-ext) |
| i18n | @inlang/paraglide-js 2.29 + `Intl.*` | Сообщения компилируются в функции, забытый ключ ломает сборку |
| ML | @mediapipe/tasks-vision **1.1.1** (в `vendor/` сейчас 1.0.1 без `*_module_internal.*`) | Module wasm в воркере; WASM +1,76 МБ (+15%). nosimd не поставляем: module-сборки без SIMD нет, на iOS 17+ SIMD есть |
| 2D-рендер | Canvas2D; pixi.js 8.22.0 для «Пульса» и «Титана» | Батчинг и фильтры нужны только тяжёлым играм |
| PWA | vite-plugin-pwa 2.0.0 (`injectManifest`), Workbox 7.4.1 | Свой SW с явными маршрутами |
| Тесты | Vitest 5.0.5 (fake-indexeddb 6.2, fast-check 4.10), @playwright/test 1.64.1, @axe-core/playwright 4.14 | См. §9 |
| Ошибки и метрики | @sentry/react 11.8 → self-hosted GlitchTip в ячейке региона; web-vitals 6.2 + свой `/telemetry` | 152-ФЗ: иностранный SaaS не должен получать ПДн из браузера пользователя из РФ |

**Не используем:**

- Next.js, Remix и SSR/RSC: камере и canvas они ничего не дают, а офлайну мешают. Лендинг — отдельная статика.
- Phaser, Babylon, R3F (peer `react <19.4`), @pixi/react: ввод, звук и цикл у нас свои.
- Redux, MobX, XState: автомат сессии — чистая функция.
- Tone.js, howler, essentia.js (AGPL).
- GSAP, Rive, dotLottie — пока нет аниматора.
- Runtime CSS-in-JS, MUI.
- Google Fonts, jsDelivr и storage.googleapis.com в рантайме.
- Firebase и сторонняя аналитика.
- `localStorage` для данных: там только флаг темы.

## 2. Монорепо

```
apps/web               SPA + PWA: маршруты, экраны, SessionRunner, src/sw.ts
apps/api               заглушка: README + OpenAPI из zod-схем; реализация по backend.md (Hono + Postgres)
apps/legacy            прототип как есть, до переключения
packages/shared        zod-схемы (Settings, SessionResult, InputRecording, Chart), UUIDv7, константы
packages/body-input    камера, воркеры, провайдеры, анализаторы, калибровка, кэш моделей, бенчмарк
packages/game-core     фиксированный шаг, rng, dmath, запись и реплей, автомат сессии, DDA, FlashLimiter
packages/games/{fireflies,tunnel,starfall,pulse}   sim.ts + view.ts + manifest.ts
packages/audio         AudioEngine, шины, GameClock, SfxBank, VoiceCues, калибровка задержки
packages/beatmap       формат chart/1, генератор, линтер, анализ BPM и онсетов (воркер)
packages/ui            tokens.json → CSS + TS, React-компоненты, Искра
packages/i18n          ru/en/uz, линтер U+02BB, голосовые клипы по ключам
tools/synthetic-camera перенесённый test/: three.js → y4m + ground truth;   tools/e2e — Playwright
```

Пакеты внутренние, без своей сборки: `exports` указывает на `src/*.ts`.

| Пакет | Может зависеть от | Запрещено |
|---|---|---|
| shared | zod | всё остальное |
| game-core | shared | React; DOM только через инъекцию (`scheduler`, `now`); в `sim/`: `Math.random`, `Date`, `Math.sin/cos/exp/pow/hypot` |
| games/* | game-core, shared; pixi.js только во `view.ts` | body-input, audio, React; DOM в `sim.ts` |
| body-input | shared, tasks-vision | React, game-core, games |
| audio | shared | React, games |
| beatmap | shared, game-core (rng) | DOM (работает в воркере и в Node) |
| ui | react, base-ui, motion, phosphor, i18n | body-input, games, audio |
| apps/web | всё | — |
| apps/api | shared, game-core, `games/*/sim` | ui, body-input, audio |

Типы сигнала (`BodyFrame`, `BodyAction`, `CameraMode`, `SfxId`) лежат в `shared`, поэтому игры не зависят от реализаций. Ключевое правило: `sim.ts` любой игры импортируется в Node, на этом держится серверная пересимуляция.

## 3. BodyInput

### 3.1 Конвейер

```
CameraManager (1 MediaStream на сеанс) → <video> ─rVFC(meta)→ FrameSource
  createImageBitmap(video) → postMessage({seq,tCapture,image},[image])   ≤1 кадр в полёте на воркер
VisionWorker[face|pose]: detectForVideo → image.close() → Analyzer (features → form → calibration → control)
  → {BodyFrame, actions, inferMs} → Provider (кольцевая история 2 с) → latest() / sampleAt() / события
```

### 3.2 Камера и кадры

- **Один поток на сеанс.** `getUserMedia` (640×480, ≤30 fps, `audio:false`) вызывается один раз, между экранами треки не останавливаем: в iOS до 17.2 это давало повторный запрос. Микрофон не просим никогда: он приглушает Web Audio и переводит AirPods в HFP.
- **Сбои камеры.** На `ended` и `mute` ставим паузу с причиной `camera` и переподключаемся. Коды ошибок прототипа сохраняем, к каждому — инструкция для платформы.
- **Выбор и превью.** Выбор камеры на ноутбуке, зеркальное превью только в CSS.
- **Время кадра.** Кадр берём в `requestVideoFrameCallback`; `tCapture` = `metadata.captureTime` или `expectedDisplayTime` минус кадр. Без rVFC — опрос `currentTime` в rAF.
- **Передача кадра.** Базовый путь — `createImageBitmap(video)` с transfer. `VideoFrame` включается флагом только после замера. `MediaStreamTrackProcessor` не используем: в Chrome он есть только в Window, в Safari 18+ только в воркере.
- **Backpressure.** Пока воркер занят, кадр не создаём и считаем как `dropped`. Частоту инференса ограничивает уровень устройства (§8).
- **Часы воркера.** У воркера свой `timeOrigin`. При `init` передаём `clockOffset`, и все `t*` пересчитываются в шкалу главного потока.

### 3.3 Воркеры

- `face.worker.ts` и `pose.worker.ts`, у каждого свой экземпляр WASM. Загрузчику передаём детерминированный query `?task=face|pose`, а в SW ставим `ignoreSearch`. Иначе вторая задача падает с `ModuleFactory not set.`
- Переключение lite и full пересоздаёт задачу в том же воркере.
- Сбой GPU при создании или на первом кадре → CPU внутри воркера и событие `delegateChanged` (как `fallbackToCpu`). Ошибки уходят в трекер без данных кадра.

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

### 3.4 Провайдеры

| Kind | Источник | Оси | Техника | Для чего |
|---|---|---|---|---|
| `face` | BlazeFace, камера спереди | x, y | basic: на месте, не упал, не встал | Основной режим |
| `pose` | Pose lite/full, камера сбоку | y (качание) | strict: провис, «домик», колени, упор | Строгая техника |
| `keyboard` | Стрелки; пробел имитирует срыв | x, y | имитация | Ноутбук, отладка |
| `pointer` | Мышь или палец | x, y | всегда ок | Демо, доступность |
| `demo` | Бот по seed | x, y | по сценарию | Превью игр, витрина, тесты |
| `replay` | `InputRecording` | из записи | из записи | Призраки, баг-репорты, e2e |

`ProviderRegistry` выбирает провайдер по `manifest.needs`, режиму камеры и уровню устройства.

### 3.5 Анализаторы (перенос `js/plank.js`)

- **Признаки.** `features/front.ts` (`faceFeatures`, `largestFace`) и `features/side.ts` (`sideFeatures`, `blend`, `belowLine`) переносим без изменений.
- **Техника.** `form.ts` содержит `THRESHOLDS`, `frontIssue` и `sideIssue`. Пороги версионируются как `analyzerVersion`, версия пишется в каждую запись.
- **Управление.** `control.ts` содержит `CONTROL_RANGE`, чувствительность, One Euro (1,2 / 0,4) и ограничение ±1,2.
- **Дебаунс.** `debounce.ts`: включение 0,25 с, выключение 0,45 с, прощение потери детекции 0,3 с.
- **Калибровка.** `calibration.ts`: удержание 1,5 с, разброс по 20 кадрам, медиана по 30, baseline `hipDev` ограничен диапазоном [−0,05; 0,02].
- **Новое, под флагами:**
  - медленный авто-центр против дрейфа (τ около 20 с, пока тело неподвижно);
  - индекс дрожания J в полосе 1–5 Гц, служит флагом усталости;
  - действия `pulse` (рывок за 300–500 мс) и `still`.
- Чистый TS: один код в воркере, Vitest и Node.

### 3.6 Нормализованный сигнал

```ts
export type FormIssue = 'lost'|'noFace'|'notVisible'|'tooFar'|'moved'|'standing'|'lying'|'noSupport'|'sag'|'pike'|'knees';
export type FormState = 'unknown' | 'ok' | 'warn' | 'broken';
export interface BodyFrame {
  seq: number; tCapture: number; tResult: number;   // мс, шкала performance.now() главного потока
  present: boolean; confidence: number;              // 0..1
  axes: { x: number; y: number };                    // −1..1 (до ±1,2), 0 до калибровки
  form: { state: FormState; issue: FormIssue | null; checks: Partial<Record<CheckId, boolean>> };
  calib: { state: 'none' | 'collecting' | 'done'; progress: number };
  metrics?: Record<string, number>;                  // только debug и телеметрия
}
export type BodyAction =
  | { type: 'calibrated' } | { type: 'formBroken'; issue: FormIssue } | { type: 'formRestored' }
  | { type: 'lost' } | { type: 'found' } | { type: 'still'; ms: number }
  | { type: 'pulse'; dir: 'left'|'right'|'up'|'down'; tCapture: number };
export interface BodyInputProvider {
  readonly kind: ProviderKind;
  readonly caps: { axes: ('x'|'y')[]; formCheck: 'none'|'basic'|'strict'; actions: BodyAction['type'][]; typicalLatencyMs: number };
  init(o: { stream?: MediaStream; mode: CameraMode; signal: AbortSignal; onProgress?(p: LoadProgress): void }): Promise<void>;
  start(): void; stop(): void; dispose(): void;
  recalibrate(): void; setParams(p: Partial<AnalyzerParams>): void;   // sensitivity, kneePlank, axis
  latest(): BodyFrame | null;                     // pull: игровой тик
  sampleAt(tCapture: number): BodyFrame | null;   // история 2 с: судейство ритма
  on<K extends keyof ProviderEvents>(k: K, cb: ProviderEvents[K]): () => void;   // frame | action | stats
  stats(): PipelineStats;                          // fps, inferP50/P95, drops, delegate, e2eMs
}
```

Новое состояние `warn` включается, когда сырая проблема уже есть, а дебаунс ещё держит «ок», или метрика дошла до 70% порога. Янтарное предупреждение звучит раньше паузы.

### 3.7 Калибровка

Состояния: `searching` (никого нет) → `positioning` (чек-лист прототипа: лицо и расстояние; сбоку тело в кадре, горизонт, упор, ноги, линия) → `holding` (кольцо 1,5 с) → `done`. Перекалибровка: клавиша R, меню паузы или голос после трёх `moved` подряд. Позже добавится калибровка диапазона («качнись влево и вправо») для личного `CONTROL_RANGE`. Сохраняются только диапазоны, baseline считается заново в каждой сессии.

### 3.8 Задержка

На каждом кадре: `queueMs`, `inferMs`, `analyzeMs`, `captureToResult`, `resultToPresent`. Их сумма — оценка «движение → экран». Она видна в панели D, уходит в телеметрию (p50, p95) и сдвигает окно судейства ритма. В e2e меряем от ступеньки сценария до 50% амплитуды оси.

### 3.9 Бенчмарк и откат

- **Когда.** При первом входе в режим, при смене версии ML или UA.
- **Как.** 2 с на CPU, затем 2 с на GPU, если есть WebGL2 в OffscreenCanvas и рендерер не SwiftShader. Кадры живые или встроенный тестовый.
- **Выбор.** GPU берём, только если его p50 < 0,8 × p50 CPU и ошибок не было. Профиль `{uaHash, mlVersion, model, delegate, p50, p95, tier}` сохраняется в IDB.
- **Сторож.** Если p95 выше бюджета уровня 5 с подряд, снижаем ступенчато: full → lite → 30/20/15 Гц → камера 480×360 → предложение перейти в режим «спереди».

### 3.10 Модели и кэш

- **Пути.** Файлы раздаются с нашего origin: `/ml/tasks-vision@1.1.1/vision_wasm_module_internal.{js,wasm}` и `/ml/models/<name>.<sha8>.task`. При сборке генерируется `ml-manifest.json` (url, байты, sha256). CDN-откат прототипа остаётся только dev-флагом `?cdn`.
- **Загрузка.** `ModelStore.ensure(['wasm','face'])` качает файлы потоком (`ReadableStream`), считает прогресс по байтам из манифеста, проверяет sha256 через `crypto.subtle` и кладёт в Cache `ml-1.1.1`. Воркер запрашивает те же URL и получает их через SW по CacheFirst.
- **Интерфейс.** «Скачиваем модель позы: 3,1 из 5,8 МБ», отмена, предупреждение при `saveData`, затем значок «Работает без интернета».
- **Объёмы.** Режим «спереди» — около 4,1 МБ gzip, «сбоку» с lite — около 9 МБ. Модель full скачивается по запросу и только на уровне A. Старые `ml-*` удаляются в `activate`.

## 4. API игровых плагинов

### 4.1 Цикл и жизненный цикл

`SessionRunner` (game-core) ведёт автомат сессии:

```
setup → calibrating → countdown(3 с) → active ⇄ formPaused(≤4 с) ⇄ rest → ended
```

Есть и отдельные паузы: `hidden`, `interrupted`, `camera`, `user`. Константы прототипа сохраняются: `END_AFTER 4`, отсчёт 3, вехи каждые 15 с, «ещё десять секунд». Интервалы задаёт планировщик прогрессии.

Цикл: `acc += frameMs; while (acc ≥ 16,667 && steps < 5) { sim.step(sampleInput(tick), tick); dispatch(sim.events()); tick++ } view.render(acc / 16,667)`. Шаги сверх пяти отбрасываются, задержка не копится. HUD уходит в Zustand 10 раз в секунду.

Путь плагина: `load()` → `createSim` → `createView` → `preload()` → `onPhase` → шаги → `summary()` → `dispose()`. Вне `active` `sim` стоит, а `view` анимирует курсор (как `update(dt, false)` в прототипе).

### 4.2 Детерминизм

- **RNG.** sfc32, seed через cyrb128, потоки `rng.fork('spawn')`. Частицы во `view` берут отдельный `renderRng`, на очки он не влияет.
- **Математика.** `Math.sin/cos/exp/pow/hypot` в V8 и JavaScriptCore могут расходиться в последнем бите, а сервер считает в Node. Поэтому в `sim` — `dmath`: полиномы на `+ − × ÷` и `Math.sqrt` (он округляется корректно).
- **Ввод.** `q = round(clamp(v, −1, 1) × 127)`, и живая `sim` тоже читает `q/127`. Отсчёт 30 Гц повторяется на нечётном тике: игра и реплей совпадают бит в бит.
- **Мир.** Нормализованные координаты, пропорции фиксирует `WorldSpec`; экран на мир не влияет.

### 4.3 Интерфейсы

```ts
export interface GameManifest<P> {
  id: string; version: string; titleKey: MessageKey; hintKey: Partial<Record<CameraMode, MessageKey>>;
  cameraModes: CameraMode[]; renderer: 'canvas2d' | 'pixi';
  needs: { axes: ('x'|'y')[]; formCheck?: 'basic'|'strict'; music?: boolean; actions?: BodyAction['type'][] };
  params: z.ZodType<P>; defaults(level: number): P;
  load(): Promise<GameModule<P>>;                  // import() → отдельный чанк
}
export interface GameModule<P> {
  createSim(seed: string, params: P, world: WorldSpec): GameSim;
  createView(sim: Readonly<GameSim>, ctx: ViewContext): GameView;
}
export interface SimInput { x: number; y: number; flags: number; actions: number }   // x, y = q/127
export interface GameSim {
  step(input: SimInput, tick: number): void;       // dt = 1/60 с
  onPhase(p: 'warmup'|'active'|'paused'|'rest'): void;
  events(): readonly GameEvent[];                   // {kind, sfx?: SfxId, at?: 'now'|'beat', data}
  hud(): HudModel; summary(): GameSummary; hash(): number;
}
export interface ViewContext {
  canvas: HTMLCanvasElement; theme: ThemeTokens; reducedMotion: boolean; viewScale: number;
  safeRect: Rect; flash: FlashLimiter; renderRng: () => number; clock: GameClock;
}
export interface GameView {
  preload(): Promise<void>; resize(w: number, h: number, dpr: number, safe: Rect): void;
  render(alpha: number, frameMs: number): void; onEvent(e: GameEvent): void; dispose(): void;
}
export interface HudModel { stats: [HudStat, HudStat?]; combo?: number; judge?: { kind: Judge; seq: number } }
export interface GameSummary { score: number; bestCombo: number; successRate: number; accuracy?: number;
  stats: { key: string; value: number; labelKey: MessageKey; format: 'int'|'pct'|'ratio' }[] }
```

### 4.4 Запись ввода `inrec/1`

```ts
export interface InputRecording {
  format: 'inrec/1'; id: string; gameId: string; gameVersion: string; coreVersion: string; analyzerVersion: string;
  seed: string; paramsHash: string; tickHz: 60; inputHz: 30; provider: ProviderKind; mode: CameraMode;
  axes: Int8Array;                                  // x0,y0,x1,y1…
  flags: Uint8Array;                                // present, formOk, warn, active, rest
  actions: Array<{ tick: number; code: number }>;
  checkpoints: Array<{ tick: number; hash: number }>;   // каждые 300 тиков
  final: { score: number; hash: number };
}
```

Бинарный контейнер сжимается `CompressionStream('gzip')`: 2–3 КБ на минуту. Запись лежит в IDB и нужна для призрака (вторая `sim` с тем же seed), баг-репорта (`?provider=replay`) и сервера. Точки тела не пишутся никогда.

### 4.5 HUD, итоги, сложность, звук

- **HUD.** Главную цифру (время в хорошей технике) рисует **оболочка**. Игра отдаёт не больше двух показателей, комбо и метку. HUD — DOM поверх canvas: чёткий, доступный, масштабируется `--view-scale`. Игра не рисует под HUD (`safeRect`).
- **Итоги.** `GameSummary` вместе с метриками оболочки (`held`, `formPct`, `breaks`, `reason`) проверяется схемой `SessionResultSchema`.
- **Сложность.** Осей две (progression §9). Физическую задаёт планировщик: интервалы и `maxShiftsPerMin` 12, 20 или 30. Игровая живёт в `params`: скорость, плотность, ширина ворот, окно. `DdaController` держит успех 65–85% в окне из 20 событий с шагом ±5%. Первые 30 с интервала и при флаге усталости он не вмешивается. Промах во время `warn` или `broken` в окно не попадает.
- **Звук.** Игры не трогают Web Audio. Событие несёт `sfx` и `at`, а `AudioEngine` проигрывает токен (§6.8) с панорамой по позиции. Ритм-игра получает `GameClock` — время песни по `AudioContext`. Калибровка «кивни в такт» обязательна везде; `outputLatency` — лишь начальное приближение (Apple его поддержку не подтверждала). Ввод берётся через `sampleAt(tCapture − задержка)`, в запись идут выровненные отсчёты. Голосом говорит только оболочка.

### 4.6 Перенос Fireflies и Tunnel

| Прототип | Новая архитектура |
|---|---|
| `update(dt, running)` с переменным dt | `sim.step` 60 Гц + `onPhase` |
| `Math.random` в `spawn` и блуждании | `rng.fork(...)` |
| `Math.exp` в сглаживании, `hypot`, `cos/sin` | `dmath` |
| **Столкновение «Светлячков» в пикселях** (`toScreen`, `jarRadius` = clamp(…, 30, 80) px): счёт зависит от экрана | Радиус и проверка в мировых единицах; минимум 30 px только визуальный |
| `burst()` частиц внутри симуляции | `view.onEvent` + `renderRng` |
| `onEvent('catch')` → `sound.chime` | `GameEvent{sfx:'game.catch', data:{combo,type}}` |
| `hudStats()` и `summary()` как массивы строк | `HudModel`, `GameSummary` с ключами i18n |
| `setDifficultyHorizon`, `hint(camera)` | `params.horizonSec`, `manifest.hintKey` |
| `resume()`: светлячки живут ещё 1,5 с, ворота не ближе d=0,5 | `onPhase('active')` после паузы |
| `COLORS` в `main.js`, `shadowBlur` | `ctx.theme`, свечение заранее отрисовано в спрайты |

Приёмка: `fireflies-bot` и e2e дают сопоставимый счёт, а хэш 10 seed × 3 записи совпадает в Chromium, WebKit и Node.

### 4.7 Рендер

- **Canvas2D:** «Светлячки», «Тоннель», «Звездопад», «Высота».
- **PixiJS** (`preference: 'webgl'`; WebGPU только после тестов): «Пульс», «Титан».
- **Общие правила:** DPR ≤ 2 (B: 1,5; C: 1), никаких аллокаций в горячем цикле, обработка `webglcontextlost`. OffscreenCanvas в воркере пока не нужен.

## 5. Экраны и навигация

| Маршрут | Экран | Телефон, портрет | Альбом | Ноутбук |
|---|---|---|---|---|
| `/onboarding/*` | Приватность → выбор камеры → анкета Э1–Э6 (здоровье только локально; не называть её «PAR-Q+») → калибровка → пробная планка ≤ 60 с → «Звездопад» на 20 с → «твой план» | Один вопрос на экран, карточки ≥ 64 px | Вопрос слева, ответы справа | Колонка 560 px |
| `/` | Карта пути, «Играть», неделя 3/7, Искра | Вертикальная дорожка, «Играть» в зоне большого пальца | Карта и панель «сегодня» | Плюс друзья |
| `/games` | Выбор игры | Карточки 16:9 с превью `demo`, значки «спереди/сбоку» | 2 колонки | 3 колонки, стрелки |
| `/music` | Библиотека / Мои файлы | Строка трека: обложка, BPM, длина, ●●○, превью; «файл остаётся на устройстве» | — | Drag-and-drop |
| `/setup` | Камера, модель, калибровка | Превью с силуэтом, чек-лист ●/▲, кольцо | Сбоку: превью и голос | Крупное превью |
| `/session/$id` | HUD, предупреждение, пауза, отдых | Таймер сверху, полоса статуса | Таймер слева | Сцена 16:9, масштаб 1,5–2 |
| `/results/$id` | Итоги | Время, 3 метрики, звёзды, «Как было?» (3 кнопки), «Ещё раз» на всю ширину | 2 колонки | 2 колонки |
| `/me`, `/friends`, `/settings/*` | Прогресс; друзья и лига; голос, звук, тема, «меньше движения», «крупный режим», язык, приватность, «стереть всё», хранилище | Список, вкладки | — | Две колонки |

Брейкпоинты: < 600, 600–1024, > 1024. Плюс `@media (orientation)`, container queries и safe-area. Маршрут `/_dev/*` (галерея, отладка конвейера) существует только в dev и тестовой сборке.

**Без рук.**

- Старт после калибровки и отсчёт идут сами, голосом.
- При срыве — автопауза, при возврате позы — автопродолжение. Срыв дольше 4 с завершает интервал.
- Меню сессии («ещё подход», «закончить») выбирается `DwellButton`: корпус держим на кнопке 1,2 с.
- Клавиши: Space, Esc, R, D, C. Цели не меньше 64 px. Итоги зачитываются голосом. Тосты во время сессии не показываются.

**Голос.** Каталог `voice.*` (тексты из `VOICE` прототипа) с приоритетами: безопасность > техника > отсчёт > вехи > похвала. Фраза не чаще раза в 2,5 с (та же — раз в 4 с), высший приоритет прерывает. Музыка под голосом −9 дБ. В каждом интервале звучит «Дыши ровно, не задерживай дыхание». Источник — записанные клипы (ru, затем uz, en), запасной — `speechSynthesis`. Каждая фраза дублируется субтитром.

**Дистанция** (design.md §2):

| Режим | `--view-scale` | Что видно |
|---|---|---|
| Телефон спереди, ≈ 0,7 м | 1 | Подписи ≥ 28 px, значения 56 px, главная цифра 104 px |
| Ноутбук, 1–1,5 м | 1,5–2 | То же × масштаб |
| Сбоку, ≈ 3 м | 4 | Только цифра и полоса со знаком, остальное голосом («Экран далеко — слушай подсказки») |

Правила: на экране один главный объект; подписи в 1–3 слова и в регистре предложения; табличные цифры без миллисекунд; у новичка на поле не больше трёх типов объектов.

## 6. Дизайн-система

### 6.1 Направление

«Неон + Искра»: тёмный неон прототипа в играх, тепло маскота на метаэкранах, HUD в духе Fitness+ — одна цифра и кольцо.

### 6.2 Палитра (контраст WCAG пересчитан)

| Токен | Hex | Контраст и роль |
|---|---|---|
| `bg` / `bg-raised` | #0B0D17 / #12152A | Фон |
| `surface` / `surface-2` | #161A33 / #1E2347 | Карточки |
| `text` | #F2F4FF | 17,7:1 на bg; 13,8:1 на surface-2 |
| `text-muted` | #A3A9D1 | 8,4:1; 6,6:1 |
| `line` / `line-strong` | #2E3566 / #6E78C2 | Декор 1,5:1 / границы контролов 4,2:1 (≥ 3:1) |
| `brand` / `brand-text` | #7C6CFF / #A397FF | На заливке пишем тёмным (5,0:1; белый даёт только 3,9:1); текст 7,8:1 |
| `ok` (= `accent`) | #5EF2C2 | 13,8:1; тёмный текст на кнопке 13,8:1 |
| `warn` / `bad` | #FFB547 / #FF5D7A | 11,0:1 / 6,6:1 (5,8:1 на surface) |
| `info` / `coin` | #4CC9FF / #FFD25E | 10,2:1 / 13,5:1 |
| Светлая тема (только меню) | bg #F6F5FF, text #12152A, muted #5A5F85, brand-text #5B4BE0, ok #0E7A5A, warn #8A5300, bad #C2304F | 16,7 / 5,7 / 5,5 / 4,9 / 5,9 / 5,1 :1 |

`ok` и `warn` почти не отличаются по светлоте (1,25:1) и при дейтеранопии сливаются. Поэтому **форма обязательна**: ● норма, ▲ внимание, ✕ срыв. К ней добавляются слово и звук: «динь», голос, голос с тонировкой экрана.

### 6.3 Типографика

- **Шрифты.** Onest — интерфейс, полное узбекское покрытие (U+02BB, Ғ Қ Ҳ). Unbounded — заголовки и цифры; Ғ Қ Ҳ в нём нет, поэтому стек `"Unbounded", "Onest", system-ui`, а для `:lang(uz-Cyrl)` заголовки идут Onest.
- **Загрузка.** Предзагрузка двух cyrillic-woff2; fallback с `size-adjust` и `ascent/descent-override`, чтобы таймер не прыгал. Unbounded капсом не набираем («ПЕРЕКАЛИБРОВАТЬ» не влезет). Линтер i18n меняет `'` и `‘` на U+02BB.
- **Шкалы.** Меню: 12 / 14 / 16 / 20 / 24 / 32 / 40 / 56. HUD: 28 / 56 / 104, умноженные на `--view-scale`.

### 6.4 Токены

```css
@theme {
  --spacing: 4px;   /* шаги 4 8 12 16 24 32 48 64 */
  --radius-sm: 10px; --radius: 16px; --radius-lg: 28px; --radius-pill: 999px;
  --font-display: "Unbounded", "Onest", system-ui, sans-serif;
  --font-ui: "Onest", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
:root {
  --view-scale: 1; --tap: 56px; --tap-primary: 64px; --dwell-ms: 1200ms;
  --hud-label: calc(28px * var(--view-scale)); --hud-value: calc(56px * var(--view-scale)); --hud-hero: calc(104px * var(--view-scale));
  --elev-1: var(--surface); --elev-2: var(--surface-2);   /* глубина светлотой, без теней */
  --focus-ring: 0 0 0 3px var(--bg), 0 0 0 5px var(--brand-text);
  --dur-1: 120ms; --dur-2: 220ms; --dur-3: 420ms;
  --ease-out: cubic-bezier(.2,.8,.2,1); --ease-back: cubic-bezier(.34,1.56,.64,1);
  --spring-ui: 400 30; --spring-mascot: 260 14;          /* stiffness damping для Motion */
  --tint-bad: rgb(255 93 122 / .20); --glow-ok: 0 0 24px rgb(94 242 194 / .45);
}
@media (prefers-reduced-motion: reduce) { :root { --dur-2: 0ms; --dur-3: 0ms; --glow-ok: none; } }
@media (prefers-contrast: more) { :root { --text-muted: #D5D9F5; --line: #6E78C2; } }
```

Источник правды — `packages/ui/tokens.json`. Из него генерируются `tokens.css` и `tokens.ts` для canvas (`ViewContext.theme`). Цвета, записанные прямо в коде игр, запрещены.

### 6.5 Компоненты

**Базовые:** Button (primary, secondary, ghost, danger; 48 / 56 / 64), IconButton, Card, ChoiceCard, Segmented, Toggle, Slider, Tabs, Sheet и Dialog, Toast, Badge, Avatar, Skeleton, EmptyState, ProgressBar, ProgressRing.

**Предметные:**

- в сессии: HeroTimer (кольцо 9% диаметра), StatusBand (цвет, знак и слово по краю экрана), FormAlert (тонировка и кольцо 4 с), CountdownRing, DwellButton, VoiceCaption;
- подготовка: CalibrationChecklist, CameraPreview с силуэтом, ModelDownloadCard, PermissionCard;
- метаэкраны: PathMap и PathNode (SVG), GameCard, TrackRow, StarRating, RpeButtons, StreakWeek, LeaderboardRow, KudosButton;
- PWA: InstallSheet, UpdateToast.

### 6.6 Искра

- **Компонент.** `<Iskra mood size skin />` на SVG и Motion: шар с глазами. Параметры: веки, сжатие, цвет свечения (ok, warn, bad), взгляд за курсором.
- **Состояния:** `idle`, `cheer`, `worry`, `sad`, `celebrate`, `sleep`, `rest-breathe`.
- **Одна модель для меню и игр:** `drawIskra` рисует её на canvas, шар «Тоннеля» и курсор «Пульса» — это Искра. Скины — параметры.
- **Rive** позже, за тем же интерфейсом `mood`. При reduced motion — смена поз без движения.

### 6.7 Иконки и доступность

- **Иконки:** Phosphor Bold, Fill для активных; 24/32 в меню, 48+ в сессии. Знаки ●▲✕ — свои SVG.
- **Базовые требования WCAG 2.2 AA:**
  - контраст по §6.2, цвет никогда не единственный канал (1.4.1);
  - цели 56/64 px (2.5.8 с запасом);
  - видимый фокус (2.4.7, 2.4.11), полная навигация с клавиатуры;
  - `lang` меняется вместе с локалью, у меню нет лимитов времени.
- **Скринридер:** HUD объявляется через `aria-live="polite"` не чаще раза в 5 с, срыв техники — через `assertive`, один раз.
- **Вспышки:** `FlashLimiter` пропускает не больше 3 крупных вспышек в секунду (2.3.1). Полноэкранных красных вспышек нет. Пульс в такт идёт на малой площади, ниже порога general flash. Есть настройка «Без вспышек».
- **Меньше движения:** reduced motion убирает тряску, параллакс, частицы и конфетти, смысловые переходы остаются. Это 2.3.3 уровня AAA, делаем сверх AA. Собственный переключатель «Меньше движения» действует поверх системного.

### 6.8 Звуковые токены

| Токен | Характер | Когда |
|---|---|---|
| `ui.tap` / `ui.confirm` | Клик / двойной тон | Меню |
| `state.ok` | «Динь», 1046 Гц | Возврат техники, старт |
| `state.warn` | 440 → 330 Гц | `warn` / `broken` |
| `count.tick` / `count.go` | 880 / 1046 Гц | Отсчёт, вехи |
| `game.catch` | Пентатоника вверх по комбо | Светлячки, ноты |
| `game.coin` / `game.hit` | Трель / пила вниз | Тоннель |
| `goal.reached` | Арпеджио | Цель выполнена |

Шины: `music`, `sfx`, `voice` и общий лимитер. Тоны прототипа переносятся в `SfxBank`. Вибрации нет: телефон лежит на полу.

### 6.9 Темы

Сессия всегда тёмная. Меню следуют системе или ручному выбору. Флаг темы читается до первой отрисовки, вместе с ним меняется `theme-color`.

## 7. PWA и офлайн

**Service worker** (Workbox 7.4). В `injectManifest` нужно явно задать `globPatterns` и `globIgnores: ['**/ml/**']`. Шаблон по умолчанию `**/*.{js,wasm,css,html}` вместе с `throwMaximumFileSizeToCacheInBytes` **роняет сборку** на 13,5-мегабайтном WASM.

| Что | Стратегия |
|---|---|
| HTML, JS/CSS-чанки, шрифты, иконки, звуки | precache; навигация через `createHandlerBoundToURL` |
| `/ml/**` | CacheFirst в `ml-<версия>`, `ignoreSearch` |
| `/content/*.json` (каталог, уровни, чарты по хэшу) | StaleWhileRevalidate |
| `/music/library/*` | CacheFirst, только после «скачать для офлайна» |
| `/api/**` | NetworkOnly; офлайн обслуживают Query и outbox |
| `config.json` | NetworkFirst с таймаутом 3 с |

**Хранилище.**

- Таблицы Dexie: `settings`, `deviceProfile`, `profile`, `plan`, `progress`, `sessions` (неизменяемые, UUIDv7), `recordings`, `outbox`, `tracks`, `analyses`, `charts`, `health`. Таблица `health` никогда не синхронизируется.
- Треки пользователя лежат в OPFS. В Safari до 26 запись идёт через `createSyncAccessHandle` в воркере, где есть `createWritable` — через него. Без OPFS — Blob в IndexedDB. Каждую загрузку проверяем пробным декодированием. Ogg не обещаем: его поддержка зависит от ОС. Библиотека поставляется в AAC и MP3.
- В настройках показываем `storage.estimate()` и кнопку «Стереть всё на устройстве».
- `navigator.storage.persist()` запрашиваем после первой завершённой сессии или после установки. Пользователю без аккаунта предлагаем экспорт в JSON: Safari во вкладке может стереть данные через 7 дней.

**Обновления.** `registerType: 'prompt'`. Тост «Доступна новая версия» появляется только в меню. Обновление применяется по согласию или при холодном старте, никогда во время сессии. На `vite:preloadError` перезагружаем страницу. Схемы Dexie обновляются через `version().upgrade()`. Версия кэша ML меняется независимо от оболочки.

**Установка.**

- Chromium: откладываем `beforeinstallprompt` и предлагаем установку на итогах второй сессии.
- iOS: `InstallSheet` с инструкцией «Поделиться → На экран „Домой“». С iOS 26 любой сайт с экрана «Домой» открывается как веб-приложение, но манифест (`display: standalone`, иконки, `scope`) всё равно нужен, без него не будет push.
- Напоминания (M8): на iOS — Declarative Web Push (18.4+) и только в установленной PWA. TWA — позже.

**Сессия и фон.**

- Wake Lock — при старте и на каждом `visibilitychange`. В PWA на iOS до 18.4 он сломан; по заметкам Safari 17 экран не гаснет при включённой камере (проверить на устройстве), плюс подсказка про автоблокировку. На Android — `requestFullscreen` (на iPhone его нет).
- При `hidden`: пауза, `AudioContext.suspend()`, инференс останавливается, через 60 с отключается камера. При возврате — «Нажми или замри, чтобы продолжить» (iOS нужен жест для `resume()`). `interrupted` (звонок, Siri) тоже ставит паузу.
- `navigator.audioSession.type = 'playback'`, чтобы переключатель «Без звука» на iPhone не глушил игру.
- Журнал сессии пишется в IDB каждые 5 с и на `pagehide`. Упавшая сессия сохраняется как «прервана».

## 8. Производительность и уровни устройств

Уровень устройства определяет бенчмарк, а не UA:

| Уровень | Критерий (p95 в воркере) | Камера и инференс | Рендер |
|---|---|---|---|
| A | pose lite ≤ 35 мс, face ≤ 12 мс | 640×480@30, face и pose по 30 Гц, модель full доступна | DPR 2, все эффекты |
| B | pose lite ≤ 60 мс, face ≤ 25 мс | 640×480@30, face 30 Гц, pose 20 Гц | DPR 1,5, меньше частиц |
| C | хуже B | 480×360@24, face 15–20 Гц, боковой режим помечен «экспериментальный» | DPR 1, без свечения, «Пульс» в упрощённом виде |
| — | нет WASM SIMD или module worker | только демо и сообщение | — |

Минимальные платформы: iOS/iPadOS 17+ (полноценно с 18.4), Chrome Android за последние 2 года, десктопные Chrome, Edge, Firefox и Safari 17+.

| Метрика | A/B | C |
|---|---|---|
| FPS игры | 60 | стабильные 30 |
| update + render на главном потоке | ≤ 8 мс | ≤ 16 мс |
| Long tasks > 50 мс в сессии | 0 | 0 |
| Задержка «движение → экран» | ≤ 150 мс | ≤ 250 мс |
| Рассинхрон звука после калибровки | ≤ 20 мс | ≤ 40 мс |
| Память вкладки | ≤ 250 МБ | ≤ 200 МБ (трек ≤ 5 мин) |
| JS первого экрана / CSS / шрифты (gzip) | ≤ 180 / 30 / 130 КБ | |
| Чанк игры: Canvas / Pixi | ≤ 60 / 260 КБ | |
| ML один раз: спереди / сбоку | ≈ 4,1 / 9 МБ | |
| LCP меню (4G, средний Android) | ≤ 2,5 с | |
| 10 минут игры | без троттлинга ниже 30 fps | |

Бюджеты проверяет CI (size-limit 14 по манифесту Vite). Отладочная панель D показывает конвейер, fps, дропы и делегат.

## 9. Тестирование

**9.1 Модульные тесты (Vitest).**

- Фильтры, дебаунс, калибровка, ошибки техники.
- **Паритет:** `legacy/js/plank.js` и новый TS на одних записанных точках (синтетика, добровольцы): `control`, `issue`, `formOk` совпадают до 1e-9.
- `rng` и `dmath`; round-trip `inrec/1`.
- Детерминизм игр: хэши чекпоинтов.
- Property-тесты (fast-check): ворота достижимы при `maxShiftsPerMin`, линтер чартов, планировщик не выходит за пределы безопасности (удержание ≤ 45 с, тест ≤ 60 с, +1 уровень за сессию).
- Миграции Dexie, полнота сообщений.

**9.2 Синтетическая камера (развитие `test/`).**

- Стенд — в `tools/synthetic-camera` (Michelle, Xbot, ground truth на кадр). Новые сценарии: контровой свет, тёмная комната, пёстрый фон, второй человек сзади, частичный выход из кадра, дрейф, дрожание, планка на коленях, кивок вместо движения корпусом.
- Playwright с `--use-file-for-fake-video-capture` и CPU-делегатом. Утверждения по сегментам, как в `e2e.mjs`: знак и амплитуда оси, проблема распознана за ≤ 0,8 с, калибровка за ≤ 2,5 с, нет ложных пауз.
- На время миграции набор гоняется **против legacy и нового приложения** с отчётом о разнице.
- `window.__plank` типизирован и есть только в тестовой сборке; боты используют `demo` и `replay`. На PR — короткие видео, ночью — вся матрица.

**9.3 Визуальная регрессия и a11y.**

- `toHaveScreenshot` по `/_dev/gallery` и ключевым экранам с seed-демо.
- Матрица: тёмная и светлая тема × ru/en/uz/псевдолокаль (+40% длины, U+02BB) × 390×844, 844×390, 1280×800. Анимации выключены, тест ждёт `document.fonts.ready`.
- Состояния HUD снимаются с `Emulation.setEmulatedVisionDeficiency` (deuteranopia, protanopia, achromatopsia).
- axe на каждом экране, проверка горизонтального переполнения (как в `ui.mjs`).

**9.4 Реальные устройства.**

Парк: iPhone SE 2/3 (iOS 17), 12/13 (18.x), 15+ (26 и текущая 27), iPad; слабый Android (3–4 ГБ, Helio G8x или Snapdragon 4xx), средний (Snapdragon 7xx), Pixel; Windows с встроенной графикой, macOS Safari, Firefox.

Чек-лист: доступ к камере (выдача, запрет, повтор); калибровка в реальных комнатах; p50/p95 на CPU и GPU; 10 минут — fps и нагрев; Wake Lock во вкладке и PWA; «Без звука»; Bluetooth и калибровка задержки; звонок, Siri, блокировка; установка и обновление; холодный старт в авиарежиме; стирание данных Safari через 7 дней; нехватка места; поворот и split view; VoiceOver и TalkBack; узбекский на латинице и кириллице.

**9.5 Телеметрия.**

- Ошибки: Sentry SDK → GlitchTip ячейки региона через `tunnel`. `beforeSend` чистит PII. Кадры, точки тела и данные о здоровье не уходят никогда.
- Сводка за сессию: `{appVersion, mlVersion, tier, delegate, model, mode, inferP50/P95, fps p5, drops%, e2eMs, calibMs, breaks, deviceClass}`. Отправляется батчем через outbox.
- В настройках есть отказ от телеметрии. Кнопка «Отправить диагностику» прикладывает последнюю запись ввода, только с согласия.

## 10. План миграции

**Принципы.**

- Сайт `kaktys281999-sketch.github.io/plank-run/` работает на каждом шаге.
- Все Pages-сайты одного пользователя делят один origin (`*.github.io`) вместе с хранилищем, поэтому SW регистрируем только со `scope: '/plank-run/'`.
- До аккаунтов переезжаем на свой домен; хостинг для РФ выбираем по compliance.md.

| # | Этап | Что делаем | Готово, когда |
|---|---|---|---|
| M0 | Каркас (≈ 3 дня) | Монорепо; прототип как есть в `apps/legacy`, `test/` в `tools/`; Actions собирает Pages; эталонный e2e по legacy | Сайт идентичен, CI зелёный |
| M1 | Логика в TS | `body-input/analyzers`, `game-core`, `games/*/sim`, golden-записи с legacy. Библиотечная сборка `legacy-bridge.js` подменяет в legacy `plank.js` и `filters.js` | Паритет 1e-9, e2e legacy не изменился |
| M2 | Воркер и кэш ML | `fetch-vendor.sh` → 1.1.1 с файлами `vision_wasm_module_internal.*`, воркеры face и pose, ModelStore, бенчмарк. В legacy за флагом `?worker`, потом по умолчанию | p95 rAF ≤ 17 мс с pose в e2e, телеметрия с живого сайта |
| M3 | Новая оболочка | React, роутер, `ui`, ru; `/setup`, `/session` с портированными играми, итоги, история, настройки; перенос `localStorage['plank-run:v1']` в Dexie (тот же origin); деплой в `/plank-run/app/` с `noindex` | Паритет e2e, снимки, axe без ошибок |
| M4 | PWA | SW, офлайн, установка, обновления, Wake Lock, голосовые клипы ru, GlitchTip. В legacy ссылка «Новая версия» | Чек-лист §9.4 пройден |
| M5 | Переключение | `/plank-run/` — новое приложение, legacy в `/classic/` на 2 месяца; редирект сохраняет `?debug`, `?cpu`, `?cdn`; у legacy нет SW | Неделю ошибки и fps не хуже legacy |
| M6 | Онбординг и путь | Анкета, пробная планка ≤ 60 с, план, карта, «Звездопад», Искра, звёзды, призрак рекорда | Онбординг ≤ 4 мин |
| M7 | Ритм | `audio` (GameClock, обязательная калибровка «кивни в такт»), `beatmap`, «Пульс» на Pixi, CC-библиотека, загрузки в OPFS | Синхронизация ≤ 20 мс на A и B |
| M8 | Аккаунты | `apps/api`, `HttpApi`, outbox, токен попытки, пересимуляция, друзья, лига, kudos; провайдеры входа из конфигурации ячейки | Пересимуляция в Node совпадает на 100% записей |
| M9 | Локали и магазины | en, uz-Latn (uz-Cyrl по запросу), TWA | Снимки псевдолокали и uz чистые |

Откат: каждый этап выкладывается отдельным артефактом; legacy доступен до конца M5 и ещё 2 месяца после.

## 11. Открытые вопросы

- Пороги подобраны на синтетике. Нужны записи 10–20 человек (локально, с согласием); формат записи определяется в M1.
- Детерминизм между JavaScriptCore и V8 подтверждает ночной кросс-движковый тест.
- Домен и хостинг блокируют M8, но не M0–M7.
