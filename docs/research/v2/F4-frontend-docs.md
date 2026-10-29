# F4. Факты о фронтенде Plank Run (документы и код прототипа)

Дата сборки 29.10.2026. Роль, сборщик фактов. Выводов и рекомендаций нет, только факты с источником. Слово «наблюдение» помечает мои замечания о качестве.

Просмотрено источников 47. Это 4 документа (spec-frontend-design.md 575 строк, research/frontend.md 287, research/verify-frontend-design.md 87, PLAN.md разделы 8.11, 9 и журнал решений D1 до D25), CLAUDE.md проекта, index.html, css/style.css, 19 файлов js/ (config, storage, audio, pose, plank, filters, draw, main, voice, voice-lines, оба файла игр, пять файлов protocol/), 12 файлов test/, tools/, scripts/, board/, assets/voice/manifest.json, обёртка plank-tests и две заметки памяти проекта. Интернет не использовался, поэтому у фактов о внешнем мире (версии npm, поддержка Safari) указаны документы репозитория, а не первоисточники. Даты проверки внутри этих документов 19.10.2026.

Правило ссылок. `файл:строка` относится к репозиторию `plank-run`. Если сказано «спец.», это docs/plan/spec-frontend-design.md. «Исслед.» это docs/research/frontend.md. «Проверка» это docs/research/verify-frontend-design.md. «План» это docs/PLAN.md.

## Оглавление

1. Старшинство документов и состояние на 29.10.2026
2. Выбранный стек и версии
3. Монорepo и структура
4. Конвейер BodyInput
5. API игровых плагинов
6. Экраны и навигация
7. Дизайн-система
8. PWA и офлайн
9. Производительность и уровни устройств
10. Тестирование
11. План миграции с прототипа
12. Как устроен прототип сейчас
13. Что в спецификации устарело или расходится с кодом и планом
14. Не нашёл так

---

## 1. Старшинство документов и состояние на 29.10.2026

- Старшинство по CLAUDE.md проекта: `docs/PLAN.md`, затем спецификации, затем фактчеки, затем исследования (CLAUDE.md, раздел «Главные документы»).
- Спец. помечена «Версия 1, 19.10.2026. Статус: к реализации» (спец.:3). Основа и порядок приоритета поправок названы в спец.:5, поправки из verify-* важнее исследований.
- Исследование frontend.md датировано 19.10.2026 и содержит пометку (н/п) для непроверенного (исслед.:3).
- В PLAN §9 написано, что детали лежат в спец., а основа в frontend.md, design.md и verify-frontend-design.md (план:517 через `sed`, раздел 9).
- Решение D12 (план, журнал). React 19 + Vite 8 + TS 7 + Biome; MediaPipe 1.1.1, модель на воркер; 4 пакета. Основание «Экосистема, замеры, один разработчик».
- Решение D13. Всё со своего адреса, ноль сторонних запросов.
- Решение D14. Рекомендация «Неон + Искра», Onest + Unbounded; владелец выбирает из трёх направлений и утверждает макеты 6 экранов до кода. Это решение сегодня оспорено словами владельца 29.10.2026 («визуал очень не нравится»), в документах пока не обновлено (наблюдение, поиск по PLAN.md на «29.10» ничего не дал, см. раздел 14).
- Решение D17 (SW только на постоянном адресе со scope `/`) и D25 (адрес https://plank.erg-team.ru/, сервер владельца подтягивает `main` раз в 5 минут, GitHub Pages переадресует).
- Решение D19. Этапы 1 и 2 одна альфа-вертикаль. D23. Блоки уровней открываются по флагу «распознавание проверено», в альфе уровни 1 до 12.
- Состояние кода. Весь фронтенд сейчас прототип на ванильных ES-модулях без сборки (`index.html:433` подключает `js/main.js` как `type="module"`). Новых пакетов, `package.json` в корне, `apps/`, `packages/`, TypeScript, React, Vite, service worker и манифеста PWA в репозитории нет (проверено `ls`, `grep serviceWorker|manifest` по index.html и js/, пусто).
- Последние коммиты (git status в начале сессии). da514f9 «CLAUDE.md: journal runs to D25», 079e3e7 постоянный адрес, 6352db7 голосовые клипы. Новее 20.10.2026 в репозитории нет (даты файлов 20.10.2026 при `ls -la`).

## 2. Выбранный стек и версии

Источник. Спец. §1 (строки 17 до 53), подтверждение в план §9.1 и verify.

| Слой | Выбор и версия | Где написано |
|---|---|---|
| Монорепо | pnpm 12.14 workspaces, turbo 2.11 позже | спец.:21 |
| Язык | TypeScript 7.0.2 (нативный tsgo), strict, noUncheckedIndexedAccess. Если инструменту нужен JS API, ставят typescript@6.0.3 | спец.:22 |
| Линт и формат | Biome 2.5.15, `noRestrictedGlobals` и `noRestrictedImports` с overrides по пакетам | спец.:23 |
| Сборка | Vite 8.3.4, @vitejs/plugin-react 6.1.2, `worker.format: 'es'` | спец.:24 |
| UI | React 19.3.1 | спец.:25 |
| Роутинг | @tanstack/react-router 1.170 + router-plugin 1.168, file-based, autoCodeSplitting | спец.:26 |
| Серверные данные | @tanstack/react-query 5.104 + persist-client, с этапа аккаунтов, до бэкенда адаптер LocalApi | спец.:27 |
| Клиентское состояние | Zustand 5.0.15 (настройки, профиль устройства, снимок HUD 10 Гц) | спец.:28 |
| Локальная БД | Dexie 4.4.6 + dexie-react-hooks 4.4, OPFS для аудио | спец.:29 |
| Схемы | Zod 4.6.7 в shared | спец.:30 |
| Стили | Tailwind CSS 4.3.3 (`@theme` из токенов), Safari 16.4+ | спец.:31 |
| Headless-компоненты | @base-ui/react 1.9.0 | спец.:32 |
| Анимация UI | motion 14.4 (LazyMotion + domAnimation) | спец.:33 |
| Иконки | @phosphor-icons/react 2.1.10 (Bold и Fill) | спец.:34 |
| Шрифты | @fontsource-variable/onest 5.3.1 и /unbounded 5.3.0, OFL, свой хостинг | спец.:35 |
| i18n | @inlang/paraglide-js 2.29 + Intl.* | спец.:36 |
| ML | @mediapipe/tasks-vision 1.1.1 (в vendor/ сейчас 1.0.1 без `*_module_internal.*`), WASM +1,76 МБ (+15%) | спец.:37 |
| 2D-рендер | Canvas2D, pixi.js 8.22.0 для «Пульса» и «Титана» | спец.:38 |
| PWA | vite-plugin-pwa 2.0.0 (injectManifest), Workbox 7.4.1 | спец.:39 |
| Тесты | Vitest 5.0.5 (fake-indexeddb 6.2, fast-check 4.10), @playwright/test 1.64.1, @axe-core/playwright 4.14 | спец.:40 |
| Ошибки и метрики | @sentry/react 11.8 → self-hosted GlitchTip в ячейке региона, web-vitals 6.2 + свой /telemetry | спец.:41 |

Список «Не используем» (спец.:43 до 53). Next.js, Remix, SSR/RSC. Phaser, Babylon, R3F (peer react <19.4), @pixi/react. Redux, MobX, XState. Tone.js, howler, essentia.js (AGPL). GSAP, Rive, dotLottie, пока нет аниматора. Runtime CSS-in-JS, MUI. Google Fonts, jsDelivr и storage.googleapis.com в рантайме. Firebase и сторонняя аналитика. `localStorage` для данных (только флаг темы).

Факты проверки версий (verify:44 до 46, 56). react 19.3.1 (14.10.2026), vite 8.3.4 (08.10.2026), plugin-react 6.1.2, pixi.js 8.22.0 (01.10.2026), vite-plugin-pwa 2.0.0 (03.10.2026). Тег latest у typescript указывает на 7.0.2 (08.07.2026), а исслед.:19 называет 6.0.3. Официальный пример MediaPipe уже на `typescript ^7.0.2`, `vite ^8.3.3`, `tasks-vision ^1.1.0` (verify:26). typescript-eslint 8.72 требует TS меньше 6.1 (verify:45).

Что в проверке названо неточным в исследовании (verify, раздел «Что меняет решения», строки 58 до 69).
- Сборка PWA упадёт на 13,5 МБ `.wasm`, а не пропустит его молча. Нужны `globPatterns` и `globIgnores` (verify:60). Спец. это учла (спец.:449).
- Ogg зависит от версии ОС, а не Safari (verify:63).
- `outputLatency` в Safari 18.4 подтверждают только таблицы совместимости, у Apple нет (verify:34, 62).
- Montserrat, Nunito, Tektur тоже под OFL (verify:51, 67).
- Base UI 1.0.0 вышел 11.12.2025 (verify:55).
- Вышли Safari 27 и iOS 27 (14.09.2026), в исследовании их нет (verify:56).
- Rive экспорт платный с 20.10.2025, Cadet 9 долларов в месяц при оплате за год, 17 помесячно. GSAP 3.15 бесплатен, ядро около 27 КБ gzip (verify:47, 48).

Решения по прочему (verify:69). Маскот на SVG + Motion, Rive при бюджете 9 до 17 долларов в месяц, GSAP допустим.

## 3. Монорепо и структура

### 3.1 Версия из спецификации (15 пакетов)

Спец. §2 (спец.:55 до 86).

```
apps/web  apps/api  apps/legacy
packages/shared  body-input  game-core  games/{fireflies,tunnel,starfall,pulse}
packages/audio  beatmap  ui  i18n
tools/synthetic-camera  tools/e2e
```

Пакеты внутренние, без своей сборки, `exports` указывает на `src/*.ts` (спец.:72). Матрица зависимостей (спец.:74 до 84).

| Пакет | Может зависеть от | Запрещено |
|---|---|---|
| shared | zod | всё остальное |
| game-core | shared | React, DOM кроме инъекции; в sim/ Math.random, Date, Math.sin/cos/exp/pow/hypot |
| games/* | game-core, shared, pixi.js только во view.ts | body-input, audio, React, DOM в sim.ts |
| body-input | shared, tasks-vision | React, game-core, games |
| audio | shared | React, games |
| beatmap | shared, game-core (rng) | DOM |
| ui | react, base-ui, motion, phosphor, i18n | body-input, games, audio |
| apps/web | всё | нет |
| apps/api | shared, game-core, games/*/sim | ui, body-input, audio |

Типы сигнала (BodyFrame, BodyAction, CameraMode, SfxId) лежат в shared (спец.:86). Ключевое правило. sim.ts каждой игры импортируется в Node (спец.:86).

### 3.2 Версия из PLAN §9.1 (4 пакета)

План §9.1, абзац «Монорепо — 4 пакета, остальное папками» (план, строка с этим текстом в разделе 9.1).

- Приложения. `apps/web` (оболочка, внутри папки `ui/` с токенами, `audio/`, `beatmap/`, `games/*/view`, `i18n/`), `apps/api` (с Этапа 4), `apps/legacy` (замороженный прототип).
- Пакеты. `shared` (zod), `body-input` (камера, воркеры, анализ планки), `game-core` (шаг, rng, реплей, автомат сессии, DDA и sim.ts всех игр), `progress-core` (прогресс и награды для клиента и сервера).
- Инструменты. `tools/synthetic-camera`, `tools/field-report`, `tools/ingest`.
- Правило. Папка становится пакетом, когда у неё появляется второй потребитель. Причина в плане, «Biome-границы между 15 пакетами — постоянные накладные расходы для одного разработчика».
- Имена `beatmap`, `games/pulse`, `pulse-analysis`, `chart`, `track-store`, `music-picker`, `games/rhythm` из спецификаций в плане названы папками `apps/web`.
- Токены по плану. `apps/web/src/ui/tokens.json` (план §8.3, абзац «Токены»). Спец. называет `packages/ui/tokens.json` (спец.:397).

### 3.3 Что есть в репозитории сегодня

```
index.html (435 строк)   css/style.css (542)   js/ (19 файлов, около 5 900 строк)
board/ (доска направлений)   voices/ (образцы голосов)   assets/voice/ (37 клипов Kore + manifest.json)
vendor/ (tasks-vision 1.0.1 + 3 модели)   tools/{tts,field-report,check-secrets.sh}
scripts/fetch-vendor.sh   test/ (стенд)   art/   docs/   .github/workflows/secret-scan.yml
```

Итого `wc -l` по index.html, css, js/*.js, js/*/*.js 7 362 строк. Размер файлов около 216 КБ (`wc -c`). `package.json` есть только в `test/` (имя plank-run-tests, зависимость three 0.170.0, test/package.json). Сборщика нет.

## 4. Конвейер BodyInput

Источник. Спец. §3 (спец.:88 до 206), исслед. §4 и §5, проверка.

### 4.1 Схема потока

```
CameraManager (1 MediaStream на сеанс) → <video> ─rVFC(meta)→ FrameSource
  createImageBitmap(video) → postMessage({seq,tCapture,image},[image])   ≤1 кадра в полёте на воркер
VisionWorker[face|pose]: detectForVideo → image.close() → Analyzer (features → form → calibration → control)
  → {BodyFrame, actions, inferMs} → Provider (кольцевая история 2 с) → latest() / sampleAt() / события
```
(спец.:93 до 97)

### 4.2 Камера и кадры (спец.:99 до 107)

- Один поток `getUserMedia` на сеанс, 640×480, до 30 fps, `audio:false`. Треки между экранами не останавливаются (причина, повторный запрос в iOS до 17.2). Микрофон не просим (приглушает Web Audio, переводит AirPods в HFP).
- На событиях `ended` и `mute` пауза с причиной `camera` и переподключение.
- Время кадра из `requestVideoFrameCallback`, `tCapture` = `metadata.captureTime` или `expectedDisplayTime` минус кадр. Без rVFC опрос `currentTime` в rAF.
- Базовый путь передачи `createImageBitmap(video)` с transfer. `VideoFrame` только после замера. `MediaStreamTrackProcessor` не используется (в Chrome только Window, в Safari 18+ только в воркере).
- Backpressure. Пока воркер занят, кадр не создаётся, считается `dropped`.
- У воркера свой `timeOrigin`, при `init` передаётся `clockOffset`.

### 4.3 Воркеры (спец.:109 до 126)

- `face.worker.ts` и `pose.worker.ts`, у каждого свой экземпляр WASM. Загрузчику дают детерминированный query `?task=face|pose`, в SW `ignoreSearch`. Иначе вторая задача падает с `ModuleFactory not set.`
- Переключение lite и full пересоздаёт задачу в том же воркере.
- Сбой GPU при создании или на первом кадре, откат на CPU внутри воркера и событие `delegateChanged`.
- Протокол сообщений. ToWorker `init | frame | recalibrate | params | bench | dispose`, FromWorker `ready | result | bench | error`. Типы в спец.:115 до 126.

Подтверждено проверкой. Ошибка `ModuleFactory not set.` воспроизведена повторным бенчем 19.10.2026. `tasks=face,lite` даёт ошибку, `tasks=face,lite&bust` работает (инициализация 901 мс, face p50 38,5 мс, lite p50 84,8 мс, rAF p50 16,7 мс) (verify:27). Механизм, загрузчик после использования делает `self.ModuleFactory=self.Module=void 0`, повторный `import()` берётся из module map (verify:27).

Замер исследователя (исслед.:140 до 152). Headless Chromium, 4 vCPU, без GPU, CPU-делегат, видео 640×480@15, rAF с 4 мс нагрузки. Это не цифры телефона.

| Сценарий | Инференс p50 / p95, мс | Интервал rAF p50 / p95, мс |
|---|---|---|
| FaceDetector, главный поток | 15,5 / 22,9 | 16,7 / 16,7 (max 117) |
| FaceDetector, module worker | 23,7 / 32,0 | 16,7 / 16,8 |
| Pose lite, главный поток | 56,7 / 81,5 | 50 / 83 |
| Pose lite, module worker | 71,6 / 93,2 | 16,7 / 16,7 |
| Pose full, module worker | 89 / 158 | 16,7 / 16,7 |
| Face + pose lite в одном воркере | ошибка | |
| То же с уникальным query | 37 + 60 последовательно | 16,7 / 16,7 |

Подтверждённые факты о MediaPipe.
- Issue #5257 закрыт 27.04.2026, с 0.10.35 module worker работает без полифилов (verify:24). `FilesetResolver.forVisionTasks(path, true)` выбирает `vision_wasm_module_internal.js`. Варианта nosimd для module нет, без SIMD библиотека запросит несуществующий файл (verify:25). Нужен SIMD, Safari 16.4+, Chrome 91+.
- `delegate` бывает только `"CPU"` или `"GPU"`, WebGPU-делегата в публичном API 1.1.1 нет (verify:28; исслед.:136).
- GPU-делегат в воркере требует WebGL2 в OffscreenCanvas, Safari 17+. Safari 16.4 дал только 2D OffscreenCanvas (verify:30).
- tasks-vision latest 1.1.1 (14.10.2026), nightly 1.2.0-rc.20261019. `vision_wasm_module_internal.wasm` 13 519 940 байт, gzip -9 3 936 468 байт. В vendor/ лежит 1.0.1, wasm 11,76 МБ, переход добавляет около 1,76 МБ (verify:29).

### 4.4 Провайдеры (спец.:128 до 139)

| Kind | Источник | Оси | Техника |
|---|---|---|---|
| face | BlazeFace, камера спереди | x, y | basic |
| pose | Pose lite/full, камера сбоку | y | strict |
| keyboard | стрелки, пробел имитирует срыв | x, y | имитация |
| pointer | мышь или палец | x, y | всегда ок |
| demo | бот по seed | x, y | по сценарию |
| replay | InputRecording | из записи | из записи |

`ProviderRegistry` выбирает провайдер по `manifest.needs`, режиму камеры и уровню устройства (спец.:139). В исслед.:59 провайдеров четыре (face, pose, keyboard, demo), pointer и replay добавила спец.

### 4.5 Анализаторы (спец.:141 до 152)

- Перенос `js/plank.js` в TS без изменения чисел. `features/front.ts`, `features/side.ts`, `form.ts` (THRESHOLDS, frontIssue, sideIssue, `analyzerVersion` пишется в каждую запись), `control.ts` (CONTROL_RANGE, чувствительность, One Euro 1,2 / 0,4, ограничение ±1,2), `debounce.ts` (включение 0,25 с, выключение 0,45 с, прощение потери 0,3 с), `calibration.ts` (удержание 1,5 с, разброс по 20 кадрам, медиана по 30, baseline `hipDev` в [−0,05; 0,02]).
- Новое под флагами. Медленный авто-центр (τ около 20 с), индекс дрожания J в полосе 1 до 5 Гц, действия `pulse` (рывок за 300 до 500 мс) и `still`.
- Состояние `warn` включается, когда сырая проблема уже есть, а дебаунс держит «ок», или метрика дошла до 70% порога (спец.:184).

### 4.6 Нормализованный сигнал (спец.:154 до 182)

- `FormIssue` 11 значений `lost, noFace, notVisible, tooFar, moved, standing, lying, noSupport, sag, pike, knees`. `FormState` `unknown | ok | warn | broken`.
- `BodyFrame` `{seq, tCapture, tResult, present, confidence, axes{x,y}, form{state, issue, checks}, calib{state, progress}, metrics?}`. Оси от −1 до 1 (до ±1,2).
- `BodyAction` `calibrated | formBroken | formRestored | lost | found | still | pulse`.
- `BodyInputProvider` методы `init, start, stop, dispose, recalibrate, setParams, latest, sampleAt, on, stats`. Поле `caps` `{axes, formCheck, actions, typicalLatencyMs}`.
- Версия в исслед. отличается (исслед.:62 до 87). Там `BodyFrame` с `t`, `quality`, `control`, `form.ok`, `landmarks?`, `FormIssue` из 5 значений, провайдер с `onFrame/onAction`. Спец. её заменила.

### 4.7 Калибровка (спец.:186 до 188)

Состояния `searching → positioning → holding (кольцо 1,5 с) → done`. Перекалибровка клавишей R, из меню паузы или голосом после трёх `moved` подряд. Позже калибровка диапазона «качнись влево и вправо» для личного CONTROL_RANGE. Сохраняются только диапазоны, baseline считается заново в каждой сессии.

### 4.8 Задержка (спец.:190 до 192)

Метрики на кадре `queueMs, inferMs, analyzeMs, captureToResult, resultToPresent`. Сумма это оценка «движение → экран», видна в панели D, уходит в телеметрию (p50, p95), сдвигает окно судейства ритма. В e2e мерится от ступеньки сценария до 50% амплитуды оси.

### 4.9 Бенчмарк и откат GPU на CPU (спец.:194 до 199; исслед.:135)

- Когда. При первом входе в режим, при смене версии ML или UA.
- Как. 2 с на CPU, затем 2 с на GPU при наличии WebGL2 в OffscreenCanvas и рендерере не SwiftShader.
- Выбор. GPU берётся, если p50 меньше 0,8 × p50 CPU и ошибок не было. Профиль `{uaHash, mlVersion, model, delegate, p50, p95, tier}` в IndexedDB.
- Сторож. Если p95 выше бюджета уровня 5 с подряд, ступени full → lite → 30/20/15 Гц → камера 480×360 → предложение перейти в режим «спереди».
- Основание по умолчанию CPU. На слабых Android ML и рендер игры дерутся за один GPU (исслед.:135). Данные CI. GPU на SwiftShader в прототипе давал 190 до 900 мс на кадр (исслед.:241).

### 4.10 Модели и кэш (спец.:201 до 206; исслед.:154 до 165)

- Пути на своём origin `/ml/tasks-vision@1.1.1/vision_wasm_module_internal.{js,wasm}` и `/ml/models/<name>.<sha8>.task`. При сборке `ml-manifest.json` (url, байты, sha256). CDN-откат только dev-флаг `?cdn`.
- `ModelStore.ensure(['wasm','face'])` качает потоком, прогресс по байтам из манифеста, sha256 через `crypto.subtle`, кладёт в Cache `ml-1.1.1`. Воркер получает файлы через SW CacheFirst.
- Интерфейс. «Скачиваем модель позы: 3,1 из 5,8 МБ», отмена, предупреждение при `saveData`, значок «Работает без интернета».
- Объёмы. Спереди около 4,1 МБ gzip, сбоку с lite около 9 МБ. Full по запросу и только на уровне A. Старые `ml-*` удаляются в `activate`.

| Модель | Размер | gzip |
|---|---|---|
| WASM vision 1.1.1 module | 13,5 МБ | 3,9 МБ |
| blaze_face_short_range | 0,23 МБ | 0,20 МБ |
| pose_landmarker_lite | 5,8 МБ | 5,0 МБ |
| pose_landmarker_full | 9,4 МБ | 8,4 МБ |
(исслед.:156 до 161)

Две модели одновременно дают два WASM-экземпляра и примерно вдвое больше памяти и CPU. Holistic есть в 1.1.1, тяжелее одиночной модели (н/п) (исслед.:163). Альтернативы (MoveNet не обновлялся с 08.2023, ONNX Runtime Web 1.30, LiteRT.js 2.5) отвергнуты (исслед.:165).

## 5. API игровых плагинов

Источник. Спец. §4 (спец.:208 до 309), исслед. §3.

### 5.1 Цикл и жизненный цикл

- Автомат `SessionRunner` (game-core). `setup → calibrating → countdown(3 с) → active ⇄ formPaused(≤4 с) ⇄ rest → ended`. Отдельные паузы `hidden, interrupted, camera, user`. Константы прототипа сохраняются, `END_AFTER 4`, отсчёт 3, вехи каждые 15 с, «ещё десять секунд» (спец.:214 до 218).
- Цикл. `acc += frameMs; while (acc ≥ 16,667 && steps < 5) { sim.step(sampleInput(tick), tick); dispatch(sim.events()); tick++ } view.render(acc / 16,667)`. Шаги сверх пяти отбрасываются. HUD уходит в Zustand 10 раз в секунду (спец.:220).
- Путь плагина `load() → createSim → createView → preload() → onPhase → шаги → summary() → dispose()`. Вне `active` sim стоит, view анимирует курсор (спец.:222).
- Контракт исслед. (исслед.:91 до 116) был проще. `GameFactory(ctx) → GameInstance{start,pause,resume,update(dtMs,nowMs),render,resize,dispose}`, `GameContext` с `input, clock, audio, rng, emit`. Спец. заменила его на пару sim/view.

### 5.2 Детерминизм (спец.:224 до 229)

- RNG sfc32, seed через cyrb128, потоки `rng.fork('spawn')`. Частицы во view берут отдельный `renderRng`.
- В sim вместо `Math.sin/cos/exp/pow/hypot` свой `dmath` (полиномы на + − × ÷ и `Math.sqrt`). Причина, V8 и JavaScriptCore расходятся в последнем бите, сервер считает в Node.
- Ввод квантуется `q = round(clamp(v, −1, 1) × 127)`, живая sim читает `q/127`. Отсчёт 30 Гц повторяется на нечётном тике.
- Мир в нормализованных координатах, пропорции фиксирует `WorldSpec`.
- Уточнение плана §9.1. `dmath` и пересимуляция нужны только с публичными досками (D10), которых нет. Приёмка в альфе, хэш 10 seed × 3 записи совпадает в Node и Chromium. Совпадение с WebKit бит в бит откладывается.

### 5.3 Интерфейсы (спец.:231 до 263)

- `GameManifest<P>` `{id, version, titleKey, hintKey, cameraModes, renderer: 'canvas2d'|'pixi', needs{axes, formCheck?, music?, actions?}, params (zod), defaults(level), load()}`.
- `GameModule<P>` `{createSim(seed, params, world), createView(sim, ctx)}`.
- `GameSim` `step(input, tick)`, `onPhase('warmup'|'active'|'paused'|'rest')`, `events()`, `hud()`, `summary()`, `hash()`. `SimInput` `{x, y, flags, actions}`.
- `ViewContext` `{canvas, theme, reducedMotion, viewScale, safeRect, flash, renderRng, clock}`.
- `GameView` `preload, resize(w,h,dpr,safe), render(alpha, frameMs), onEvent, dispose`.
- `HudModel` (до двух показателей, комбо, метка суждения). `GameSummary` `{score, bestCombo, successRate, accuracy?, stats[]}`.

### 5.4 Запись ввода `inrec/1` (спец.:265 до 279)

Поля `format, id, gameId, gameVersion, coreVersion, analyzerVersion, seed, paramsHash, tickHz 60, inputHz 30, provider, mode, axes Int8Array, flags Uint8Array, actions[{tick, code}], checkpoints[{tick, hash}] каждые 300 тиков, final{score, hash}`. Контейнер сжимается `CompressionStream('gzip')`, 2 до 3 КБ на минуту. Используется для призрака (вторая sim с тем же seed), баг-репорта (`?provider=replay`) и сервера. Точки тела не пишутся никогда.

### 5.5 HUD, итоги, сложность, звук (спец.:281 до 286)

- Главную цифру (время в хорошей технике) рисует оболочка. HUD это DOM поверх canvas, масштаб `--view-scale`, игра не рисует под HUD (`safeRect`).
- Итоги проверяются схемой `SessionResultSchema` вместе с метриками оболочки (`held, formPct, breaks, reason`).
- Сложность две оси. Физическая у планировщика (интервалы, `maxShiftsPerMin` 12, 20 или 30). Игровая в `params`. `DdaController` держит успех 65 до 85% в окне из 20 событий с шагом ±5%, первые 30 с интервала и при флаге усталости не вмешивается, промах во время `warn` и `broken` в окно не попадает.
- Звук. Игры Web Audio не трогают. Событие несёт `sfx` и `at`, `AudioEngine` проигрывает токен с панорамой. Ритм-игре дают `GameClock`. Калибровка «кивни в такт» обязательна везде. Голосом говорит только оболочка.

### 5.6 Перенос двух игр (спец.:288 до 303)

Таблица в спец. перечисляет 9 замен (update(dt) → sim.step, Math.random → rng.fork, Math.exp/hypot/cos/sin → dmath, столкновение в пикселях → мировые единицы, burst() → view.onEvent, onEvent('catch') → GameEvent с sfx, hudStats/summary → HudModel/GameSummary, setDifficultyHorizon/hint → params/manifest, COLORS и shadowBlur → ctx.theme и спрайты). Приёмка, `fireflies-bot` и e2e дают сопоставимый счёт, хэш 10 seed × 3 записи совпадает.

### 5.7 Рендер (спец.:305 до 309)

Canvas2D для «Светлячков», «Тоннеля», «Звездопада», «Высоты». PixiJS (`preference: 'webgl'`, WebGPU после тестов) для «Пульса» и «Титана». DPR не выше 2 (B 1,5, C 1), без аллокаций в горячем цикле, обработка `webglcontextlost`. Исслед.:171 причина отказа от Phaser 4 (вышел 10.04.2026, последний 4.2.1, 07.2026). Three.js только если игра действительно 3D (исслед.:172).

## 6. Экраны и навигация

Источник. Спец. §5 (спец.:311 до 343), план §8.11.

| Маршрут | Экран |
|---|---|
| `/onboarding/*` | Приватность → выбор камеры → анкета Э1 до Э6 (здоровье только локально, не называть «PAR-Q+») → калибровка → пробная планка до 60 с → «Звездопад» 20 с → «твой план» |
| `/` | Карта пути, «Играть», неделя 3/7, Искра |
| `/games` | Выбор игры, карточки 16:9 с превью `demo`, значки «спереди/сбоку» |
| `/music` | Библиотека / Мои файлы |
| `/setup` | Камера, модель, калибровка |
| `/session/$id` | HUD, предупреждение, пауза, отдых |
| `/results/$id` | Итоги, звёзды, «Как было?» (3 кнопки), «Ещё раз» |
| `/me`, `/friends`, `/settings/*` | Прогресс, друзья и лига, настройки (голос, звук, тема, «меньше движения», «крупный режим», язык, приватность, «стереть всё», хранилище) |

- Брейкпоинты менее 600, 600 до 1024, более 1024, плюс `@media (orientation)`, container queries и safe-area. Маршрут `/_dev/*` (галерея, отладка конвейера) только в dev и тестовой сборке (спец.:324).
- Режим «без рук» (спец.:326 до 331). Автостарт и отсчёт голосом, автопауза при срыве и автопродолжение, срыв дольше 4 с завершает интервал. Меню сессии кнопкой `DwellButton` (корпус на кнопке 1,2 с). Клавиши Space, Esc, R, D, C. Цели не менее 64 px. Тосты в сессии не показываются.
- Голос (спец.:333). Каталог `voice.*`, приоритеты безопасность > техника > отсчёт > вехи > похвала, не чаще раза в 2,5 с (та же фраза раз в 4 с), музыка под голосом −9 дБ, «Дыши ровно» в каждом интервале, записанные клипы (ru, затем uz, en), запасной `speechSynthesis`, каждая фраза дублируется субтитром.
- Дистанции и масштаб `--view-scale` (спец.:335 до 343). Телефон спереди около 0,7 м, масштаб 1 (подписи не менее 28 px, значения 56 px, главная цифра 104 px). Ноутбук 1 до 1,5 м, масштаб 1,5 до 2. Сбоку около 3 м, масштаб 4, только цифра и полоса. Правила, один главный объект, подписи 1 до 3 слов, табличные цифры, у новичка на поле не более трёх типов объектов.
- Макеты (план §8.11). Шесть ключевых экранов (карта пути, онбординг, HUD сессии вблизи и издалека, итоги и «Как было?», «Музыка», настройки) делаются кликабельными HTML 390×844 на токенах выбранного направления. Утверждение макетов, ворота UI-работы альфы.

## 7. Дизайн-система

Источник. Спец. §6 (спец.:345 до 445). Всё нижеследующее принято до слов владельца 29.10.2026 и касается направления «Неон + Искра».

### 7.1 Токены (спец.:374 до 397)

- Источник правды `packages/ui/tokens.json`. Из него генерируются `tokens.css` и `tokens.ts` для canvas (`ViewContext.theme`). Цвета прямо в коде игр запрещены.
- Tailwind v4 `@theme`. `--spacing: 4px` (шаги 4 8 12 16 24 32 48 64), радиусы `--radius-sm 10px, --radius 16px, --radius-lg 28px, --radius-pill 999px`, шрифты `--font-display` и `--font-ui`.
- `:root`. `--view-scale`, `--tap 56px`, `--tap-primary 64px`, `--dwell-ms 1200ms`, `--hud-label/value/hero` (28/56/104 px × масштаб), `--elev-1/2` (глубина светлотой, без теней), `--focus-ring`, `--dur-1/2/3` (120/220/420 мс), `--ease-out`, `--ease-back`, `--spring-ui 400 30`, `--spring-mascot 260 14`, `--tint-bad`, `--glow-ok`.
- Медиазапросы. `prefers-reduced-motion` обнуляет `--dur-2`, `--dur-3` и `--glow-ok`. `prefers-contrast: more` поднимает `--text-muted` и `--line`.

### 7.2 Палитра (спец.:351 до 366; пересчёт контраста в verify:53)

| Токен | Hex |
|---|---|
| bg / bg-raised | #0B0D17 / #12152A |
| surface / surface-2 | #161A33 / #1E2347 |
| text / text-muted | #F2F4FF / #A3A9D1 |
| line / line-strong | #2E3566 / #6E78C2 |
| brand / brand-text | #7C6CFF / #A397FF |
| ok (= accent) | #5EF2C2 |
| warn / bad | #FFB547 / #FF5D7A |
| info / coin | #4CC9FF / #FFD25E |

Светлая тема только для меню. Факты контраста. Белый на #7C6CFF даёт 3,86, поэтому на заливке пишется тёмный текст. ok и warn почти не отличаются по светлоте (1,25:1), при дейтеранопии сливаются, поэтому форма обязательна, ● норма, ▲ внимание, ✕ срыв, плюс слово и звук (спец.:366).

### 7.3 Типографика (спец.:368 до 372)

Onest для интерфейса, полное узбекское покрытие. Unbounded для заголовков и цифр, букв Ғ Қ Ҳ в нём нет (verify:49), стек `"Unbounded", "Onest", system-ui`, а для `:lang(uz-Cyrl)` заголовки идут Onest. Предзагрузка двух cyrillic-woff2, fallback с `size-adjust` и override метрик. Unbounded капсом не набирается. Шкалы меню 12/14/16/20/24/32/40/56 px, HUD 28/56/104 px × `--view-scale`.

### 7.4 Компоненты (спец.:399 до 408)

- Базовые. Button (primary, secondary, ghost, danger; 48/56/64), IconButton, Card, ChoiceCard, Segmented, Toggle, Slider, Tabs, Sheet и Dialog, Toast, Badge, Avatar, Skeleton, EmptyState, ProgressBar, ProgressRing.
- В сессии. HeroTimer (кольцо 9% диаметра), StatusBand, FormAlert, CountdownRing, DwellButton, VoiceCaption.
- Подготовка. CalibrationChecklist, CameraPreview с силуэтом, ModelDownloadCard, PermissionCard.
- Метаэкраны. PathMap и PathNode (SVG), GameCard, TrackRow, StarRating, RpeButtons, StreakWeek, LeaderboardRow, KudosButton.
- PWA. InstallSheet, UpdateToast.

### 7.5 Маскот Искра в коде (спец.:410 до 415)

Компонент `<Iskra mood size skin />` на SVG и Motion. Параметры, веки, сжатие, цвет свечения (ok, warn, bad), взгляд за курсором. Состояния `idle, cheer, worry, sad, celebrate, sleep, rest-breathe`. Одна модель для меню и игр, `drawIskra` рисует её на canvas. Rive позже за тем же интерфейсом `mood`. В репозитории черновики Искры лежат как SVG в `board/mascot/` (3 направления × 8 состояний, файлы `neon-*.svg`, `sport-*.svg`, `friend-*.svg`, генератор `board/mascot/build-mascot.mjs`).

### 7.6 Иконки, доступность, звук, темы (спец.:417 до 445)

- Иконки. Phosphor Bold, Fill для активных, 24/32 в меню, 48+ в сессии. Знаки ●▲✕ собственные SVG.
- WCAG 2.2 AA. Цвет не единственный канал, цели 56/64 px, видимый фокус, клавиатура, `lang` по локали. HUD `aria-live="polite"` не чаще раза в 5 с, срыв техники `assertive` один раз. `FlashLimiter` не более 3 крупных вспышек в секунду. Настройки «Без вспышек» и «Меньше движения» (поверх системного). Уточнение проверки, 2.3.1 допускает больше 3 вспышек ниже порога general flash, 2.3.3 уровня AAA (verify:52).
- Звуковые токены. `ui.tap`, `ui.confirm`, `state.ok` (1046 Гц), `state.warn` (440 → 330 Гц), `count.tick` / `count.go` (880 / 1046 Гц), `game.catch` (пентатоника по комбо), `game.coin`, `game.hit`, `goal.reached`. Шины `music`, `sfx`, `voice` и общий лимитер. Тоны прототипа переносятся в `SfxBank`. Вибрации нет.
- Темы. Сессия всегда тёмная, меню следуют системе. Флаг темы читается до первой отрисовки, меняется `theme-color`.
- Сегодняшняя сторона вопроса. Рабочая библиотека иконок, анимаций и компонентов зафиксирована как Phosphor, motion и Base UI (спец.:32 до 34). Пакеты иконок бренд-лого не обсуждаются.

## 8. PWA и офлайн

Источник. Спец. §7 (спец.:447 до 480), исслед. §8 и §10, план §9.4.

- Service worker, Workbox 7.4, `injectManifest`. `globPatterns` и `globIgnores: ['**/ml/**']` обязательны, шаблон по умолчанию `**/*.{js,wasm,css,html}` вместе с `throwMaximumFileSizeToCacheInBytes` роняет сборку на 13,5 МБ WASM (спец.:449; verify:39, 60). Лимит Workbox по умолчанию 2 097 152 байт.
- Стратегии (спец.:451 до 458). HTML, JS/CSS-чанки, шрифты, иконки, звуки, precache (навигация через `createHandlerBoundToURL`). `/ml/**` CacheFirst в `ml-<версия>` с `ignoreSearch`. `/content/*.json` StaleWhileRevalidate. `/music/library/*` CacheFirst после «скачать для офлайна». `/api/**` NetworkOnly. `config.json` NetworkFirst с таймаутом 3 с. План §9.4 добавляет, SW отвечает на Range-запросы, иначе Safari не играет кэшированное аудио.
- Хранилище (спец.:460 до 465). Таблицы Dexie `settings, deviceProfile, profile, plan, progress, sessions (неизменяемые, UUIDv7), recordings, outbox, tracks, analyses, charts, health`. `health` никогда не синхронизируется. По плану §9.4 `profileId` в каждой таблице с первой схемы (семейный режим), outbox с B1. Треки пользователя в OPFS (до Safari 26 через `createSyncAccessHandle` в воркере, иначе `createWritable`, без OPFS Blob в IDB). `storage.estimate()` и «Стереть всё на устройстве». `navigator.storage.persist()` после первой завершённой сессии или установки. Экспорт JSON, потому что Safari во вкладке может стереть данные через 7 дней.
- Обновления (спец.:467). `registerType: 'prompt'`, тост только в меню, применение по согласию или при холодном старте, `vite:preloadError` перезагружает страницу, схемы Dexie через `version().upgrade()`, версия кэша ML меняется независимо.
- Установка (спец.:469 до 473). Chromium, `beforeinstallprompt` откладывается до итогов второй сессии. iOS, `InstallSheet` с инструкцией. С iOS 26 любой сайт открывается как веб-приложение, но манифест (`display: standalone`, иконки, `scope`) нужен (verify:37). Напоминания в M8, Declarative Web Push (18.4+) только в установленной PWA.
- Сессия и фон (спец.:475 до 480). Wake Lock на старте и на каждом `visibilitychange` (в PWA на iOS до 18.4 сломан, verify:31). На Android `requestFullscreen` (на iPhone нет, verify:35). При `hidden` пауза, `AudioContext.suspend()`, инференс останавливается, через 60 с камера отключается. `interrupted` ставит паузу. `navigator.audioSession.type = 'playback'` по спец., но в плане D22 для игр без ритма `ambient`, `playback` только в «Пульсе». Журнал сессии в IDB каждые 5 с и на `pagehide`.
- Платформенные подводные камни (исслед.:215 до 236, 20 строк таблицы). Важнейшие. Wake Lock iOS 16.4 до 18.3, повторный запрос камеры iOS до 17.2, нет fullscreen на iPhone, AudioContext до жеста и состояние `interrupted`, Ogg в Safari только на ОС с 18.4, нет `outputLatency` до 18.4, ITP 7 дней, нет `createWritable` до Safari 26, нет `beforeinstallprompt`, нет `vibrate` и `ScreenOrientation.lock` на iOS, нет TTS-голосов uz.
- Адрес и SW (план §9.5, D17, D25). SW регистрируется только на постоянном адресе plank.erg-team.ru со scope `/`. Причина, 301 с `github.io` ломает обновление SW.
- Натив (исслед.:246 до 251). Android TWA (Bubblewrap 1.27), Capacitor 8.5 с оговорками (origin меняется, SW в WKWebView требует App-Bound Domains, риск отказа App Store по 4.2, н/п). Сначала PWA + TWA.

## 9. Производительность и уровни устройств

Источник. Спец. §8 (спец.:482 до 509).

| Уровень | Критерий (p95 в воркере) | Камера и инференс | Рендер |
|---|---|---|---|
| A | pose lite ≤ 35 мс, face ≤ 12 мс | 640×480@30, face и pose по 30 Гц, full доступна | DPR 2, все эффекты |
| B | pose lite ≤ 60 мс, face ≤ 25 мс | 640×480@30, face 30 Гц, pose 20 Гц | DPR 1,5, меньше частиц |
| C | хуже B | 480×360@24, face 15 до 20 Гц, сбоку «экспериментальный» | DPR 1, без свечения, «Пульс» упрощён |
| нет уровня | нет WASM SIMD или module worker | только демо | нет |

Минимальные платформы. iOS/iPadOS 17+ (полноценно с 18.4), Chrome Android за последние 2 года, десктопные Chrome, Edge, Firefox и Safari 17+ (спец.:493). Уровень определяет бенчмарк, а не UA (спец.:484).

Бюджеты (спец.:495 до 507). Игра 60 fps (C 30). update + render на главном потоке не более 8 мс (C 16). Long tasks более 50 мс ноль. Задержка «движение → экран» не более 150 мс (C 250). Рассинхрон звука после калибровки не более 20 мс (C 40). Память вкладки не более 250 МБ (C 200 МБ, трек не более 5 мин). JS первого экрана / CSS / шрифты (gzip) 180 / 30 / 130 КБ. Чанк игры Canvas / Pixi 60 / 260 КБ. ML один раз 4,1 / 9 МБ. LCP меню (4G, средний Android) 2,5 с. 10 минут игры без троттлинга ниже 30 fps. Бюджеты проверяет CI (size-limit 14 по манифесту Vite), отладочная панель D показывает конвейер.

Исслед.:200 до 211 даёт близкие, но не идентичные числа (JS оболочки не более 250 КБ gzip, ML 4,2 МБ, pose время в воркере до 30 мс на целевом уровне). Спец. позднее и выигрывает.

Целевые значения не подтверждены замером на устройствах (исслед.:198, «Это не замеры»). Единственный замер в документах, headless Chromium в контейнере (раздел 4.3).

## 10. Тестирование

### 10.1 Что говорит спецификация (спец.:511 до 546)

- Модульные тесты Vitest. Фильтры, дебаунс, калибровка, ошибки техники. Паритет `legacy/js/plank.js` и нового TS на одних записанных точках до 1e-9. `rng`, `dmath`, round-trip `inrec/1`, хэши чекпоинтов, property-тесты (fast-check) на достижимость ворот, линтер чартов, пределы безопасности планировщика (удержание не более 45 с, тест не более 60 с, +1 уровень за сессию), миграции Dexie, полнота сообщений.
- Синтетическая камера в `tools/synthetic-camera` (Michelle, Xbot, ground truth на кадр). Новые сценарии, контровой свет, тёмная комната, пёстрый фон, второй человек сзади, частичный выход из кадра, дрейф, дрожание, колени, кивок. Playwright с `--use-file-for-fake-video-capture` и CPU-делегатом. Утверждения, проблема распознана за не более 0,8 с, калибровка за не более 2,5 с, нет ложных пауз. Набор гоняется против legacy и нового приложения. `window.__plank` типизирован и только в тестовой сборке. На PR короткие видео, ночью вся матрица.
- Визуальная регрессия и a11y. `toHaveScreenshot` по `/_dev/gallery`, матрица тема × ru/en/uz/псевдолокаль × 390×844, 844×390, 1280×800. Состояния HUD через `Emulation.setEmulatedVisionDeficiency`. axe на каждом экране, проверка горизонтального переполнения (как в `ui.mjs`).
- Реальные устройства. Парк iPhone SE 2/3 (iOS 17), 12/13 (18.x), 15+ (26 и 27), iPad, слабый и средний Android, Pixel, Windows, macOS Safari, Firefox. Чек-лист 17 пунктов (спец.:540).
- Телеметрия. Sentry SDK → GlitchTip ячейки региона через `tunnel`, `beforeSend` чистит PII, сводка сессии батчем через outbox, отказ от телеметрии в настройках. План D20, телеметрия только с открытой беты B0.5, в альфе локальная статистика и «Отправить отчёт».
- План §9.4. Добавляет «живой золотой набор» из клипов Этапа 0 как ворота M2 и любого изменения порогов, а также линтер приватности. Реальные устройства проверяют владелец и друзья.

### 10.2 Что есть в репозитории (test/)

Стенд называется «синтетический end-to-end» (test/package.json, поле description). Состав.

| Файл | Что делает |
|---|---|
| `test/render.html` (206 строк) | three.js ставит позу риггингового персонажа Mixamo (Michelle.glb) в планку с управляемыми дефектами и рисует вид «спереди» или «сбоку» 640×480 |
| `test/timelines.mjs` (53) | Сценарии с известной правдой, 15 fps. front (stand, neutral, left, right, neutral, drop, neutral, stand, neutral) и side (stand, neutral, forward, back, neutral, sag, neutral, pike, ...) |
| `test/render-videos.mjs` (28) | Рендерит кадры PNG через Playwright и склеивает ffmpeg в `out/front.y4m` и `out/side.y4m` |
| `test/e2e.mjs` (79) | Хромиум с `--use-fake-device-for-media-stream --use-file-for-fake-video-capture`, ставит localStorage `plank-run:v1`, открывает `/?debug&cpu`, опрашивает `window.__plank.state` каждые 100 мс, печатает сводку по сегментам (ctrlX, ctrlY, ok, issues, phases) |
| `test/safety.mjs` (72) | Стоп-вопросы, цели 20/30/45, автоконец на цели. Печатает PASS/FAIL |
| `test/fireflies-bot.mjs` (42) | Бот в демо ведёт указатель к ближайшему светлячку через `window.__plank.game.toScreen/player/flies` |
| `test/ui.mjs` (37) | Демо без камеры, скриншоты экранов на desktop/phone/phone-land, замер горизонтального переполнения |
| `test/protocol.mjs` (315) | Режим `?protocol&fast`, проверка схемы файла, что в нём только производные числа и не более 30 Гц, пересчёт сводки, запуск `tools/field-report` |
| `test/probe*.mjs/html`, `test/stills.mjs` | Вспомогательные, 14 эталонных кадров поз и проба детекторов на PNG |

Факты.
- Тесты берут Playwright из `/opt/node22/lib/node_modules/` (`createRequire`, test/e2e.mjs:5 и аналогично в других). Это путь облачной сессии.
- Сервер на порту 8765 (`npx http-server .. -p 8765`, CLAUDE.md). Тесты ходят на `http://localhost:8765/`.
- `test/out/`, `test/assets/`, `test/node_modules/` в `.gitignore`. Michelle.glb скачивается с raw.githubusercontent.com при подготовке.
- Тесты зависят от production-хуков `window.__plank` (js/main.js:695) и `window.__protocol` (js/protocol/protocol.js:1156), они сегодня в рабочем коде без флага сборки.
- Встроенный Chromium Playwright не играет AAC, в облачных тестах голос уходил в `speechSynthesis` (CLAUDE.md).
- GPU на SwiftShader в прототипе 190 до 900 мс на кадр, поэтому в CI делегат CPU (исслед.:241).
- CI в репозитории один workflow, `.github/workflows/secret-scan.yml` (проверка секретов и gitleaks). Запуска тестов в CI нет.

### 10.3 Как тесты гоняются на маке владельца

- Одна команда `plank-tests` (`~/.local/bin/plank-tests`, POSIX shell, делает `exec node ".../ru.erg.plank-run-tests/run-tests.mjs" "$@"`). Использование `plank-tests [protocol safety fireflies e2e] [--render] [--repo путь]`.
- Без аргументов запускает по очереди protocol (до 12 мин), safety (5), fireflies (5), e2e front 40 (5) (run-tests.mjs:33 до 58).
- Прослойка лежит вне репозитория и вне iCloud, в `~/Library/Application Support/ru.erg.plank-run-tests/` (run-tests.mjs, shim/playwright, закреплены playwright-core 1.64.1 и http-server 14.1.1, каталоги logs, work). Подменяет `chromium.launch` на chrome-safe плюс `connectOverCDP`, переписывает `localhost:8765` на свой свободный порт (заметка памяти plank-run-local-tests.md).
- Подготавливает test/node_modules, Michelle.glb, out/*.y4m. В репозитории `test/assets`, `test/node_modules`, `test/out` это симлинки в `work/` каталога прослойки. Скрыты в `.git/info/exclude`.
- Итог читает по выводу, потому что `safety.mjs` и `e2e.mjs` не ставят код выхода при провале.
- chrome-headless-shell 155 декодирует AAC, поэтому клипы `.m4a` играют.
- Наблюдение. В `test/` лежат также папки `assets 2`, `node_modules 2`, `out 2` (пустые или почти пустые, права drwx------, 20.10.2026 16:15 до 16:18). Похожи на конфликтные копии iCloud. В git не попадают.
- Результаты прогона в этой сессии не запускались, роль только чтение.

## 11. План миграции с прототипа

Есть две версии, спец. §10 (спец.:548 до 569) и план §9.5. План выше по старшинству.

### 11.1 Версия плана §9.5

| Шаг | Что | Готово, когда |
|---|---|---|
| M0 (около 3 дней) | Монорепо, legacy как есть, CI. Пока идёт Этап 0, в ветке без деплоя | Сайт идентичен |
| M1 | Логика в TS после заморозки порогов v0.2, `game-core`, `sim` игр. Legacy не трогаем. Vitest импортирует `js/plank.js` и `js/filters.js` прямо в Node и сравнивает с TS на синтетике и записях Этапа 0 | Паритет 1e-9 |
| M2 | tasks-vision 1.1.1, воркеры, кэш моделей, бенчмарк только в новом приложении | p95 кадра не более 17 мс с позой, золотой набор не хуже 1.0.1 |
| M3 | React-оболочка, сессия, итоги, перенос `localStorage` в Dexie (тот же домен) | Паритет e2e (стенд гоняется против обеих версий), axe чистый |
| M4 | PWA, офлайн, голос ru. SW со scope `/` включается на постоянном адресе вместе с M5 | Чек-лист устройств пройден |
| M5 | Новое приложение по основному адресу, legacy в `/classic/` ещё 2 месяца с пределами v0.1.1 | 5 друзей прислали отчёты без регрессий |

Причина заморозки legacy (план §9.5, «Почему legacy заморожен»). Подмена модулей в живом прототипе (`legacy-bridge.js`, воркеры за флагом `?worker`) превращает legacy в гибрид, это дни работы и риск сломать сайт, в который играют друзья.

### 11.2 Версия спец. §10

M0 каркас (около 3 дней), M1 логика в TS с `legacy-bridge.js`, который подменяет в legacy `plank.js` и `filters.js`, M2 воркер и кэш ML в legacy за флагом `?worker`, M3 новая оболочка с деплоем в `/plank-run/app/` с `noindex`, M4 PWA, M5 переключение (`/plank-run/` новое, `/classic/` legacy на 2 месяца), M6 онбординг и путь (анкета, пробная планка до 60 с, план, карта, «Звездопад», Искра, звёзды, призрак рекорда, онбординг не более 4 мин), M7 ритм (audio, beatmap, «Пульс» на Pixi, CC-библиотека, OPFS, синхронизация не более 20 мс на A и B), M8 аккаунты (apps/api, HttpApi, outbox, пересимуляция, друзья, лига, kudos), M9 локали и магазины (en, uz-Latn, TWA).

Откат. Каждый этап отдельным артефактом, legacy доступен до конца M5 и ещё 2 месяца (спец.:569).

### 11.3 Состояние дорожной карты

- План §12.3 («Ближайшие три недели») и этапы 0 до 4 лежат в PLAN.md:740 и далее. Этап 0 «Живая проверка» с друзьями по `?protocol` владелец 29.10.2026 поставил на паузу («пока что тестирование не будет», из задания). План M1 привязан к заморозке порогов v0.2 по итогам Этапа 0, то есть блокирован паузой (наблюдение, связь из текста плана §9.5 «после заморозки порогов v0.2»).

## 12. Как устроен прототип сейчас

### 12.1 Общая схема

Одностраничное приложение с экранами, переключаемыми атрибутом `body[data-screen]` (css/style.css:32 до 37, `showScreen` в js/main.js:90). Нет роутера, нет сборки, нет TypeScript. Точка входа `index.html:433`, модуль `js/main.js` (730 строк). Состояние в модульных переменных и в `session`. Рендер UI императивный (`textContent`, `innerHTML`, `hidden`).

Экраны (`<main>` и `<section>` в index.html).

| id | Строка | Что |
|---|---|---|
| `#home` | 21 | Настройки (игра, камера, ось, цель 20/30/45, чувствительность, модель lite/full, колени, звук, голос, камера), кнопки «Начать» и «Демо без камеры», история |
| `#safety` | 161 | 4 стоп-вопроса q1 до q4, согласие, ветка «обратитесь к врачу» |
| `#play` | 201 | `<canvas id="game">`, HUD (очки, монеты, комбо, таймер, цель, форма), превью камеры `#cam` с `#video` и `#overlay`, центральное сообщение `#msg` (кольцо, чек-лист калибровки), `#loading`, `#debug` |
| `#results` | 252 | Причина, большое время, сетка итогов, совет |
| `#protocol` | 267 | Шаги согласие, настройка, проверка, прогон, отзыв, готово. Только по `?protocol` |

`index.html` содержит скрипт-переадресацию с `github.io` на plank.erg-team.ru (index.html:5 до 9). `<meta name="theme-color" content="#0b0d17">` (index.html:11). В `<head>` нет manifest, иконок и service worker.

### 12.2 Модули и интерфейсы

| Файл | Строк | Что делает |
|---|---|---|
| `js/config.js` | 43 | `MP_VERSION = '1.0.1'` (js/config.js:8), `SOURCES` (local ./vendor и cdn jsDelivr + storage.googleapis.com), `FLAGS {debug, forceCpu, protocol}` из query |
| `js/pose.js` | 222 | `startCamera(video, {facingMode})` (640×480 ideal, 30 fps max, `audio:false`, js/pose.js:22 до 32), коды `CameraError` (insecure, unsupported, denied, notfound, busy, unknown), `VisionTracker` (init, create, detect, fallbackToCpu, close), `onEveryVideoFrame(video, fn)` (rVFC или rAF) |
| `js/plank.js` | 286 | `LM`, `ISSUE_TEXT`, `THRESHOLDS`, `CONTROL_RANGE` (frontX 0,45, frontY 0,4, sideFB 0,05), `faceFeatures`, `sideFeatures`, `PlankAnalyzer` (update, calibrate, resetCalibration, controlFrom) |
| `js/filters.js` | 70 | `OneEuroFilter`, `Debounced` |
| `js/draw.js` | 73 | `drawSkeleton`, `drawFace`, `clearCanvas` (оверлей над превью камеры) |
| `js/audio.js` | 60 | Класс `Sound`: `unlock`, `prime`, `tone`, `coin`, `pass`, `hit`, `chime`, `warn`, `tick`, `go`, `win`. Все звуки синтезом осцилляторов, файлов нет |
| `js/voice.js` | 231 | Класс `VoicePlayer`: `load` (манифест, декодирование клипов с параллелизмом 6), `play(id, {priority, interrupt})`, `stop`. Запасной путь `speechSynthesis` (русский голос), иначе тихий таймер |
| `js/voice-lines.js` | 61 | `VOICE_LINES` (37 строк), `GAME_LINE_IDS` (17, грузятся в играх) |
| `js/storage.js` | 65 | `localStorage` ключ `plank-run:v1`: `settings`, `safety`, `history` (до 50 сессий). `DEFAULT_SETTINGS`, `TARGETS [20,30,45]` |
| `js/games/fireflies.js` | 396 | Класс `FirefliesGame` |
| `js/games/tunnel.js` | 365 | Класс `TunnelGame` |
| `js/main.js` | 730 | Оркестрация (ниже) |
| `js/protocol/*` | 1 675 | Режим живой проверки (ниже) |

### 12.3 Интерфейс игры в прототипе

Комментарий в js/main.js:44 фиксирует контракт. Каждая игра реализует `setInput({x, y})`, `update(dt, running)`, `render(colors)`, `resume()`, `setDifficultyHorizon(s)`, `hint(camera)`, `hudStats()`, `summary()`, плюс `score` и `combo`. Конструктор `(canvas, {axis, onEvent})`. Реестр игр `GAMES` (js/main.js:46 до 49) задаёт заголовок, допустимые камеры и фабрику. Событие игры идёт в `onEvent(type, data)`, типы `coin, pass, hit, catch, jar` (js/main.js:289 до 298).

Игры (мир в нормализованных координатах).
- «Светлячки». Мир x, y от −1 до 1 (y вверх), игрок это банка, цели нормальные, золотые, лунные (`TYPES`, js/games/fireflies.js:11 до 15), банка 15 штук (`JAR_SIZE`), окно серии 3 с. Цвета светлячков зашиты в `TYPES` (#d8ff6a, #ffd25e, #a8e1ff). Спрайтов и файлов нет, всё рисуется через Canvas2D кодом (в том числе фон `paintBackground`, звёзды, трава, банка).
- «Тоннель». Игрок по одной оси u от −1 до 1, ворота и монеты спавнятся на d = 1 и едут к игроку, `PLAYER_R 0.09`, `COIN_HIT 0.16` (js/games/tunnel.js:10, 11). Ось x даёт вид сверху, ось y вид сбоку. Часть цветов приходит через `COLORS` (js/main.js:33 до 42), часть зашита в игре (#5ef2c2, #ff5d7a, #ffd25e в burst, js/games/tunnel.js:132 до 146, `rgba(255,70,100,...)` на :214), есть `shadowBlur` (:292, 322, 359).
- Оба `resize()` ограничивают DPR значением 2 (fireflies.js:191, tunnel.js:171).

### 12.4 Поток данных в сессии (js/main.js)

1. `start(demo)` (js/main.js:205). До первого `await` выполняются жесты (разблокировка звука `sound.unlock()`, `prime`, `voice.load()`, `requestFullscreen`). Создаётся игра и `PlankAnalyzer`. Не демо, то `startCamera`, `tracker.init(face|pose, model)`, `onEveryVideoFrame(video, onPoseFrame)`.
2. `onPoseFrame` (js/main.js:268). `tracker.detect(video)` на главном потоке, `analyzer.update(det, w, h, t)`, в калибровке `analyzer.calibrate`, отрисовка оверлея.
3. `loop` на rAF (js/main.js:303). `dt` ограничено 0,1 с, `game.setInput(pose.control)`, автомат по `session.phase`: `calibrate`, `countdown`, `play`, `paused`, `over`. Постоянные `END_AFTER 4`, `COUNTDOWN 3`, `SAFETY_VERSION 1` (js/main.js:14 до 16).
4. `milestones()` (js/main.js:411). Цель выполнена, конец подхода, напоминание «Дыши» каждые 10 с.
5. `finish(reason)` (js/main.js:533), запись в историю при `held >= 3`, экран итогов.
- Переменный шаг `dt` (не фиксированные 60 Гц). Инференс синхронно в главном потоке, MediaPipe `import()` модуля с `@vite-ignore` (pose.js:88). Делегаты по порядку `['GPU','CPU']`, `?cpu` оставляет только CPU (pose.js:80).
- Wake Lock запрашивается при старте и на `visibilitychange` (js/main.js:193 до 203). Автопаузы по `hidden` и AudioContext `interrupted` в прототипе нет (grep `interrupted`, `audioSession`, `hidden` по js/ в main.js не нашёл обработки паузы по скрытию).
- Пауза при срыве и автопродолжение уже есть (фаза `paused`, js/main.js:370 до 391).
- Перекалибровка `R`, отладка `D`, камера `C`, выход `Esc` (js/main.js:606 до 624). В демо стрелки, пробел и указатель имитируют вход.

### 12.5 Голос

`say(id, {minGap, interrupt})` (js/main.js:80) ограничивает повтор одной фразы. `VOICE` сопоставляет проблему и фразу (js/main.js:19 до 31). Клипы лежат в `assets/voice/Kore/*.m4a` (37 файлов) с `assets/voice/manifest.json` (формат AAC-LC .m4a, моно, 24 кГц, 40 кбит/с, -16 LUFS). В манифесте один голос Kore, модель записана как `gemini-3.8-flash-tts`, в `tools/tts/README.md` по умолчанию `gemini-3.1-flash-tts-preview` (расхождение значений в двух файлах). Образцы шести голосов в `voices/`.

### 12.6 Хранилище

Только `localStorage` ключ `plank-run:v1` (settings, safety, history, до 50 сессий) с защитой `try/catch` (js/storage.js). Dexie, IndexedDB, OPFS в прототипе нет. Настройки по умолчанию `game 'fireflies', camera 'front', control 'x', target 30, sensitivity 1, model 'lite'` (js/storage.js:6 до 17). Ответы о здоровье не сохраняются, хранится только исход да/нет с версией (js/main.js:640).

### 12.7 Режим ?protocol

Загружается динамическим `import('./protocol/protocol.js')` только при `?protocol` (js/main.js:722 до 729). Файлы. `protocol.js` (1 176 строк, `initProtocol` на :117, `buildFile`, `prepareFile`, хук `window.__protocol` на :1156), `scenario.js` (FRONT, SIDE, BEAT, `buildScenario`, `HOLD_MAX 20`, `PROTOCOL_VERSION 1`), `recorder.js` (`Recorder`, колонки front и side, `packJson`, до 30 Гц в активных фазах и 5 Гц в остальных), `latency.js` (`estimateLatency`, `LAG_RANGE [-300, 1200]`), `summary.js` (`computeSummary`, `SUMMARY_VERSION 1`). Параметр `?protocol&fast[=k]` уменьшает длительности для тестов (protocol.js:26 до 30). Вывод, файл `.json.gz` с производными числами, без точек тела (recorder.js:1 до 7).

### 12.8 Стили и вёрстка

`css/style.css` (542 строки). Переменные `:root` в строках 1 до 14 (--bg #0b0d17, --bg-2 #12152a, --card #161a33, --line #2a3060, --text #eef0ff, --muted #9aa0c8, --accent #5ef2c2, --accent-2 #7c6cff, --warn #ffb547, --bad #ff5d7a, --coin #ffd25e, --radius 16px). Шрифт `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (css:20). Медиазапросы. `max-width: 560px` (:345), `orientation: landscape` и `max-height: 560px` (:502), `prefers-reduced-motion` (:540). Шрифты Onest и Unbounded в приложении не подключены, только в `board/fonts/` (латиница и кириллица woff2 для пяти семейств, лицензии OFL).

### 12.9 Доска направлений (board/)

`board/index.html`, `board.css`, `board.js`, `board/mascot/*.svg` (24 файла), `board/fonts/` (5 семейств Inter Tight, Nunito, Onest, Tektur, Unbounded). Заголовок страницы «Доска направлений». Три направления в плане §8.11 названы A «Неоновая аркада», B «Чистый спорт», C «Дружелюбный маскот». Выбор направления на 29.10.2026 по словам владельца отвергнут целиком.

### 12.10 Данные vendor

`vendor/tasks-vision/vision_bundle.mjs`, `wasm/vision_wasm_internal.{js,wasm}` и `vision_wasm_nosimd_internal.{js,wasm}` (wasm 11 756 954 и 10 960 242 байт), `vendor/models/` с blaze_face_short_range.tflite, pose_landmarker_lite.task, pose_landmarker_full.task. Обновление `scripts/fetch-vendor.sh` с `VERSION=1.0.1`. Файлов `*_module_internal.*` нет. Наблюдение, `du -sh vendor` показал 632 КБ при видимых размерах файлов 23 МБ в `ls -la`. Возможное объяснение, файлы выгружены iCloud (по памяти проекта, Documents синхронизируется iCloud). Содержимое не читал.

## 13. Что в спецификации устарело или расходится с кодом и планом

Разбито на три группы. Пометка «факт» означает, что оба конца расхождения процитированы.

### 13.1 Расходится с PLAN (план старше по порядку)

1. Число пакетов. Спец.:57 до 70 даёт 15 пакетов, план §9.1 «Монорепо — 4 пакета, остальное папками». Расхождение отмечено в самом плане.
2. Токены. Спец.:397 `packages/ui/tokens.json`, план §8.3 `apps/web/src/ui/tokens.json`.
3. Миграция. Спец.:559 и 560 (`legacy-bridge.js`, воркеры в legacy за `?worker`) против плана §9.5 «Legacy не трогаем», объяснение причины в плане.
4. Деплой и адрес. Спец.:561 деплой в `/plank-run/app/` с `noindex`, спец.:552 и 553 SW только со `scope: '/plank-run/'` и переезд «на свой домен». План D17/D25 SW только на plank.erg-team.ru со scope `/`, сборки `/app/` до M5 без SW, спец.:563 `/plank-run/` и `/classic/`.
5. Хранилище и профиль. План §9.4 требует `profileId` в каждой таблице и экспорт файла. В спец.:462 `profileId` нет.
6. Рендер аудио-сессии. Спец.:479 `navigator.audioSession.type = 'playback'` всегда, D22 в плане разделяет `ambient` (игры без ритма) и `playback` (только «Пульс»).
7. Детерминизм. Спец.:224 до 229 и :303 требуют `dmath` и хэш в Chromium, WebKit и Node. План §9.2 переносит `dmath` и WebKit на период перед публичными досками.
8. Тестирование. Спец.:522 до 527 не упоминает «живой золотой набор» из Этапа 0, план §9.4 делает его воротами M2.
9. Телеметрия. Спец.:544 до 546 описывает GlitchTip и сводку сессии, план D20 переносит телеметрию на B0.5, до этого локальная статистика и «Отправить отчёт».
10. Блоки уровней. План D23 ограничивает альфу уровнями 1 до 12 и флагом «распознавание проверено». В спец. флага нет.
11. Визуальное направление. Спец. §6 целиком построена на направлении «Неон + Искра» (D14 план). Слова владельца 29.10.2026 «не нравится всё» (задание) отменяют эту часть, палитра, шрифты, Искра, звуковые токены оказываются непринятыми. В PLAN.md и спец. отметки об этом нет.

### 13.2 Расходится с кодом

1. Столкновения «Светлячков» в пикселях. Спец.:295 признаёт. Код js/games/fireflies.js:126 до 137 (`toScreen`, `jarRadius` с `clamp(..., 30, 80)`, `Math.hypot` по пикселям).
2. `Math.random`, `Math.exp`, `Math.hypot`, `Math.cos/sin` внутри `update` и `spawn`. Спец.:293 до 294 признаёт. fireflies.js:17, 94, 108, 118, 131 до 133, tunnel.js:13, 109.
3. Фиксированный шаг 60 Гц в спец.:220. В коде переменный `dt` (js/main.js:305, `Math.min(0.1, ...)`), fireflies.js:106 дополнительно ограничивает 0,05.
4. Инференс в воркерах в спец., в коде в главном потоке (js/pose.js:143, `detectForVideo(video, ts)` напрямую по `<video>`, а не `ImageBitmap`).
5. MediaPipe 1.1.1 и module wasm в спец.:37, в коде 1.0.1 (js/config.js:8, scripts/fetch-vendor.sh:5), без `*_module_internal.*`.
6. Цвета в коде игр запрещены спец.:397. В коде `COLORS` в main.js:33 до 42, `TYPES` в fireflies.js:11 до 15, строки в tunnel.js (см. 12.3).
7. Загрузка моделей. Спец.:203 до 206 манифест `ml-manifest.json`, sha256, Cache API. Код пробует local → cdn подряд, без кэша и проверки хэша (js/config.js:14 до 35, js/pose.js:82 до 112).
8. Бенчмарк и уровни устройств (спец.:194 до 199, :484). В коде нет, делегат `['GPU','CPU']` по умолчанию (js/pose.js:80), то есть GPU первым, тогда как спец.:199 и исслед.:135 говорят «CPU по умолчанию».
9. Автопауза по `hidden`, 60 с до отключения камеры, `AudioContext.suspend`, `interrupted`, Wake Lock на каждом `visibilitychange` (спец.:475 до 480). В коде Wake Lock повторно берётся на `visible` (js/main.js:201 до 203), остального нет (grep по js/).
10. Один поток камеры на сеанс (спец.:101). В коде `exitPlay()` останавливает треки при каждом выходе (js/main.js:519 до 522, `stopCamera(video)`), следующий `start()` вызывает `getUserMedia` заново.
11. Тест-хуки. Спец.:527 хочет `window.__plank` только в тестовой сборке. Код отдаёт `window.__plank` и `window.__protocol` всегда (js/main.js:695, protocol.js:1156).
12. Голос. Спец.:333 приоритеты, интервал 2,5 с, музыка −9 дБ, субтитры. В коде `VoicePlayer.play` имеет `priority` и `interrupt`, `minGap` в `say()`, субтитров и ducking музыки нет, музыки нет.
13. `speechSynthesis` как запасной путь есть и совпадает со спец.
14. Режим «без рук» (DwellButton, голос автостарта) в коде отсутствует. Автопауза и автопродолжение по форме есть (js/main.js:370 до 391), `END_AFTER 4` совпадает.
15. Dexie, Zustand, React, роутер, Tailwind, i18n, шрифты Onest и Unbounded в приложении отсутствуют. Тексты захардкожены по-русски в js и index.html.
16. Спец.:224 говорит `sfc32`, `cyrb128`, `dmath`. Их нет в репозитории (grep `sfc32`, `dmath` по js/ пусто).
17. Совпадают с кодом без расхождений. THRESHOLDS и параметры дебаунса, One Euro 1,2 / 0,4, ограничение ±1,2 (js/plank.js:251, 252), `baselineClamp [-0.05, 0.02]` (js/plank.js:57), удержание калибровки 1,5 с (js/plank.js:258), медиана по 30 (:278), окно разброса 20 кадров (:268), прощение пропуска детекции 0,3 с (:169), `COUNTDOWN 3`, цели 20/30/45.
18. Форма `lying` в коде присутствует и во фронтальных, и в `ISSUE_TEXT` (js/plank.js:33); в `ISSUES` рекордера те же 11 значений плюс null (recorder.js:10).

### 13.3 Устарело или оспорено внутри самих документов

1. Исслед. §3 (контракт игры `GameFactory`) заменён спец. §4, но остался в репозитории как исследование.
2. Исслед. рекомендует TS 6.0.3 (исслед.:19), спец. выбрала TS 7.0.2 (спец.:22).
3. Исслед.:189 «WASM молча не попадут в precache» исправлено в verify:39 («сборка упадёт»).
4. Исслед.:183 «Ogg с 18.4» уточнено в verify:33 и :63.
5. Исслед.:180 уверенность в `outputLatency` Safari 18.4 снята в verify:34, спец.:286 уже пишет «Apple его поддержку не подтверждала».
6. Спец.:35 и :371 про Onest и Unbounded верны только внутри выбранной пары (verify:49).
7. Спец. и исслед. не учитывают Safari 27 и iOS 27 (verify:56), спец. упоминает 27 в парке устройств (спец.:538).
8. Версия голосовой модели, расхождение значений в `assets/voice/manifest.json` (`gemini-3.8-flash-tts`) и `tools/tts/README.md` (по умолчанию `gemini-3.1-flash-tts-preview`), в этой роли не разбиралось.

## 14. Не нашёл так

- Данных, отражающих слова владельца от 29.10.2026 («визуал очень не нравится»), в PLAN.md, спец., HANDOFF.md и CLAUDE.md нет. Искал `grep -rn "29.10"` по docs/ и CLAUDE.md, дат позже 20.10.2026 в файлах не нашёл.
- Замеров на реальных устройствах (iPhone, Android) в документах нет. Все числа задержек, fps и размеров бюджетов это цели или замер в headless Chromium. Искал «Это не замеры» (исслед.:198) и разделы о замерах.
- Реализации `dmath`, `sfc32`, `inrec/1`, `BodyFrame`, `ModelStore`, бенчмарка, `SessionRunner`, DDA в коде не нашёл (`grep -rn` по js/ и test/).
- Манифеста PWA, иконок приложения, service worker, `package.json` в корне, `vite.config.*`, `tsconfig`, `biome.json` не нашёл (`ls -a`, `grep` по index.html и js/).
- CI с запуском тестов не нашёл. Есть только `.github/workflows/secret-scan.yml`.
- Результата последнего прогона `plank-tests` не нашёл в этой роли. Логи последних 10 прогонов лежат в `~/Library/Application Support/ru.erg.plank-run-tests/logs/<время>/` (по заметке памяти), я их не открывал.
- Детальной спецификации экранов в виде макетов (кликабельных HTML 390×844) не нашёл. В репозитории есть `docs/phone-screens.png`, `docs/board-phone.jpg`, `docs/board-desktop.jpg` (названия файлов из `ls docs`), содержимое картинок не просматривал.
- Контента `docs/plan/spec-visual-art.md`, `spec-product-progression.md`, `spec-rhythm-music.md` не читал (вне задания F4). Ссылки на них в этом файле только через PLAN.
- Содержимого `protocol.js` (47 КБ) читал выборочно (заголовок, экспорты, хуки), логику шагов не разбирал.
- Остальных 80 процентов `fireflies.js` и `tunnel.js` (отрисовка) читал по `grep`, не построчно.
- Размера собранной страницы или времени загрузки в браузере не измерял (чтение файлов только).
