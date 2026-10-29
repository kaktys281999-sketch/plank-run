# W2. Технологии для мобильной веб-игры с управлением телом через камеру (факты, состояние на 29.10.2026)

Просмотрено источников: около 49 страниц (GitHub releases, реестр npm, документация Godot, документация MediaPipe, страницы выдачи DuckDuckGo, статьи сторонних авторов). Дата проверки всех интернет-фактов 29.10.2026. Выводов и рекомендаций нет, только факты. Пометка «наблюдение» означает мою оценку качества источника.

Оглавление
1. Движки и рендеры
2. Распознавание позы в браузере
3. Камерные игры и SDK для движения
4. Анимация (Rive, dotLottie и lottie-web, Spine)
5. PWA на iOS и Android
6. Пробелы (что не нашёл и как искал)

Оговорка об источниках. Большая часть сравнительных цифр (размеры, FPS) взята из сторонних статей, а не от авторов библиотек. Такие цифры помечены «сторонний источник». Сайт aifitnessapi.com финансируется компанией KinesteX (она сама раскрывает это на страницах), то есть у него есть интерес в теме SDK для движения.

---

## 1. Движки и рендеры

### Phaser
- Phaser 4 вышел как v4.0.0 «Caladan» 10.04.2026. Источник: https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/CHANGELOG-v4.0.0.md (по выдаче DDG) и https://phaser.io/download/release/v4.0.0.
- Последняя версия на 29.10.2026 это v4.2.1 «Giedi» от 09.07.2026 (отметка Latest). Ранее 4.2.0 от 19.06.2026, 4.1.0 «Salusa» от 30.04.2026. Источник: https://github.com/phaserjs/phaser/releases. Ветка 3 закончилась на v3.90 «Tsugumi» от 23.05.2025 (там же).
- npm: phaser@4.2.1, лицензия MIT, из зависимостей только eventemitter3. Распакованный пакет 112,5 МБ (в него входит исходник, типы и сборки, это не размер сборки игры). Источник: https://registry.npmjs.org/phaser/latest.
- Phaser 4 это перестроенный с нуля WebGL-рендер на архитектуре «render nodes» (конвейеры Phaser 3 заменены), «WebGL state is fully managed», восстановление контекста встроено. Источник: релиз v4.0.0 на https://github.com/phaserjs/phaser/releases и https://gamefromscratch.com/phaser-4-released/ (по выдаче DDG).
- Заявлен SpriteGPULayer «более миллиона спрайтов» и размер полной минифицированной сборки 345 КБ с gzip. Сторонний источник: https://hysenlabs.com/projects/phaserjs-phaser (по выдаче DDG, страницу целиком не открывал).
- Из релиза 4.2.0: новые опции игры render.stencil (отключить буфер трафарета ради памяти), Mesh2D, CustomContext. Источник: https://github.com/phaserjs/phaser/releases (раздел 4.2.0). Phaser 4.2 принёс новый рендер-бэкенд для Spine (плагин spine-phaser-v4 от Esoteric Software). Источник: https://phaser.io/news/2026/07/phaser-4-2-spine-renderer-mesh2d-stencil (по выдаче DDG).
- Список изменений против v3: единые Filters (заменили FX и Masks), упрощённое освещение, переделанные Tint. Источник: https://gist.github.com/jayeshcp/6106160967d9ee0a204c7b40ff47036a (сторонний, по выдаче DDG).
- WebGPU в Phaser 4 в просмотренных источниках не упомянут, рендер описан как WebGL-first (https://deepwiki.com/chongdashu/vibejam-starter-pack/3.2.2-phaser-4-rendering-and-performance, по выдаче DDG). Явного заявления «WebGPU нет» не видел.
- Ввод: Phaser не знает о камере, свой ввод подаётся через события и ручное обновление объектов (это общее устройство, отдельным источником не проверял).

### PixiJS
- Последняя v8.22.0, помечена Latest. Источник: https://github.com/pixijs/pixijs/releases и https://registry.npmjs.org/-/package/pixi.js/dist-tags (latest 8.22.0; ветки 7.x до 7.4.3, 6.x до 6.5.10).
- В 8.22.0: опция transient для WebGPU с antialias, 3D-текстуры и storage-текстуры, события contextmenu; в changelog 8.22 указаны WebGPULoader/CanvasLoader (каждый бэкенд грузится отдельным чанком). Источник: https://github.com/pixijs/pixijs/releases.
- Бэкенды WebGL и WebGPU выбираются через preference при app.init (пример в релизе 8.22.0: preference 'webgpu').
- Дат релиза на странице GitHub в текстовой выгрузке не было, дату 8.22.0 не установил. Лицензию (MIT) и размер сборки по первоисточнику не проверял.

### Kaplay
- npm: тег latest = 3001.0.19, тег next = 4000.0.0-alpha.27.1, лицензия MIT. Источник: https://registry.npmjs.org/-/package/kaplay/dist-tags и https://registry.npmjs.org/kaplay/latest. Распакованный пакет 4,0 МБ.
- Метаданные пакета 3001.0.19 содержат технический штамп времени публикации 2025-06 (tmp/kaplay_3001.0.19_1750006338826), то есть стабильная ветка последний раз обновлялась в июне 2025. Наблюдение: вывод по штампу, не по странице релизов.
- Версия v4000 существует как альфа (Alpha 27: изменения текстур, шрифтов, отладки). Источник: https://v4000.kaplayjs.com/blog/release-v4000-alpha-27/ (по выдаче DDG). Есть вики «KAPLAY Roadmap 2026»: https://github.com/kaplayjs/kaplay/wiki/KAPLAY-Roadmap-2026 (содержимое не читал).
- Сравнение Phaser, Kaplay, Excalibur на одной игре-бегуне: https://phaser.io/news/2026/04/phaser-vs-kaplay-vs-excalibur-2d-web-game-framework (читал только анонс в выдаче; сайт принадлежит Phaser, наблюдение: интерес в теме).

### Three.js и React Three Fiber
- three@0.186.1 (latest), лицензия MIT; в exports есть отдельная точка ./webgpu (build/three.webgpu.js) и ./tsl. Источник: https://registry.npmjs.org/three/latest. Распакованный пакет 20,4 МБ.
- React Three Fiber: не проверял (пробел).

### Babylon.js
- @babylonjs/core 9.32.1 (latest), лицензия Apache-2.0, есть Engines/WebGPU/webgpuClearQuad.js и Engines/webgpuEngine.js в списке sideEffects, то есть WebGPU-движок поставляется. Источник: https://registry.npmjs.org/@babylonjs/core/latest и https://registry.npmjs.org/-/package/@babylonjs/core/dist-tags. Распакованный пакет 72,7 МБ (с исходниками, не размер сборки).

### PlayCanvas
- npm playcanvas: latest 2.23.3, beta 2.24.0-beta.24, lts 1.77.0. Источник: https://registry.npmjs.org/-/package/playcanvas/dist-tags. Лицензию, размер и WebGPU не проверял.

### Godot (экспорт в веб)
Источник по всему блоку: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html (читал целиком).
- Веб-экспорт требует WebAssembly и WebGL 2.0. Режим только Compatibility; Forward+ и Mobile на вебе не поддержаны. «Godot currently does not support WebGPU».
- Godot 4 с C# в веб экспортировать нельзя.
- С Godot 4.3 есть экспорт в один поток; он по умолчанию и не требует заголовков кросс-доменной изоляции. Многопоточный экспорт требует COOP/COEP (Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp), либо включить PWA-обход через сервис-воркер.
- В доке сказано, что в Safari «several issues with WebGL 2.0», и рекомендован Chromium или Firefox. Одно-поточный экспорт «works very well on macOS and iOS».
- Звук с 4.3 идёт через Web Audio (режим Sample): эффекты, реверберация, допплер и процедурный звук не поддерживаются.
- Вкладка в фоне ставится браузером на паузу (_process не вызывается).
- WebAssembly-модуль сжимается примерно до четверти по gzip; рекомендованы серверное сжатие и Brotli. Размер сборки в МБ в доке числом не указан.
- Известные ошибки на iOS (issues на GitHub, версия 4.5.1): падение страницы в iOS Safari при частом AudioStreamPlayer.play() за 10–30 минут, iPhone 12, iOS 26.3 (https://github.com/godotengine/godot/issues/116750); падение в Safari-сборке внутри YouTube Playables (https://github.com/godotengine/godot/issues/117395). Содержание issues по выдаче DDG.
- Есть сторонние статьи про потолок памяти WASM у Godot 4.5 (https://www.gamineai.com/blog/godot-4-5-web-export-wasm-memory-ceiling-h2-2026-browser-demo-trend-playbook, только заголовок и аннотация).

### Defold, Cocos Creator
- Не проверялись (пробел, см. раздел 6).

---

## 2. Распознавание позы в браузере

### MediaPipe Tasks Vision
- npm @mediapipe/tasks-vision latest = 1.2.0, лицензия Apache-2.0, распакованный размер 44,2 МБ (14 файлов, включая wasm). Источник: https://registry.npmjs.org/@mediapipe/tasks-vision/latest.
- GitHub-релизы MediaPipe: v1.2.0 (Latest), v1.1.1, v1.1.0, v1.0.0, затем 0.10.35, 0.10.33, 0.10.32 и т.д. Источник: https://github.com/google-ai-edge/mediapipe/releases. Дат релизов в текстовой выгрузке нет.
- Что изменилось (по списку изменений 1.1.1/1.2.0 на той же странице): на вебе добавлены поиск и эмбеддинги (UniversalEmbedder, SemanticRetriever), статистика (Web Tasks stats logging), «Expose per-landmark presence scores on the Web Tasks API», «Expose preferredBackends», правка для импорта модулей в воркерах (importScripts), «Retain error messages for PoseLandmarker», PoseLandmarker C API; в 1.2.0 «Run face blendshapes on CPU when using the GPU delegate». Много пунктов про WebGPU-службу (WebGpuService и др.) относятся к LLM-инференсу на вебе.
- Что стало в 1.0.1 в проекте (предыдущая версия по CLAUDE.md проекта) относительно 1.2.0 не сопоставлял.

### Модели позы (Pose Landmarker)
Источник: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker (страница обновлена 09.10.2026) и руководство для веб https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js.
- Три пакета моделей: lite, full, heavy; тип данных float16; детектор позы вход 224x224x3, ориентир-модель 256x256x3. Сеть схожа с MobileNetV2, вариант BlazePose с GHUM.
- 33 ориентира, нормализованные координаты и мировые координаты (метры, начало в центре бёдер), опциональная маска сегментации.
- Режимы IMAGE, VIDEO, LIVE_STREAM (в руководстве для веба перечислены IMAGE и VIDEO). numPoses по умолчанию 1; пороги по умолчанию 0.5.
- Руководство для веб: detect() и detectForVideo() синхронные и блокируют основной поток; Google советует выносить в Web Worker.
- Делегаты: в оформлении опций веб-страницы Pose Landmarker явного поля delegate GPU/CPU не нашёл (в просмотренном тексте его нет); в релизах упомянуты «preferredBackends» и «Run face blendshapes on CPU when using the GPU delegate». Деталь «какой делегат по умолчанию» не подтверждена.
- Скорость на телефоне по модельной карте (пересказ в сторонней статье https://aifitnessapi.com/compare/mediapipe-vs-yolo-pose от 22.10.2026): Pixel 3, Lite около 44 FPS CPU и 49 GPU, Full около 18 и 40, Heavy около 4 и 19. Точность модели Heavy: mAP 68,1; 73,0; 74,0 на наборах Yoga, Dance, HIIT (по тому же источнику, расстояние человека 2–4 м). z-координата «not metric but up to scale».

### Альтернативы (сторонние источники)
- Источник: https://aifitnessapi.com/compare/mediapipe-vs-yolo-pose (проверено 22.10.2026; финансируется KinesteX):
  - Ultralytics YOLO26 pose: 17 ключевых точек COCO, много людей, размеры n/s/m/l/x; YOLO26n-pose 57,2 mAP, 2,9 М параметров, 1,8 мс на T4, 40,3 мс на CPU через ONNX; YOLO26x-pose 71,6 mAP, 57,6 М параметров, 12,2 мс. Лицензия кода AGPL-3.0 либо платная Enterprise (цена не опубликована).
  - Экспорт Ultralytics в 23 формата (ONNX, CoreML, LiteRT и др.); в таблице экспорта нет цели TensorFlow.js.
  - Как альтернативу с Apache-2.0 для нескольких людей источник называет RTMPose (лицензию весов советует проверять отдельно).
- Повторение 17 ключевых точек и сравнения MoveNet с MediaPipe: https://www.posetracker.com/compare (сайт продаёт SDK PoseTracker на MoveNet, обновлено 09.10.2026).
- Репозиторий YOLO11-pose на ONNX Runtime Web с WebGPU и wasm (CPU): https://github.com/nyi21466/yolov11-pose-estimation-onnxruntime-web (по выдаче DDG, лицензию не смотрел).
- Статья про рабочую цепочку ONNX Runtime Web в браузере и обзор «RTMPose vs MediaPipe vs OpenPose vs ViTPose 2026» на https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/openpose-mediapipe-rtmpose-pose-tracking (только аннотация в выдаче).
- Roboflow называет RF-DETR Keypoint сильнейшим решением для серверной разметки (https://roboflow.com/blog/best-pose-estimation-models, аннотация).
- Состояние MoveNet и BlazePose в TensorFlow.js за 2025–2026 по первоисточникам не проверял.

### WebGPU в iOS Safari
- WebGPU включён в Safari 26.0 на macOS, iOS, iPadOS и visionOS. Источники: https://webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers/ (цитата из заметок WebKit для Safari 26.0 «now shipping in Safari 26.0 for macOS, iOS, iPadOS, and visionOS») и https://www.contrast3d.com/blog/webgpu-tres-navegadores-plan-b/.
- Firefox 147 включил WebGPU 13.01.2026 (https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/, сторонний, «наблюдение»: заголовок с громкими цифрами).
- Safari 27.0 (сентябрь 2026) принёс clip_distances в WGSL и ещё; всего «83 features and 844 fixes» (https://app.cinevva.com/news/2026-09-17-safari-27-model-element-webgpu-clip-planes). Выпуск Safari 26.6: https://webkit.org/blog/18178/webkit-features-for-safari-26-6/.
- Смотрел ли MediaPipe Pose на iOS WebGPU-путь, не проверено.

---

## 3. Камерные игры и SDK для движения

### Nex Playground и Active Arcade
- Nex Playground: консоль-куб с встроенной камерой, $249 в США, £269 в Великобритании (запуск 22.06.2026). Источники: https://miikka.games/posts/2026-01-11-nex/ (оценка: около 650 000 проданных консолей в 2025, подписка $89 в год), https://www.bbc.co.uk/news/articles/czx50rrz7zro, https://www.kyrascope.com/toy-news/2026-05-24-nex-playground-uk-ireland-preorders-active-play-summer-launch.
- Отслеживание: «proprietary computer vision and AI system», 18 узлов тела, до 4 игроков в зависимости от игры, обработка на устройстве, видео в облако не уходит. Источник: https://support.nexplayground.com/en/articles/13139469-how-does-the-nex-playground-track-my-movements.
- SDK для сторонних разработчиков не нашёл. Справка: «Third-party apps or games cannot be installed on Nex Playground». Источник: https://support.nexplayground.com/en/articles/13139625-privacy-and-security. Игры делает сама компания; есть сообщения об играх по партнёрству с лигами (NBA), https://www.4scarrsgaming.com/2026/01/nex-playground-2026-roadmap-connected-playdate-ces-2026.html.
- Active Arcade: мобильное приложение Nex с движениями-играми; появилось после HomeCourt (приложение для баскетбола) в период пандемии, популярно в Азии; позднее компания перенесла игры на телевизор. Источники: https://naavik.co/digest/nex-playground-and-motion-gamings-second-act/, https://www.thegamebusiness.com/p/we-want-a-nex-playground-in-every. Публичного SDK нет, судя по тем же источникам (прямого заявления «SDK нет» не нашёл).

### SDK для движения (сторонние)
Источник по большей части: https://aifitnessapi.com/compare/kinestex-vs-sency (проверено 17–18.10.2026; сайт финансирует KinesteX).
- KinesteX: оболочки WebView и iframe вокруг размещённого на сервере камерного опыта; есть веб (HTML/JS iframe, PWA, React TypeScript), iOS, Android, React Native, Flutter. Цены нет, по форме «за активного пользователя в месяц». Репозитории обёрток Apache-2.0, сервис коммерческий (нужен API-ключ). Заявленная точность в двух местах разная (больше 90% и 97,2%), независимо не проверена.
- Sency (SMKit): нативный SDK без интерфейса; платформы iOS, Android, React Native, Flutter; JavaScript и Unity отмечены «NA». Цены: Starter бесплатно до 100 активных пользователей в месяц, Growth от $499 в месяц до 3 800 (две страницы цен расходятся). Лицензия «Sency Terms of Use», не open source.
- QuickPose: SDK на основе MediaPipe и BlazePose для iOS и Android, бесплатно для 10 активных устройств в месяц, затем $25–1 000 в месяц до 100 000 устройств. Источник: https://aifitnessapi.com/pricing/quickpose-pricing (по выдаче DDG), https://quickpose.ai. Веба в просмотренных текстах не видел.
- PoseTracker: SDK на MoveNet (TensorFlow), 17 ключевых точек бесплатно, iOS, Android, веб; 200 вызовов API в месяц на бесплатном тарифе для повторов, углов и оценки формы. Источник: https://www.posetracker.com/compare и https://www.posetracker.com/news/posetracker-v2-2026.
- Наблюдение: во всех сравнениях точность не измерена независимо.

### Открытые игры на MediaPipe в браузере (GitHub)
- Chuyuyan/webcam-pose-runner. Бегун на три дорожки, управление шагом в сторону, прыжком на месте и приседом. MediaPipe Pose Tasks Vision в браузере, Canvas 2D без движка, ES-модули без сборки, размещение на GitHub Pages, «full» модель вместо lite, камера не покидает устройство. Лицензию в тексте README не нашёл. Подробное описание порогов (в ширинах плеч), антидрожание, нормализация, запись реальных данных для тестов. Источник: https://github.com/Chuyuyan/webcam-pose-runner (читал README целиком).
- yingwang/justmove. Танцевальная ритм-игра в духе Just Dance на MediaPipe Holistic, пять треков, загрузка своего аудио, комбо, управление головой (кивок, покачивание). Источник: https://github.com/yingwang/justmove. Лицензию в README не нашёл.
- Другие по выдаче DDG (Python или без лицензионных данных): Pose-Perfect (Python, MediaPipe, Pygame), Abhay1705-march/Motion---Detection (Subway Surfers по позе через PyAutoGUI), mbahadirk/Mediapipe-on-Web-Games (простые HTML). Лицензии не смотрел.
- Статья «Browser Motion Capture in ~200 Lines» (MediaPipe + TypeScript, 27.07.2026): https://takashifukushima.com/2026/07/27/browser-motion-capture-mediapipe-typescript/ (только аннотация).

---

## 4. Анимация

Все цифры размеров ниже из сторонних статей, а не от разработчиков.

- Сравнение (опубликовано 19.08.2026, https://iconstash.io/articles/svg-vs-lottie-vs-rive-animation-benchmark/): рантайм Rive около 140 КБ (gzip, WASM), lottie-web около 60 КБ (gzip, JS); файл иконки Lottie 8–45 КБ, .riv 1,5–8 КБ; 50 экземпляров: Rive 118 FPS, Lottie 42 FPS. У Rive есть визуальные конечные автоматы (state machine). Наблюдение: сайт торгует иконками, методика замеров не раскрыта, числа округлены.
- Другая сторонняя статья даёт для Rive около 100 КБ gzip (WebAssembly canvas): https://www.exodeui.com/blog/best_animation_library_react_2026/ (по выдаче DDG). Цифры двух источников расходятся (100 против 140 КБ).
- Rive: рантайм для веба @rive-app/canvas; .riv идёт на веб, iOS, Android, Flutter, Unreal (там же). Тарифы Rive: страница https://rive.app/pricing открыта в чужой вкладке, содержимое не читал.
- dotLottie web (@lottiefiles/dotlottie-web): плеер на основе ThorVG, скомпилированного в WebAssembly (ядро dotlottie-rs); версия 0.80 по состоянию на сравнительный сайт, 1,1 млн скачиваний в неделю; недавно добавлены WebGL- и WebGPU-бэкенды. Источники: https://docs.lottiefiles.com/en/runtimes/distributions/js/v0.x/core-concepts, https://lottiefiles.com/blog/working-with-lottie-animations/hardware-accelerated-lottie-on-the-web-dotlottie-web-now-ships-webgl-webgpu, https://javascripts.com/compare/canvas-confetti-vs-lottiefiles__dotlottie-web/. Размер в КБ в просмотренных текстах числом не получил.
- Лицензия Lottie-файлов с LottieFiles: страница https://lottiefiles.com/page/license была открыта в чужой вкладке, мной не читалась.
- Spine: рантаймы требуют действующей лицензии Spine Editor для коммерческого распространения; Essential/Professional это разовая покупка с пожизненными обновлениями, один человек на лицензию. Источники: https://esotericsoftware.com/forum/d/29657-spine-runtimes-licence, https://libraries.io/npm/@esotericsoftware/spine-pixi-v8 (пакет spine-pixi-v8 версия 4.2.120). Размер веб-рантайма и цены в числах не получил (pricingnow.com не открывал).
- Phaser 4.2 содержит новый рендер-бэкенд Spine (см. раздел 1).

---

## 5. PWA на iOS и Android (2026)

Основной источник по iOS: https://www.wavxsolutions.in/blog/pwa-on-ios-what-works (2 октября 2026, составлен по записям WebKit, документации Apple и MDN; автор пишет, что «это чтение документации, а не тест на устройстве»). Safari 27 / iOS 27 вышли в сентябре 2026.
- Установка: через «Поделиться, На экран Домой». Автоматического запроса установки (beforeinstallprompt) на iOS нет. С iOS 26 каждый добавленный сайт открывается как веб-приложение по умолчанию (пользователь может выключить «Open as Web App»). Режим standalone с iOS 11.3; fullscreen и minimal-ui в Safari не поддержаны (данные MDN в том же источнике).
- Web Push: iOS 16.4, только для веб-приложений на домашнем экране, запрос разрешения только по нажатию, каждое пуш-сообщение обязано показывать уведомление (иначе Safari отзывает разрешение). Declarative Web Push с iOS 18.4. Значок на иконке (Badging API) с iOS 16.4. Кнопки действий, картинки и вибрация в уведомлениях не поддержаны. Аккаунт разработчика Apple не нужен. Тот же источник.
- Screen Wake Lock: iOS 16.4 в Safari, в веб-приложениях на домашнем экране только с iOS 18.4 (до этого не работал). Тот же источник.
- Фон: Background Sync, Periodic Background Sync, Background Fetch не поддержаны. Вибрации (Vibration API) нет. Web Bluetooth/NFC/USB нет. Тот же источник.
- Хранилище: квота около 60% диска на origin с iOS 17, у приложения на домашнем экране такая же; Safari удаляет записываемые скриптом данные после 7 дней без взаимодействия в браузере, для приложений на домашнем экране свой счётчик, удаление не ожидается; у установленного приложения отдельное хранилище (нужно войти заново). Тот же источник. Другие статьи (https://synthetixis.com/writing/pwa-ios-2026) называют миф «лимит 50 МБ кэша» устаревшим (аннотация).
- Камера и микрофон (getUserMedia) работают с iOS 11. Тот же источник.
- Audio Session API (navigator.audioSession): позволяет задать тип звука (auto, playback, transient, transient-solo, ambient, play-and-record), состояния active/inactive/interrupted и событие statechange. Источники: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/audioSession, https://browserinsight.net/blog/audio-session-api-privacy. Для iOS: тип по умолчанию auto ведёт себя как ambient, звук Web Audio глушится переключателем «без звука»; тип playback его обходит; в Safari API доступно с 16.4 (по одному источнику) или 17 (по другому). Источники: https://blog.lans.cloud/ios-silent-switch-web-audio, https://gist.github.com/silvb/5a7504828b4e84afec867d9c7bbe1568, https://github.com/DrDonik/vorlese-board/blob/main/doc/adr/0004-audio-ignores-silent-mode.md (все по аннотациям выдачи; расхождение 16.4 и 17 не разрешено).
- Ограничение памяти и фон: прямых данных об ограничениях памяти WebView на iOS и о завершении фоновых PWA в 2026 году по первичным источникам не получил (см. пробелы). Для Godot в Safari известны падения страницы при долгом проигрывании звука (раздел 1).
- Android: подробностей по Android (установка, WebAPK, Web Push, Wake Lock, полноэкранный режим) отдельно не искал. В источнике про iOS указано, что на Android в Chrome срабатывает beforeinstallprompt и сайт может показать свою кнопку установки.
- Полноэкранный режим: на iOS display: standalone даёт окно без панели браузера; режим fullscreen манифеста в Safari не поддержан (MDN-данные, тот же источник).

---

## 6. Пробелы (что не нашёл и как искал)

- Defold, Cocos Creator: не искал (не дошёл по лимиту страниц). PlayCanvas: только версия из npm, без лицензии, размера и WebGPU. React Three Fiber: не искал.
- Размеры сборки Phaser 4, PixiJS 8, Kaplay, Three.js в КБ по первоисточнику не получил. Единственная цифра Phaser (345 КБ с gzip) из стороннего блога по аннотации выдачи. Искал через DDG и страницы npm, bundlephobia не открывал.
- Даты релизов PixiJS 8.22.0 и MediaPipe 1.0.0–1.2.0 в текстовой выгрузке GitHub не отображаются. Дат на npm в форме «time» не запрашивал.
- Производительность движков на телефонах (FPS на реальных устройствах): нет измеренных данных, только общие заявления.
- Лицензии и размеры PixiJS, Kaplay на текущий момент по LICENSE не открывал (MIT у Kaplay, Phaser, Three.js видна в метаданных npm).
- Какой делегат MediaPipe Pose (GPU или CPU) стоит по умолчанию на вебе и что изменилось с 1.0.1 для позы, в просмотренных страницах не прояснено.
- Новые модели позы 2025–2026 (что-то новее RTMPose и YOLO26): искал одним запросом, нашёл только перечисленные в разделе 2. Состояние MoveNet и BlazePose в TensorFlow.js, скорость RTMPose или YOLO-pose через ONNX Runtime Web на телефонах, WebGPU-бенчмарки позы: измеренных данных не нашёл.
- SDK Nex и Active Arcade: прямого утверждения «публичного SDK нет» для Active Arcade не нашёл, только отсутствие упоминаний и справочное правило для Playground.
- Лицензии открытых игр webcam-pose-runner и justmove в README не указаны, файл LICENSE не открывал.
- Rive: официальные данные (размер рантайма, тарифы, производительность) не читал, только сторонние сравнения с расхождением 100 и 140 КБ. Размер dotLottie-плеера и Spine web runtime в КБ не получил. Лицензию LottieFiles Simple License не читал.
- PWA: данные по Android, по лимитам памяти WebView и убийству фоновых PWA на iOS, по нюансам Audio Session API (версия 16.4 или 17) не подтверждены первоисточниками (WebKit, MDN, caniuse не открывал, использовал сводные статьи и аннотации выдачи).
- Ограничение метода: поиск шёл через html.duckduckgo.com, содержимое многих результатов видно только по аннотациям.
