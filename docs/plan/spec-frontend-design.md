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
| Язык | TypeScript **7.0.2** (нативный `tsgo`), `strict`, `noUncheckedIndexedAccess` | Явный выбор «TS 7 + Biome», как в официальном примере MediaPipe. typescript-eslint не нужен (он требует TS < 6.1). Если инструменту понадобится JS API компилятора, `typescript@6.0.3` ставится только ему |
| Линт и формат | Biome 2.5.15 | Правила `noRestrictedGlobals` и `noRestrictedImports` с overrides по пакетам охраняют детерминизм и границы §2. Строгая изоляция `node_modules` в pnpm не даёт импортировать необъявленный пакет |
| Сборка | Vite 8.3.4, @vitejs/plugin-react 6.1.2, `worker.format: 'es'` | Rolldown, ленивые чанки игр и воркеров |
| UI | React 19.3.1 | Экосистема, Base UI и Motion; ИИ надёжнее всего пишет код на React |
| Роутинг | @tanstack/react-router 1.170 + router-plugin 1.168, file-based, `autoCodeSplitting` | Типизированные search-параметры (`?mode=side`), каждый экран в своём чанке |
| Серверные данные | @tanstack/react-query 5.104 + persist-client | Нужно с этапа аккаунтов. До бэкенда работает адаптер `LocalApi` |
| Клиентское состояние | Zustand 5.0.15 | Настройки, профиль устройства, снимок HUD (10 Гц). Покадровое состояние сюда не кладём |
| Локальная БД | Dexie 4.4.6 + dexie-react-hooks 4.4; OPFS для аудио | Миграции схем, `useLiveQuery` |
| Схемы | Zod 4.6.7 в `shared` | Один контракт для клиента, API и пересимуляции |
| Стили | Tailwind CSS 4.3.3 (`@theme` из токенов) | Токены доступны в CSS и в canvas. Нужен Safari 16.4+, это ниже нашего минимума |
| Headless-компоненты | @base-ui/react 1.9.0 | Доступные Dialog, Tabs, Slider, Switch, Radio, Toast |
| Анимация UI | motion 14.4 (`LazyMotion` + `domAnimation`) | Пружины и layout-анимации. В играх только свои твины |
| Иконки | @phosphor-icons/react 2.1.10 | Начертания Bold и Fill читаются издалека |
| Шрифты | @fontsource-variable/onest 5.3.1 и /unbounded 5.3.0 | OFL, свой хостинг, подмножества latin(-ext) и cyrillic(-ext) |
| i18n | @inlang/paraglide-js 2.29 + `Intl.*` | Сообщения компилируются в функции, забытый ключ ломает сборку |
| ML | @mediapipe/tasks-vision **1.1.1** (в `vendor/` сейчас 1.0.1 без `*_module_internal.*`) | Module wasm в воркере, делегаты CPU и GPU. WASM прибавит около 1,76 МБ (+15%). Путь nosimd не поставляем: module-сборки без SIMD нет, а на iOS 17+ SIMD есть |
| 2D-рендер | Canvas2D; pixi.js 8.22.0 для «Пульса» и «Титана» | Батчинг и фильтры нужны только тяжёлым играм |
| PWA | vite-plugin-pwa 2.0.0 (`injectManifest`), Workbox 7.4.1 | Свой SW с явными маршрутами |
| Тесты | Vitest 5.0.5 (fake-indexeddb 6.2, fast-check 4.10), @playwright/test 1.64.1, @axe-core/playwright 4.14 | См. §9 |
| Ошибки и метрики | @sentry/react 11.8 → self-hosted GlitchTip в ячейке региона; web-vitals 6.2 + свой `/telemetry` | По 152-ФЗ иностранный SaaS не может получать ПДн прямо из браузера пользователя из РФ |

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
| game-core | shared | DOM, React; в `sim/`: `Math.random`, `Date`, `performance`, `Math.sin/cos/exp/pow/hypot` |
| games/* | game-core, shared; pixi.js только во `view.ts` | body-input, audio, React; DOM в `sim.ts` |
| body-input | shared, tasks-vision | React, game-core, games |
| audio | shared | React, games |
| beatmap | shared, game-core (rng) | DOM (работает в воркере и в Node) |
| ui | react, base-ui, motion, phosphor, i18n | body-input, games, audio |
| apps/web | всё | — |
| apps/api | shared, game-core, `games/*/sim` | ui, body-input, audio |

Ключевое правило: `sim.ts` любой игры должен импортироваться в Node, на нём держится серверная пересимуляция.

## 3. BodyInput

### 3.1 Конвейер

```
CameraManager (1 MediaStream на сеанс) → <video> ─rVFC(meta)→ FrameSource
  createImageBitmap(video) → postMessage({seq,tCapture,image},[image])   ≤1 кадр в полёте на воркер
VisionWorker[face|pose]: detectForVideo → image.close() → Analyzer (features → form → calibration → control)
  → {BodyFrame, actions, inferMs} → Provider (кольцевая история 2 с) → latest() / sampleAt() / события
```

### 3.2 Камера и кадры

- **Один поток на сеанс.** `getUserMedia({video:{facingMode:'user', width:{ideal:640}, height:{ideal:480}, frameRate:{ideal:30,max:30}}, audio:false})` вызывается один раз. Между экранами треки не останавливаем: в iOS до 17.2 это вызывало повторный запрос разрешения. Микрофон не запрашиваем никогда, иначе Web Audio приглушается, а AirPods переходят в режим гарнитуры (HFP).
- **Сбои камеры.** На `ended` и `mute` ставим паузу с причиной `camera` и переподключаемся. Ошибки сводим к кодам прототипа (`insecure | unsupported | denied | notfound | busy`) и показываем платформенную инструкцию.
- **Выбор и превью.** На ноутбуке камеру можно выбрать (`enumerateDevices`). Превью зеркалим только через CSS. В фоне через 60 с треки останавливаем.
- **Время кадра.** Кадр берём в `requestVideoFrameCallback`. `tCapture` = `metadata.captureTime`, а если его нет, `expectedDisplayTime` минус один кадр. Без rVFC опрашиваем `currentTime` в rAF, как в прототипе.
- **Передача кадра.** Базовый путь — `createImageBitmap(video)` с transfer. `VideoFrame` включается флагом только после замера. `MediaStreamTrackProcessor` не используем: в Chrome он есть только в Window, в Safari 18+ только в воркере.
- **Backpressure.** Пока воркер занят, кадр не создаём и считаем как `dropped`. Частоту инференса ограничивает уровень устройства (§8).
- **Часы воркера.** У воркера свой `timeOrigin`. При `init` передаём `clockOffset`, и все `t*` пересчитываются в шкалу главного потока.

### 3.3 Воркеры

- `face.worker.ts` и `pose.worker.ts`, у каждого свой экземпляр WASM. Загрузчику передаём детерминированный query `?task=face|pose`, а в SW ставим `ignoreSearch`. Иначе вторая задача падает с `ModuleFactory not set.`
- Переключение lite и full пересоздаёт задачу в том же воркере.
- Ошибка GPU при создании или на первом кадре → переход на CPU внутри воркера и событие `delegateChanged`. Это перенос `fallbackToCpu` из прототипа.
- Ошибки воркера пересылаются в трекер без данных кадра.

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

Провайдер выбирает `ProviderRegistry` по `manifest.needs`, режиму камеры и уровню устройства.

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
- Анализатор — чистый TS. Один и тот же код работает в воркере, Vitest и Node.

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

Состояние `warn` новое. Оно включается в двух случаях: сырая проблема уже есть, а дебаунс ещё держит «ок»; или метрика дошла до 70% порога. Так янтарное предупреждение звучит раньше паузы.

### 3.7 Калибровка

Состояния:

1. `searching` — человека в кадре нет.
2. `positioning` — чек-лист прототипа: лицо и расстояние, а сбоку тело в кадре, горизонт, упор, ноги, линия.
3. `holding` — заполняется кольцо 1,5 с.
4. `done`.

Перекалибровка доступна в любой момент: клавиша R, меню паузы, а после трёх `moved` подряд голос предлагает вернуться на место. Для «Высоты» и «Пульса» позже появится калибровка диапазона («качнись влево и вправо»), она задаёт личный `CONTROL_RANGE`. Сохраняются только диапазоны: baseline позы пересчитывается в каждой сессии.

### 3.8 Задержка

На каждом кадре меряем `queueMs`, `inferMs`, `analyzeMs`, `captureToResult` и `resultToPresent` (до следующего rAF). Их сумма — оценка «движение → экран». Она видна в отладочной панели (`?debug`, клавиша D), уходит в телеметрию как p50 и p95 и сдвигает окно судейства в ритм-игре. В e2e задержку меряем от ступеньки сценария до пересечения осью 50% амплитуды.

### 3.9 Бенчмарк и откат

- **Когда.** При первом входе в режим, при смене версии ML или UA.
- **Как.** 2 с на CPU, затем 2 с на GPU, если есть WebGL2 в OffscreenCanvas и рендерер не SwiftShader. Кадры живые, а без камеры используется встроенный тестовый кадр.
- **Выбор.** GPU берём, только если его p50 < 0,8 × p50 CPU и ошибок не было. Профиль `{uaHash, mlVersion, model, delegate, p50, p95, tier}` сохраняется в IDB.
- **Сторож.** Если p95 выше бюджета уровня 5 с подряд, снижаем ступенчато: full → lite → 30/20/15 Гц → камера 480×360 → предложение перейти в режим «спереди».

### 3.10 Модели и кэш

- **Пути.** Файлы раздаются с нашего origin: `/ml/tasks-vision@1.1.1/vision_wasm_module_internal.{js,wasm}` и `/ml/models/<name>.<sha8>.task`. При сборке генерируется `ml-manifest.json` (url, байты, sha256). CDN-откат прототипа остаётся только dev-флагом `?cdn`.
- **Загрузка.** `ModelStore.ensure(['wasm','face'])` качает файлы потоком (`ReadableStream`), считает прогресс по байтам из манифеста, проверяет sha256 через `crypto.subtle` и кладёт в Cache `ml-1.1.1`. Воркер запрашивает те же URL и получает их через SW по CacheFirst.
- **Интерфейс.** Сообщение «Скачиваем модель позы: 3,1 из 5,8 МБ» и кнопка отмены. При `saveData` предупреждаем. После загрузки показываем значок «Работает без интернета».
- **Объёмы.** Режим «спереди» — около 4,1 МБ gzip, «сбоку» с lite — около 9 МБ. Модель full скачивается по запросу и только на уровне A. Старые `ml-*` удаляются в `activate`.

## 4. API игровых плагинов

### 4.1 Цикл и жизненный цикл

`SessionRunner` (game-core) ведёт автомат сессии:

```
setup → calibrating → countdown(3 с) → active ⇄ formPaused(≤4 с) ⇄ rest → ended
```

Есть и отдельные паузы: `hidden`, `interrupted`, `camera`, `user`. Константы прототипа сохраняются: `END_AFTER 4`, отсчёт 3, вехи каждые 15 с, «ещё десять секунд». Интервалы задаёт планировщик прогрессии.

Цикл: `acc += frameMs; while (acc ≥ 16,667 && steps < 5) { sim.step(sampleInput(tick), tick); dispatch(sim.events()); tick++ } view.render(acc / 16,667)`. Если за кадр набирается больше 5 шагов, остаток отбрасывается, чтобы задержка не копилась. HUD публикуется в Zustand с частотой 10 Гц.

Плагин проходит путь: `manifest.load()` → `createSim(seed, params, world)` → `createView(sim, ctx)` → `preload()` → `onPhase(...)` → шаги → `summary()` → `dispose()`. Вне фазы `active` `sim` стоит, а `view` продолжает анимировать курсор за телом, как `update(dt, false)` в прототипе.

### 4.2 Детерминизм

- **RNG.** sfc32 с инициализацией cyrb128 от строки seed. Отдельные потоки: `rng.fork('spawn')`, `rng.fork('wander')`. Частицы во `view` используют свой `renderRng`, он не влияет на очки.
- **Математика.** `Math.sin/cos/exp/pow/hypot` в V8 и JavaScriptCore могут расходиться в последнем бите, а пересимуляция на сервере идёт в Node. Поэтому `sim` пользуется `dmath`: полиномы и таблицы на `+ − × ÷` и `Math.sqrt` (он корректно округляется).
- **Ввод.** `q = round(clamp(v, −1, 1) × 127)`, и живая `sim` тоже читает `q/127`. Ввод снимается 30 раз в секунду (на нечётном тике повторяется), поэтому живая игра и реплей совпадают бит в бит.
- **Мир.** Нормализованные координаты; соотношение сторон фиксируется в `WorldSpec`, размер экрана на мир не влияет.

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

Запись хранится в бинарном контейнере, сжатом `CompressionStream('gzip')`: около 2–3 КБ на минуту. Она лежит в IDB и нужна для призрака (вторая `sim` с тем же seed, полупрозрачная), баг-репорта (`?provider=replay`) и отправки на сервер вместе с итогом. Точки тела не пишутся никогда.

### 4.5 HUD, итоги, сложность, звук

- **HUD.** Главную цифру (время в хорошей технике) рисует **оболочка**. Игра отдаёт не больше двух показателей, комбо и метку. HUD собран в DOM поверх canvas: текст чёткий, доступен скринридеру и масштабируется через `--view-scale`. Игра не рисует под HUD (`safeRect`).
- **Итоги.** `GameSummary` вместе с метриками оболочки (`held`, `formPct`, `breaks`, `reason`) проверяется схемой `SessionResultSchema`.
- **Сложность.** Осей две (progression §9). Физическую задаёт планировщик: интервалы и `maxShiftsPerMin` 12, 20 или 30. Игровая живёт в `params`: скорость, плотность, ширина ворот, окно. `DdaController` держит успех 65–85% в окне из 20 событий с шагом ±5%. Первые 30 с интервала и при флаге усталости он не вмешивается. Промах во время `warn` или `broken` в окно не попадает.
- **Звук.** Игры не трогают Web Audio. Событие несёт `sfx` и `at`, а `AudioEngine` проигрывает токен (§6.8) с панорамой по позиции. Ритм-игра получает `GameClock` — время песни по `AudioContext`. Калибровка «кивни в такт» обязательна на всех платформах; `outputLatency` служит только начальным приближением, потому что Apple его поддержку нигде не подтверждала. Ввод ритм-игра берёт через `sampleAt(tCapture − задержка)`, и в запись попадают уже выровненные отсчёты. Голосом говорит только оболочка.

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
- **Общие правила:** DPR ≤ 2 (B: 1,5; C: 1), никаких аллокаций в горячем цикле, обработка `webglcontextlost`. Рендер в OffscreenCanvas внутри воркера пока не делаем: выигрыш не доказан.

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

Брейкпоинты: < 600, 600–1024, > 1024. Ориентацию ловим через `@media (orientation)`, для карточек используем container queries, отступы берём из safe-area. Маршрут `/_dev/*` (галерея, отладка конвейера) существует только в dev и тестовой сборке.

**Без рук.**

- После калибровки игра стартует сама, отсчёт голосом.
- При срыве техники игра встаёт на паузу и сама продолжается, когда поза вернулась. Срыв дольше 4 с завершает интервал.
- Меню внутри сессии работает по удержанию: `DwellButton` (корпус держим на кнопке 1,2 с, вокруг заполняется кольцо) для «ещё подход» и «закончить».
- Клавиши: Space — пауза, Esc — выход, R, D и C работают как в прототипе.
- В сессии нет целей меньше 64 px. Итоги зачитываются голосом. Тосты обновления и установки во время сессии не показываются.

**Голос.** Каталог `voice.*` (тексты из `VOICE` прототипа) с приоритетами: безопасность > техника > отсчёт > вехи > похвала. Любая фраза — не чаще раза в 2,5 с, та же самая — не чаще раза в 4 с; фраза с более высоким приоритетом прерывает текущую. На время голоса музыка приглушается на 9 дБ. В каждом интервале звучит «Дыши ровно, не задерживай дыхание». Источник — записанные клипы (ru, затем uz и en), запасной вариант — `speechSynthesis`. Каждая фраза дублируется субтитром.

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

- **Шрифты.** Onest — интерфейс; это единственный проверенный шрифт с полным узбекским покрытием (U+02BB и Ғ Қ Ҳ). Unbounded — заголовки и цифры; в нём нет Ғ Қ Ҳ, поэтому стек `"Unbounded", "Onest", system-ui`, а для `:lang(uz-Cyrl)` заголовки целиком набираются Onest.
- **Загрузка.** Предзагружаем два cyrillic-woff2. У fallback-шрифта задаём `size-adjust`, `ascent-override` и `descent-override`, чтобы таймер не прыгал при подмене. Unbounded капсом не набираем: «ПЕРЕКАЛИБРОВАТЬ» не влезет в экран телефона. Линтер i18n заменяет `'` и `‘` на U+02BB.
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
- **Одна модель для меню и игр.** Та же параметрическая модель рисуется на canvas (`drawIskra`): шар «Тоннеля» и курсор «Пульса» — это и есть Искра. Скины задаются параметрами.
- **Rive** можно подключить позже за тем же интерфейсом `mood`. При reduced motion вместо анимации — смена поз.

### 6.7 Иконки и доступность

- **Иконки:** Phosphor Bold, Fill для активных; 24/32 в меню, 48+ в сессии. Знаки ●▲✕ — свои SVG.
- **Базовые требования WCAG 2.2 AA:**
  - контраст по §6.2, цвет никогда не единственный канал (1.4.1);
  - цели 56/64 px (2.5.8 с запасом);
  - видимый фокус (2.4.7, 2.4.11), полная навигация с клавиатуры;
  - `lang` меняется вместе с локалью, у меню нет лимитов времени.
- **Скринридер:** HUD объявляется через `aria-live="polite"` не чаще раза в 5 с, срыв техники — через `assertive`, один раз.
- **Вспышки:** `FlashLimiter` пропускает не больше 3 в секунду (2.3.1). Полноэкранных красных вспышек нет, пульс в такт идёт на малой площади. Есть настройка «Без вспышек».
- **Меньше движения:** reduced motion убирает тряску, параллакс, частицы и конфетти, смысловые переходы остаются. Собственный переключатель «Меньше движения» действует поверх системного.

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

Сессия всегда тёмная. Меню следуют системной теме, есть ручной переключатель. Флаг темы читается из `localStorage` до первой отрисовки, чтобы не было вспышки. `theme-color` меняется вместе с темой.

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

- Wake Lock запрашиваем при старте сессии и повторно на `visibilitychange`. В установленной PWA на iOS до 18.4 он не работает. По заметкам Safari 17 экран не гаснет, пока включена камера, но это надо проверить на устройстве; на всякий случай подсказываем выключить автоблокировку. На Android при старте вызываем `requestFullscreen` (на iPhone его нет).
- При `hidden`: пауза, `AudioContext.suspend()`, инференс останавливается, через 60 с отключается камера. При возврате показываем «Нажми или замри, чтобы продолжить»: iOS нужен жест для `resume()`. Состояние `interrupted` (звонок, Siri) тоже ставит паузу.
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
- **Паритет:** `legacy/js/plank.js` и новый TS прогоняются на одних и тех же записанных точках (синтетика и добровольцы). `control`, `issue` и `formOk` должны совпасть с точностью 1e-9.
- `rng` и `dmath`; round-trip `inrec/1`.
- Детерминизм игр: хэши чекпоинтов.
- Property-тесты (fast-check): ворота достижимы при `maxShiftsPerMin`, линтер чартов, планировщик не выходит за пределы безопасности (удержание ≤ 45 с, тест ≤ 60 с, +1 уровень за сессию).
- Миграции Dexie, полнота сообщений.

**9.2 Синтетическая камера (развитие `test/`).**

- Стенд переезжает в `tools/synthetic-camera`. Персонажи Michelle и Xbot, у каждого кадра JSON с ground truth.
- Новые сценарии: контровой свет, тёмная комната, пёстрый фон, второй человек сзади, частичный выход из кадра, дрейф, дрожание, планка на коленях, кивок вместо движения корпусом.
- Playwright с `--use-file-for-fake-video-capture` и CPU-делегатом. Утверждения по сегментам, как в `e2e.mjs`: знак и амплитуда оси, проблема распознана за ≤ 0,8 с, калибровка за ≤ 2,5 с, нет ложных пауз.
- На время миграции тот же набор гоняется **против legacy и против нового приложения**, отчёт показывает разницу.
- `window.__plank` остаётся, но типизирован и есть только в тестовой сборке. Боты работают через провайдеры `demo` и `replay`.
- На PR — короткие видео, ночью — вся матрица.

**9.3 Визуальная регрессия и a11y.**

- `toHaveScreenshot` по `/_dev/gallery` и ключевым экранам с seed-демо.
- Матрица: тёмная и светлая тема × ru/en/uz/псевдолокаль (+40% длины, U+02BB) × 390×844, 844×390, 1280×800. Анимации выключены, тест ждёт `document.fonts.ready`.
- Состояния HUD снимаются с `Emulation.setEmulatedVisionDeficiency` (deuteranopia, protanopia, achromatopsia).
- axe на каждом экране, проверка горизонтального переполнения (как в `ui.mjs`).

**9.4 Реальные устройства.**

Парк: iPhone SE 2/3 (iOS 17), 12/13 (18.x), 15+ (26 и текущая 27), iPad; слабый Android (3–4 ГБ, Helio G8x или Snapdragon 4xx), средний (Snapdragon 7xx), Pixel; Windows с встроенной графикой, macOS Safari, Firefox.

Чек-лист:

1. Выдача, запрет и повторная выдача доступа к камере.
2. Калибровка спереди и сбоку в реальных комнатах.
3. p50/p95 инференса на CPU и GPU.
4. 10 минут: fps и нагрев.
5. Wake Lock во вкладке и в PWA.
6. Переключатель «Без звука».
7. Bluetooth-наушники и калибровка задержки.
8. Звонок, Siri, блокировка экрана.
9. Установка и обновление.
10. Холодный старт в авиарежиме.
11. Стирание данных Safari через 7 дней.
12. Нехватка места.
13. Поворот экрана, split view.
14. VoiceOver и TalkBack.
15. Узбекский текст на латинице и кириллице.

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
| M0 | Каркас (≈ 3 дня) | pnpm-монорепо; прототип без изменений в `apps/legacy`, `test/` в `tools/`; Actions собирает Pages; эталонные прогоны e2e против legacy | Сайт идентичен, CI зелёный |
| M1 | Логика в TS | `body-input/analyzers`, `game-core`, `games/*/sim`, golden-записи с legacy. Библиотечная сборка `legacy-bridge.js` подменяет в legacy `plank.js` и `filters.js` | Паритет 1e-9, e2e legacy не изменился |
| M2 | Воркер и кэш ML | tasks-vision 1.1.1, воркеры face и pose, ModelStore, бенчмарк. В legacy за флагом `?worker`, потом по умолчанию | p95 rAF ≤ 17 мс с pose в e2e, телеметрия с живого сайта |
| M3 | Новая оболочка | React, роутер, токены, шрифты, `ui`, ru. Экраны `/setup`, `/session` с портированными играми, итоги, история, настройки. Миграция `localStorage['plank-run:v1']` в Dexie (тот же origin). Деплой в `/plank-run/app/` с `noindex` | Паритет e2e, снимки, axe без ошибок |
| M4 | PWA | SW, офлайн, установка, обновления, Wake Lock, голосовые клипы ru, GlitchTip. В legacy ссылка «Новая версия» | Чек-лист §9.4 пройден |
| M5 | Переключение | `/plank-run/` отдаёт новое приложение, legacy переезжает в `/classic/` на 2 месяца. Редирект сохраняет `?debug`, `?cpu`, `?cdn`. У legacy нет SW, снимать нечего | Неделю ошибки и fps не хуже legacy |
| M6 | Онбординг и путь | Анкета, пробная планка ≤ 60 с, план, карта, «Звездопад», Искра, звёзды, призрак рекорда | Онбординг ≤ 4 мин |
| M7 | Ритм | `audio` (GameClock, «кивни в такт»), `beatmap`, «Пульс» на Pixi, CC-библиотека, загрузки в OPFS | Синхронизация ≤ 20 мс на A и B |
| M8 | Аккаунты | `apps/api`, `HttpApi`, outbox, токен попытки, пересимуляция, друзья, лига, kudos; провайдеры входа из конфигурации ячейки | Пересимуляция в Node совпадает на 100% записей |
| M9 | Локали и магазины | en, uz-Latn (uz-Cyrl по запросу), TWA | Снимки псевдолокали и uz чистые |

Откат: каждый этап выкладывается отдельным артефактом; legacy доступен до конца M5 и ещё 2 месяца после.

## 11. Открытые вопросы

- Пороги анализатора подобраны на синтетике. Нужны записи 10–20 человек (локально и с согласием); формат записи определяется в M1.
- `VideoFrame` и `createImageBitmap` с `resize*` в Safari нужно замерить до включения.
- Детерминизм между JavaScriptCore и V8 надо подтвердить ночным кросс-движковым тестом.
- Домен и хостинг блокируют M8, но не M0–M7.
