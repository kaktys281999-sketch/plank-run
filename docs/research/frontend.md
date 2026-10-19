# Фронтенд-архитектура и платформенные подводные камни

*Исследование на 19.10.2026. Источники: реестр npm (версии на эту дату), MDN browser-compat-data 8.1.6 (данные о поддержке, скачаны пакетом), заметки о выпусках Safari с developer.apple.com, GitHub MediaPipe (issue, официальные примеры, код пакета tasks-vision 1.1.1). Плюс собственный замер в headless Chromium. Ограничения: лимит веб-поиска кончился в середине работы. WebFetch к MDN, webkit.org, web.dev и ai.google.dev падал с ошибкой DNS, поэтому официальные таблицы задержек MediaPipe я не видел. Пометка **(н/п)** значит, что факт в этой сессии не проверялся и его нужно проверить на устройстве.*

## 1. Кратко

- **Оболочка:** SPA на React 19 + Vite 8 + TanStack Router/Query + Zustand. SSR не нужен: всё ценное работает на клиенте (камера, ML, игры), а SEO нужно только лендингу. Его отдаём статикой.
- **Игры не живут в React.** У каждой игры свой `<canvas>` и свой цикл. React только монтирует хост и рисует меню и HUD. Рендер: Canvas 2D для простых игр, PixiJS v8 как основной 2D-движок, Three.js только для настоящего 3D.
- **ML уходит в module worker.** В tasks-vision ≥ 0.10.35 это работает без хаков через `FilesetResolver.forVisionTasks(path, true)`, я проверил на 1.1.1. Кадр передаётся как `ImageBitmap` (transfer), в полёте не больше одного кадра. Главный поток получает готовые нормализованные сигналы.
- **Ловушка:** вторая задача MediaPipe в том же module worker падает с ошибкой `ModuleFactory not set.` Правило: **один воркер на одну модель**, или уникальный query у загрузчика для каждой задачи.
- **Аудио:** свой тонкий движок на Web Audio. Часы игры берём из `AudioContext`, учитываем `outputLatency` и ручную калибровку. Tone.js и howler не нужны.
- **PWA:** vite-plugin-pwa 2.0 (Workbox 7.4) со стратегией `injectManifest`. В precache идёт только оболочка. WASM (13,5 МБ, 3,9 МБ в gzip) и модели скачиваются явно, по выбору режима, в версионированный Cache.
- **Минимальные платформы:** iOS/iPadOS 17+, где есть WebGL в OffscreenCanvas и полный Storage API. Полноценно с iOS 18.4+: Wake Lock в установленной PWA, Ogg Opus и `outputLatency`. На Android актуальный Chrome.

## 2. Рекомендуемый стек

| Слой | Выбор | Версия (npm, 19.10.2026) | Комментарий |
|---|---|---|---|
| Язык | TypeScript | 6.0.3 | typescript-eslint 8.72 требует TS < 6.1. TS 7.0.2 (нативный) можно брать вместе с Biome 2.5 вместо ESLint |
| Сборка | Vite + @vitejs/plugin-react | 8.3.4 / 6.1.2 | Vite 8 собирается на Rolldown, `worker.format: 'es'` |
| UI | React | 19.3.1 | Больше всего примеров и библиотек, ИИ-ассистент пишет на нём надёжнее всего |
| Роутинг | @tanstack/react-router | 1.170 | Типизированные search-параметры, ленивые маршруты (каждая игра в своём чанке) |
| Данные сервера | @tanstack/react-query (+ persist-client) | 5.104 | Кэш и офлайн-повторы запросов к бэкенду |
| Состояние клиента | Zustand | 5.0.15 | Настройки и сессия тренировки. Покадровое состояние игр сюда не кладём |
| Схемы | Zod | 4.6 | Общие типы с бэкендом (`packages/shared`) |
| Локальная БД | Dexie (IndexedDB) + OPFS | 4.4.6 | Метаданные в IDB, аудиофайлы в OPFS |
| 2D-рендер | PixiJS | 8.22.0 | WebGL/WebGPU, батчинг спрайтов, фильтры |
| 3D (по необходимости) | three | 0.186 | Напрямую, без R3F (у R3F 9.8 peer `react <19.4`) |
| ML | @mediapipe/tasks-vision | **1.1.1** (сейчас 1.0.1) | `delegate` бывает только `"CPU"` или `"GPU"` (GPU = WebGL2) |
| PWA | vite-plugin-pwa / Workbox | 2.0.0 / 7.4.1 | Vite 8 поддерживается с 1.3.0 |
| i18n | Paraglide JS (или i18next) | 2.29 / 26.5 | Paraglide компилирует сообщения в типизированные функции: забытый ключ ловится на сборке |
| Тесты | Vitest, Playwright | 5.0.5 / 1.64.1 | |
| Ошибки | @sentry/react | 11.8 | Или совместимый self-hosted GlitchTip (н/п) |
| Монорепо | pnpm workspaces (Turborepo позже) | pnpm 12.14 / turbo 2.11 | |
| Натив | Bubblewrap (TWA), Capacitor | 1.27 / 8.5 | См. §11 |

**Почему не Next.js, SvelteKit, SolidStart или Nuxt.** SSR и RSC добавляют сервер, гидрацию и сложности с офлайном, но ничего не дают приложению, которое целиком живёт на камере и canvas. Svelte и Solid легче React, но здесь это не важно: горячий цикл (игра и ML) живёт вне фреймворка. Решает экосистема и то, насколько уверенно ИИ-ассистент пишет код. Лендинг делаем отдельной статикой (`apps/landing`, хоть простым HTML или Astro 7) на том же домене, приложение кладём под `/app/` со `scope` манифеста `/app/`.

## 3. Модули и интерфейсы

```
apps/web            Vite SPA (PWA): маршруты, экраны, онбординг, GameHost
apps/landing        статический лендинг (SEO), опционально
packages/body-input провайдеры face|pose|keyboard|demo, воркеры, анализ планки, One Euro
packages/game-kit   интерфейсы Game, цикл, хост canvas, утилиты (без React)
packages/games/*    tunnel, rhythm, … (каждый — плагин, ленивый импорт)
packages/audio      AudioEngine, GameClock, планировщик, декодирование, хранилище треков
packages/beatmap    формат (zod), анализ онсетов/BPM (в воркере), генератор карт
packages/shared     zod-схемы профиля, сессий, настроек; константы
packages/ui         React-компоненты дизайн-системы
packages/i18n       сообщения ru/en/uz
tools/test-assets   синтетические рендеры, .y4m для фейковой камеры
```

Правила зависимостей: `games/*` зависят только от `game-kit` и `shared`. Они не знают ни про React, ни про MediaPipe. `body-input` и `audio` тоже не зависят от React. `apps/web` всё собирает вместе. Пакеты внутренние, без своей сборки: `exports` указывает на `src/*.ts`, и Vite компилирует их сам. Turborepo понадобится, когда CI станет медленным. Одному разработчику на старте хватит `pnpm -r`.

```ts
// packages/body-input — нормализованный вход «телом»
export type ProviderKind = 'face' | 'pose' | 'keyboard' | 'demo';
export type FormIssue = 'sag' | 'pike' | 'standing' | 'kneesDown' | 'lost';

export interface BodyFrame {
  t: number;                 // время ЗАХВАТА кадра, ms в шкале performance.now()
  present: boolean;
  quality: number;           // 0..1
  control: { x: number; y: number };   // −1..1 после калибровки и One Euro
  form: { ok: boolean; issue?: FormIssue; metrics: Record<string, number> };
  landmarks?: Float32Array;  // только для отладочного оверлея
}

export type BodyAction =
  | { type: 'calibrated' } | { type: 'formBroken'; issue: FormIssue }
  | { type: 'formRestored' } | { type: 'lost' } | { type: 'found' }
  | { type: 'pulse'; dir: 'left' | 'right' | 'up' | 'down'; t: number }; // «удар» для ритм-игры

export interface BodyInputProvider {
  readonly kind: ProviderKind;
  readonly caps: { formCheck: 'none' | 'basic' | 'strict'; axes: ('x' | 'y')[]; typicalLatencyMs: number };
  init(o: { stream?: MediaStream; view: 'front' | 'side'; delegate?: 'CPU' | 'GPU'; signal: AbortSignal }): Promise<void>;
  start(): void;
  stop(): void;
  dispose(): void;
  recalibrate(): void;
  latest(): BodyFrame | null;                         // pull: игра читает в своём цикле
  onFrame(cb: (f: BodyFrame) => void): () => void;    // push: HUD, запись сессии
  onAction(cb: (a: BodyAction) => void): () => void;
}
```

```ts
// packages/game-kit — контракт плагина игры
export interface GameManifest {
  id: string; titleKey: string; version: string;
  needs: { axes: ('x' | 'y')[]; formCheck?: 'basic' | 'strict'; music?: boolean; pulses?: boolean };
  renderer: 'canvas2d' | 'pixi' | 'three';
  load(): Promise<{ default: GameFactory }>;          // динамический import → отдельный чанк
}
export type GameFactory = (ctx: GameContext) => GameInstance;

export interface GameContext {
  canvas: HTMLCanvasElement; dpr: number; locale: string; reducedMotion: boolean;
  input: Pick<BodyInputProvider, 'latest' | 'onAction'>;
  clock: GameClock;          // для ритм-игры: время песни, иначе performance.now()
  audio: AudioEngine;        // sfx + музыка
  rng(): number;             // детерминированный (seed) для тестов и реплеев
  emit(e: GameEvent): void;  // score/combo/finished → оболочка (не чаще ~10 Гц)
}
export interface GameInstance {
  start(): void; pause(reason: 'form' | 'hidden' | 'user' | 'audio-interrupted'): void; resume(): void;
  update(dtMs: number, nowMs: number): void;        // фиксированный шаг
  render(alpha: number): void;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
}
export interface GameClock { now(): number; fromPerf(perfMs: number): number }
```

`GameHost` (React-компонент) создаёт canvas, вызывает `factory(ctx)` и крутит `requestAnimationFrame` с фиксированным шагом. На `visibilitychange` он ставит игру на паузу. HUD подписан на `emit` через Zustand с троттлингом, так что React не перерисовывается 60 раз в секунду.

## 4. Главный поток и воркеры

**Поток данных:**

```
getUserMedia(video only, 640×480@30) → <video>  ──rVFC──► createImageBitmap(video)
   └─ postMessage({bitmap, t}, [bitmap])  (не больше 1 кадра в полёте, иначе кадр пропускаем)
Worker «face» или «pose»: tasks-vision (module wasm) → detectForVideo → bitmap.close()
   → анализ планки + One Euro + дебаунс (чистый TS, тот же код, что в тестах)
   → postMessage(BodyFrame ~100 байт)  ──► главный поток: input.latest() для игры
```

- **Как подтверждено.** Issue #5257 («importScripts в module worker») закрыт 27.04.2026. Мейнтейнер пишет, что начиная с 0.10.35 всё работает «без полифилов и хаков». Официальный пример `mediapipe-samples-web` вызывает `FilesetResolver.forVisionTasks(wasmPath, true)` в воркере `{ type: 'module' }`, шлёт `ImageBitmap` через transfer и откатывается с GPU на CPU с диагностикой (нет OffscreenCanvas, нет WebGL2, SwiftShader). В коде пакета 1.1.1 `useModule=true` выбирает файл `vision_wasm_module_internal.js`. **Варианта nosimd для него нет**, поэтому нужен WASM SIMD (Safari 16.4+, Chrome 91+).
- **Классический воркер как запасной путь.** В пакете есть IIFE-бандл `vision_bundle.js` (глобальный `Vision`). Его подключают через `importScripts` вместе с обычным wasm и nosimd-вариантом. Это нужно только для очень старых устройств.
- **Ловушка с двумя задачами.** Каждая задача MediaPipe создаёт **свой экземпляр WASM-модуля**: загрузчик сбрасывает `ModuleFactory` после использования. В module worker повторный `import()` того же URL берётся из кэша модулей, и вторая задача падает. Поэтому официальный пример дописывает к `wasmLoaderPath` параметр `?cb=Date.now()`. Для PWA лучше детерминированный суффикс (`?task=pose`) и `ignoreSearch` в маршруте Service Worker, иначе офлайн-кэш не совпадёт. Проще всего держать **один воркер на одну модель**.
- **GPU-делегат в воркере** требует WebGL2 в OffscreenCanvas: Safari 17+, Chrome 69+. Библиотека сама создаёт `OffscreenCanvas`, а в Safari < 17 его не использует. На слабых Android ML и рендер игры дерутся за один GPU. Поэтому по умолчанию ставим **CPU (XNNPACK)**. GPU включаем только если 2-секундный бенчмарк при первом запуске показал выигрыш, и запоминаем результат для устройства.
- **WebGPU-делегата** в публичном API tasks-vision 1.1.1 нет. В заметках о выпусках упоминаются только внутренние WebGPU-калькуляторы.
- **Альтернативы для захвата.** `MediaStreamTrackProcessor` в воркере есть в Safari 18+. В Chrome он доступен только в Window. `VideoFrame` поддерживается в Safari 16.4+ и Chrome 94+. Для единого кроссбраузерного пути достаточно `createImageBitmap(video)`.
- **Время кадра.** Метку `t` берём в колбэке `requestVideoFrameCallback` (Safari 15.4+, Chrome 83+, Firefox 132+) и несём её через воркер. Попадания в ритм-игре судим по времени захвата, а не по времени прихода результата.

**Замер** (headless Chromium из Playwright 1.56, контейнер с 4 vCPU, без GPU, CPU-делегат, синтетическое видео 640×480@15). На главном потоке крутится rAF-цикл, который имитирует игру: 4 мс работы на кадр. Это **не цифры телефона**, а сравнение архитектур:

| Сценарий | Инференс p50 / p95, мс | Интервал rAF p50 / p95, мс |
|---|---|---|
| FaceDetector, главный поток | 15,5 / 22,9 | 16,7 / 16,7 (max 117) |
| FaceDetector, module worker | 23,7 / 32,0 | 16,7 / 16,8 |
| Pose lite, главный поток | 56,7 / 81,5 | **50 / 83** (игра падает до ~20 fps) |
| Pose lite, module worker | 71,6 / 93,2 | **16,7 / 16,7** |
| Pose full, module worker | 89 / 158 | 16,7 / 16,7 |
| Face + pose lite в одном воркере | ошибка `ModuleFactory not set.` | |
| То же с уникальным query загрузчика | 37 + 60 (последовательно) | 16,7 / 16,7 |

Вывод: в воркере сам инференс чуть медленнее (копия кадра, конкуренция за ядра), зато кадр игры перестаёт зависеть от модели. Для pose это решающая разница.

## 5. Модели

| Модель | Размер файла | gzip | Когда |
|---|---|---|---|
| WASM vision (1.1.1, module) | 13,5 МБ | 3,9 МБ | всегда |
| blaze_face_short_range | 0,23 МБ | 0,20 МБ | фронтальный режим |
| pose_landmarker_lite | 5,8 МБ | 5,0 МБ | боковой режим (по умолчанию) |
| pose_landmarker_full | 9,4 МБ | 8,4 МБ | «строгая техника» на сильных устройствах |

- **Две модели одновременно** (face + pose, pose + hands) дают два WASM-экземпляра, примерно вдвое больше памяти и CPU. Планке это не нужно: спереди работает лицо, сбоку поза. Если понадобится, ставим два воркера и снижаем частоту второй модели (например, 30 + 10 Гц). Можно взять и `HolisticLandmarker` (лицо + руки + поза одним графом, есть в 1.1.1), но он тяжелее любой одиночной модели (н/п, нужно замерить).
- **FaceLandmarker** (478 точек) для руления избыточен, BlazeFace хватает.
- **Альтернативы.** `@tensorflow-models/pose-detection` (MoveNet) не обновлялся с 08.2023. ONNX Runtime Web 1.30 и LiteRT.js 2.5 (WebGPU/WebNN, запускает `.tflite`) потребуют самим писать детектор, ROI-трекинг и постобработку. Остаёмся на MediaPipe Tasks. Интерфейс `BodyInputProvider` позволит позже подменить реализацию без правок игр.

## 6. Рендеринг игр

- **Canvas 2D** годится для текущего туннеля и простых игр: ноль зависимостей, предсказуемо работает на слабых Android. Ограничиваем `devicePixelRatio` до 2 (до 1,5 на слабых) и не создаём объекты в горячем цикле.
- **PixiJS v8** берём для ритм-игры (дорожки, частицы, спрайты, тексты, шейдерные эффекты). На мобильных явно ставим `preference: 'webgl'`, WebGPU включаем после тестов. Pixi импортируем напрямую из кода игры: @pixi/react 8.0.5 (последний выпуск 12.2025) здесь не нужен, игра не должна жить в дереве React.
- **Phaser 4** вышел 10.04.2026 (последний 4.2.1, 07.2026), с новым рендерером и восстановлением контекста. Но это целый движок со своими сценами, вводом, звуком и состоянием, а у нас всё это уже есть в `body-input`, `audio` и `game-kit`. Лишний слой и лишние килобайты.
- **Three.js** берём только если игра правда трёхмерная. **Babylon.js** слишком тяжёл для PWA с бюджетом на первую загрузку.
- Обрабатываем `webglcontextlost`/`restored`. ML-делегат в воркере на CPU, чтобы не делить с игрой GPU и лимит WebGL-контекстов.

## 7. Аудиодвижок для ритм-игры

(Подробности по синхронизации и картам в `beatmap-audio.md`. Здесь только архитектура.)

- **Один `AudioContext`** на всё приложение. Создаём и `resume()` по нажатию «Начать». В Safari новые контексты приостановлены до жеста пользователя.
- **Часы:** `songTime = ctx.currentTime − startAt − outputLatency − userOffset`. Связь с `performance.now()` даёт `getOutputTimestamp()` (Chrome 57+, Safari 14.1+). `outputLatency` есть в Chrome 102+, Firefox 70+ и **Safari 18.4+**. Где его нет, берём `baseLatency` и обязательную калибровку «тапни в бит» для каждого устройства вывода. Bluetooth добавляет сотни миллисекунд, поэтому калибровку повторяем при смене устройства.
- **Планировщик** с lookahead (~100 мс, тик 25 мс) для SFX и метронома. Трек играет один `AudioBufferSourceNode`, запущенный в известный момент `ctx.currentTime`. Tone.js 15.1 (последний выпуск 04.2025) умеет то же (`lookAhead: 0.1` по умолчанию), но тянет лишний вес. howler 2.2.4 (2023) в HTML5-режиме не даёт точной синхронизации.
- **Память.** `decodeAudioData` хранит PCM в Float32: 4 минуты × 48 кГц × 2 канала × 4 байта ≈ **92 МБ**. Поэтому ограничиваем длину трека (≤ 6–7 мин), держим декодированным только текущий трек и отпускаем ссылки после игры. Анализ BPM и онсетов делаем в воркере по даунмиксу в моно. В Chrome 94+ и Safari 26+ доступен потоковый `AudioDecoder` (WebCodecs).
- **Форматы.** MP3, AAC/M4A и WAV читаются везде. **Ogg Opus/Vorbis в Safari только с 18.4.** Для встроенной библиотеки поставляем AAC или MP3. Пользовательский файл проверяем пробным декодированием и показываем понятную ошибку.
- **Хранение пользовательских треков:** OPFS (`navigator.storage.getDirectory`, Safari 15.2+, Chrome Android 109+). Пишем через `createSyncAccessHandle` в воркере: `createWritable` в Safari появился только в 26. Метаданные и beatmap кладём в IndexedDB. После установки вызываем `navigator.storage.persist()`.
- **Голосовые подсказки.** Узбекских голосов `speechSynthesis` на устройствах может не быть (н/п). Надёжнее заранее записанные короткие клипы на ru/en/uz, а TTS использовать как запасной вариант.

## 8. PWA и офлайн

- **vite-plugin-pwa 2.0** со стратегией `injectManifest` (свой SW на Workbox 7.4). В **precache** идёт только оболочка: HTML, JS/CSS чанки, иконки, шрифты, модель лица (0,23 МБ). Лимит Workbox `maximumFileSizeToCacheInBytes` по умолчанию 2 МиБ (2 097 152 байта): WASM и модели поз молча не попадут в precache. Это кстати: незачем качать 15–25 МБ при первом визите и при каждом обновлении.
- **ML-ассеты:** держим на своём origin, без jsDelivr и Google CDN: это нужно для офлайна, CSP и стабильности. Runtime-маршрут `CacheFirst` в кэш `ml-v{версия tasks-vision}` с `ignoreSearch: true`. Прогреваем его явно при выборе режима, с прогрессом («Скачиваем модель: 5 МБ»), по образцу `model-cache.ts` из официального примера (Cache API, потоковая запись). Старые версии удаляем в `activate`.
- **Обновления:** `registerType: 'prompt'`. Тост «Есть новая версия» показываем только в меню и никогда во время подхода. После согласия вызываем `skipWaiting` и перезагружаем страницу. Схемы данных версионируем (Dexie `version().upgrade`).
- **Установка.** `beforeinstallprompt` есть только в Chromium: там показываем свою кнопку. В iOS показываем инструкцию «Поделиться → На экран Домой». С iOS 26 любой сайт можно сделать веб-приложением.
- **Офлайн-синхронизация:** локальная БД главная, изменения уходят в outbox, отправка при запуске и по `online`. Background Sync (SyncManager) в Safari нет, `periodicSync` есть только в Chromium. На них не рассчитываем.
- Web Push на iOS работает только в установленной PWA (16.4+). Разрешение просим после жеста и только в режиме standalone.

## 9. Бюджет производительности

Целевые значения, которые надо подтвердить на устройствах. Это не замеры.

| Метрика | Цель (средний Android, iPhone 12+) | Нижняя граница (слабые) |
|---|---|---|
| FPS игры | 60 | стабильные 30, автоснижение качества |
| update + render на главном потоке | ≤ 8 мс/кадр | ≤ 16 мс |
| Камера | 640×480 @ 30 | 480×360 @ 15–24 |
| Частота инференса | face 30 Гц, pose lite 20–30 Гц | 12–15 Гц |
| Время инференса (воркер) | face ≤ 10 мс, pose lite ≤ 30 мс | ≤ 60 мс, иначе предлагаем фронтальный режим |
| Задержка «движение → экран» | ≤ 150 мс | ≤ 250 мс (геймдизайн это допускает) |
| Ошибка синхронизации аудио после калибровки | ≤ 20 мс | ≤ 40 мс |
| Память вкладки | ≤ 250 МБ | ≤ 200 МБ: только lite, трек ≤ 5 мин |
| JS оболочки при первой загрузке | ≤ 250 КБ gzip | |
| Загрузка ML | фронт ≈ 4,2 МБ, бок (lite) ≈ 9 МБ gzip | |

Включаем телеметрию производительности в Sentry или свою: p50/p95 инференса, fps, делегат, модель устройства. Без кадров и без лиц.

## 10. Платформенные подводные камни

| Проблема | Платформы | Что делать |
|---|---|---|
| Wake Lock не работал в установленной PWA | iOS 16.4–18.3 | Исправлено в 18.4. Повторно запрашиваем на `visibilitychange`. Запасной вариант: при активной камере экран не должен гаснуть (исправление в разделе WebRTC заметок Safari 17, проверить на iPhone), подсказка про автоблокировку |
| Повторный запрос доступа к камере после перезапуска веб-приложения | iOS < 17.2 | Исправлено в 17.2. Один поток `getUserMedia` на всю сессию, не останавливаем треки между экранами |
| `requestFullscreen` для элементов на iPhone нет | iPhone (iPad частично) | Режим `standalone` в манифесте + `viewport-fit=cover`, safe-area |
| AudioContext приостановлен до жеста, состояние `interrupted` (звонок, Siri) | Safari (все), Chrome 136+ | `resume()` в обработчике нажатия, слушаем `statechange`, при `interrupted` ставим игру на паузу с экраном «Нажми, чтобы продолжить» |
| Звук при включённой камере, переключатель «Без звука» | iOS | `getUserMedia({ audio: false })`. `navigator.audioSession.type = 'playback'` (AudioSession API, Safari 16.4+). Поведение с беззвучным режимом проверить на устройстве (н/п) |
| Ogg Opus/Vorbis | Safari < 18.4 | Библиотека в AAC/MP3, пробное декодирование загрузок |
| Нет `outputLatency` | Safari < 18.4 | `baseLatency` + ручная калибровка для каждого устройства вывода |
| ITP: 7-дневное удаление хранилища, в которое пишут скрипты | Safari во вкладке | У установленной PWA свой счётчик дней, но в баг-трекере есть жалобы на разлогин. Сервер хранит основную копию, `persist()`, тяжёлые треки сохраняем только после установки |
| Нет `createWritable` в OPFS | Safari < 26 | `createSyncAccessHandle` в воркере (15.2+) или Blob в IndexedDB |
| `beforeinstallprompt` нет | Safari, Firefox | Своя инструкция по установке |
| `importScripts` в module worker | tasks-vision < 0.10.35 | Обновиться до 1.1.x, вызывать `forVisionTasks(path, true)` |
| Вторая задача в том же module worker: `ModuleFactory not set.` | tasks-vision 1.1.1 (замерено) | Один воркер на модель или уникальный query + `ignoreSearch` в SW |
| Для module wasm нужен SIMD | Safari < 16.4 | Классический воркер с `vision_bundle.js` и nosimd или главный поток |
| GPU-делегат медленный или падает (SwiftShader, часть Android) | CI, слабые устройства | CPU по умолчанию, бенчмарк при первом запуске, откат с GPU на CPU |
| Камера останавливается в фоне или при блокировке | iOS, Android | Пауза игры, пересоздание потока при возврате, слушаем `ended`/`mute` у трека |
| Bluetooth-наушники: задержка сотни мс и дрейф | все | Учитываем `outputLatency`, повторная калибровка на `devicechange`, широкие окна попадания |
| `ScreenOrientation.lock` и `vibrate` недоступны | iOS | `orientation` в манифесте, вёрстка под обе ориентации; вместо вибрации звуковые сигналы |
| Нет голосов TTS для uz, TTS молчит до жеста | iOS/Android | Заранее записанные клипы |

## 11. Тесты, ошибки, флаги, i18n

- **Vitest 5:** фильтры, анализ планки, beatmap, часы. Главный приём: **записанные последовательности точек** (JSON из синтетики и с реальных добровольцев) прогоняются через анализатор, на выходе ожидаемые события. Это быстро и не требует браузера.
- **Playwright 1.64:** e2e в Chromium с `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=…` (форматы y4m и mjpeg), уже работает в `test/`. В CI делегат CPU: GPU на SwiftShader в прототипе давал 190–900 мс на кадр. Для логики игр берём провайдер `demo` с детерминированным seed. Безголовый WebKit камеру не эмулирует (н/п), поэтому iOS проверяем руками на реальных устройствах по чек-листу §12.
- **Sentry 11:** ошибки из воркеров пересылаем через `postMessage`, `beforeSend` вычищает PII, кадры и точки не отправляем. Ставим `tunnel` против блокировщиков.
- **Фича-флаги:** на старте `config.json` с бэкенда (zod-схема, SW-стратегия `NetworkFirst`) + переопределение через `?flag=`/localStorage. GrowthBook или PostHog подключаем, когда понадобятся A/B-тесты.
- **i18n:** ru/en/uz, `Intl.PluralRules` и `Intl.NumberFormat`. Голосовые клипы версионируем вместе с текстами.

## 12. Обёртка в натив и что сломается

- **Android, TWA (Bubblewrap):** тот же Chrome, поэтому камера, WASM, Service Worker и Wake Lock работают как в PWA. Нужны Digital Asset Links. Самый дешёвый путь в Google Play.
- **Capacitor 8:** на iOS `WKWebView` сам выдаёт разрешение на захват медиа (`decisionHandler(.grant)` в мосте), но в Info.plist нужен `NSCameraUsageDescription`. На Android мост переводит `VIDEO_CAPTURE` в runtime-разрешение `CAMERA`, его надо объявить в манифесте. Что ломается: origin меняется на `capacitor://localhost` или `https://localhost`, поэтому данные PWA (IndexedDB, OPFS) автоматически не переносятся, нужна синхронизация через аккаунт. Service Worker в iOS WebView требует App-Bound Domains (н/п). Web Push надо заменить нативным плагином. Есть риск отказа в App Store по guideline 4.2 для «просто сайта» (н/п). Поэтому сначала PWA + TWA, а Capacitor/iOS только когда появятся нативные причины: HealthKit, фоновая работа, покупки.

**Проверить на реальных устройствах (iPhone SE/12, средний и слабый Android):** инференс face/lite/full на CPU и GPU, температуру за 10 минут, поведение звука с камерой и в беззвучном режиме, Wake Lock в установленной PWA, `outputLatency` с AirPods, лимит памяти на треке 6 минут.

## Источники

- MediaPipe issue #5257 (module worker, закрыт 27.04.2026): https://github.com/google-ai-edge/mediapipe/issues/5257
- Коммит официального примера (убраны полифилы): https://github.com/google-ai-edge/mediapipe-samples-web/commit/60663492aced1c45f5c30a32719ed3c521f13b17
- Официальный пример, базовый воркер (`forVisionTasks(wasmPath, true)`, `?cb=`, откат на CPU): https://raw.githubusercontent.com/google-ai-edge/mediapipe-samples-web/main/src/workers/base-worker.ts
- Воркер позы (ImageBitmap → detectForVideo → close): https://raw.githubusercontent.com/google-ai-edge/mediapipe-samples-web/main/src/workers/pose-landmarker.worker.ts
- Цикл захвата с transfer: https://raw.githubusercontent.com/google-ai-edge/mediapipe-samples-web/main/src/components/base-vision-task.ts
- Кэш моделей на Cache API: https://raw.githubusercontent.com/google-ai-edge/mediapipe-samples-web/main/src/components/model-cache.ts
- Конфиг Vite примера (`worker.format: 'es'`): https://raw.githubusercontent.com/google-ai-edge/mediapipe-samples-web/main/vite.config.ts
- Выпуски MediaPipe: https://github.com/google-ai-edge/mediapipe/releases
- tasks-vision в npm (версии, состав пакета 1.1.1): https://registry.npmjs.org/@mediapipe/tasks-vision
- MDN browser-compat-data 8.1.6 (вся поддержка API в документе): https://registry.npmjs.org/@mdn/browser-compat-data
- MDN, outputLatency: https://developer.mozilla.org/docs/Web/API/AudioContext/outputLatency
- caniuse, baseLatency: https://caniuse.com/mdn-api_audiocontext_baselatency
- web.dev, синхронизация аудио и outputLatency: https://web.dev/articles/audio-output-latency
- Safari 18.4 (Wake Lock в веб-приложениях с экрана Домой, Ogg Opus/Vorbis): https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes
- Safari 16.4 (Web Push в веб-приложениях с экрана Домой, AudioSession, Wake Lock): https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-16_4-release-notes.json
- Safari 17 (WebGL в OffscreenCanvas, Storage API, камера не даёт уснуть экрану): https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-17-release-notes.json
- Safari 17.2 (повторный запрос камеры в веб-приложении): https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-17_2-release-notes.json
- Safari 18 (MediaStreamTrack в dedicated worker): https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-18-release-notes.json
- Safari 26 (WebGPU, любой сайт как веб-приложение, AudioDecoder, File System WritableStream): https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-26-release-notes.json
- WebKit bug 254545 (Wake Lock в веб-приложениях с экрана Домой): https://bugs.webkit.org/show_bug.cgi?id=254545
- Progressier, Wake Lock (исправлено в iOS 18.4): https://progressier.com/pwa-capabilities/screen-wake-lock
- WebKit, Updates to Storage Policy: https://webkit.org/?p=14403
- WebKit bug 237350 (разлогин PWA через 7 дней): https://bugs.webkit.org/show_bug.cgi?id=237350
- W3C Audio Session, explainer: https://raw.githubusercontent.com/w3c/audio-session/main/explainer.md
- Phaser v4.0.0: https://github.com/phaserjs/phaser/discussions/7274 ; https://phaser.io/news/2026/05/phaser-3-vs-phaser-4
- Выпуски vite-plugin-pwa: https://github.com/vite-pwa/vite-plugin-pwa/releases
- Workbox (`maximumFileSizeToCacheInBytes` по умолчанию 2097152): https://registry.npmjs.org/workbox-build
- typescript-eslint (peer TS < 6.1): https://registry.npmjs.org/typescript-eslint
- LiteRT.js (WebGPU/WebNN): https://registry.npmjs.org/@litertjs/core
- Capacitor, iOS-мост (выдача доступа к медиа): https://raw.githubusercontent.com/ionic-team/capacitor/main/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift
- Capacitor, Android-мост (`onPermissionRequest`): https://raw.githubusercontent.com/ionic-team/capacitor/main/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java
- Chromium, фейковая камера из файла (y4m/mjpeg): https://raw.githubusercontent.com/chromium/chromium/main/media/capture/video/file_video_capture_device.cc
- Версии остальных пакетов взяты из `https://registry.npmjs.org/<пакет>` на 19.10.2026.
