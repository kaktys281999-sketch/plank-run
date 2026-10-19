# Исследование: пост в Threads про игру в планке

- Ссылка от пользователя: https://www.threads.com/share/BAa5jG2S0e/
- Дата исследования: 2026-10-19
- Что искали: «весёлая игра, в которую играешь, стоя в ПЛАНКЕ, управление движением тела (вероятно, через камеру телефона или вебкамеру)».

## 1. Итог по конкретному посту: НЕ ПОДТВЕРЖДЁН

Определить, что именно было в посте `BAa5jG2S0e`, **не удалось**: автор, текст, видео и название игры неизвестны.

Что пробовали:

| Попытка | Результат |
|---|---|
| WebFetch `https://www.threads.com/share/BAa5jG2S0e/` | `getaddrinfo ENOTFOUND www.threads.com` |
| WebFetch `https://www.threads.net/share/BAa5jG2S0e/` | «unable to fetch from www.threads.net» |
| `curl` через прокси окружения | `CONNECT tunnel failed, response 403` для threads.com; так же для apps.apple.com |
| WebSearch по ID `"BAa5jG2S0e"` | ничего: share-ссылки Threads поисковики не индексируют |
| Около 40 запросов в режимах standard и extended (EN/JA/KO/ZH: plank game threads, game while planking, planking webcam game, plank controller, plank game app 2026, TikTok/Instagram/Reddit/X/YouTube, Product Hunt, MediaPipe/itch.io и т. д.) | поста Threads в выдаче нет; зеркал и просмотрщиков Threads в результатах не нашлось |

Ограничения окружения. Кроме Threads, недоступны напрямую apps.apple.com, tiktok.com, plankiapp.com, sourcenext.com и ряд других сайтов (DNS/403). Поэтому описания ниже взяты из сниппетов и сводок поиска, а не из прямого чтения страниц. В конце работы закончился лимит WebSearch (200 запросов на ход, общий для всех агентов). Из-за этого не выполнены запрос на русском («игра в планке камера») и уточняющие запросы по японским доскам SourceNext и GoSports.

**Самое вероятное совпадение по описанию — iOS-приложение Planki** (см. п. 2.1): это игра-таймер планки 2025–2026 годов. Игрок ловит светлячков движениями головы, то есть управляет телом через фронтальную камеру. Вторая по вероятности версия — AR-фильтр «Flappy Bird» для Instagram и TikTok, где в планке или отжимании птицей управляют кивками головы (п. 2.2). Обе версии — **гипотезы, а не подтверждение**.

Как подтвердить быстро: открыть ссылку на телефоне и прислать скриншот, текст поста или @ник автора. Тогда идентификация займёт один запрос.

## 2. Кандидаты: игры в планке, 2024–2026 (и актуальные более старые)

Порядок — по близости к описанию «игра в планке + управление телом через камеру».

### 2.1. Planki: Plank Workout Game / «Plank Timer Challenge: Planki» — главный кандидат

- **Платформа:** iPhone (iOS). Бесплатно, есть встроенные покупки. По одному из листингов нужна iOS 18.6+, размер около 35 МБ.
- **Разработчик:** Bastian Raschke (по данным листинга App Store в сводке поиска).
- **Время:** ID приложения 6757148921. По номеру это примерно конец 2025 – начало 2026 (оценка). В сводке поиска листинг назван «2026-era»: недавние обновления добавили настраиваемого «plank buddy», магазин скинов за XP и лидерборд.
- **Геймплей:** таймер планки, превращённый в игру. Пока держишь планку, ловишь светлячков. Особые светлячки дают самоцветы (в обновлениях — «ruby» и «moonstone»). Есть XP, скины, лидерборд с друзьями и глобальный, а также серии ежедневных планок (streaks).
- **Управление:** на официальном сайте сказано, что контроллер — твоё тело: «catch fireflies by moving your head». В App Store: «just with your body movements». Значит, почти наверняка используется трекинг головы или лица через фронтальную камеру. Прямо подтвердить технологию (ARKit/Vision) не удалось: страницы недоступны.
- **Источники:**
  - https://apps.apple.com/us/app/planki-plank-workout-game/id6757148921
  - https://apps.apple.com/ee/app/plank-timer-challenge-planki/id6757148921
  - https://plankiapp.com/

### 2.2. AR-фильтр «Flappy Bird Game» (Instagram/TikTok), челлендж в отжимании или планке

- **Платформа:** камера-эффект Instagram, ролики массово выкладывают в TikTok.
- **Время:** вирусный челлендж, ролик @fitwithjonie (ID видео 7310067751714917633, это примерно декабрь 2023). Тренд продолжает встречаться в TikTok Discover.
- **Геймплей:** классический Flappy Bird. Игрок в упоре лёжа или в планке, телефон перед лицом.
- **Управление:** фронтальная камера отслеживает голову. В комментарии на TikTok сказано, что отжиматься не обязательно: «just move your head up and down». Авторы советуют включить hands-free и играть «either in plank or pushups position». Автором фильтра называют vsemogusev, но атрибуция в источниках расходится: в других гайдах упоминаются @igor.zhurba и фильтр «Flying Face» от dvoshansky с управлением морганием.
- **Источники:**
  - https://www.tiktok.com/@fitwithjonie/video/7310067751714917633
  - https://www.tiktok.com/discover/push-up-and-plank-filter
  - https://www.tiktok.com/discover/flappy-bird-push-up-challenge-filter
  - https://www.tiktok.com/discover/flappy-bird-push-up-filter?lang=en
  - https://www.youtube.com/watch?v=aWxK6p6FBQQ
  - https://wowfilters.com/151/how-to-play-flying-face-flappy-bird-game-on-instagram/

### 2.3. Plankpad (Passionfruit B.V., Нидерланды): доска для планки + игры в телефоне

- **Платформа:** iOS и Android (приложение), физическая балансировочная доска (Plankpad, Pro, Studio). Можно транслировать на ТВ.
- **Время:** продукт с 2018 года (Indiegogo), приложение актуально в 2025–2026.
- **Геймплей:** бесплатно 11 игр для планки и баланса, 3–4 тренировки и 30-дневный челлендж. По подписке доступны 3D-игры и больше программ. В обзорах упоминаются Snow Cruisin, Meteor Madness, Wave Rider и игра, где надо уклоняться от препятствий на дороге.
- **Управление:** телефон лежит на доске. Наклоны доски корпусом в планке считывает гироскоп телефона, камера не используется.
- **Источники:**
  - https://apps.apple.com/us/app/plankpad/id1425465759
  - https://play.google.com/store/apps/details?id=com.plankpad.plankpad&hl=en_US
  - https://us.plankpad.com/
  - https://fitness-gaming.com/news/home-fitness/plankpad-interactive-bodyweight-trainer-gamifies-plank-workouts.html
  - https://tomsguide.com/news/i-started-using-a-plankpad-every-day-to-torch-my-core-heres-my-verdict
  - https://indiegogo.com/projects/plankpad-interactive-bodyweight-trainer

### 2.4. Stealth Core Trainer (Stealth Fitness): платформа на шарнире + аркады

- **Платформа:** приложение Stealth Fitness (iOS/Android) и доска на сферической опоре.
- **Время:** Kickstarter 2016–2017, продаётся до сих пор (листинги 2025).
- **Геймплей:** ретро-аркады. Galaxy Adventure — стрелять лазером по планетам; Speed Gliding — дельтаплан; Color Chase, Space Escape, FitMan (лабиринты), Stealth Invaders, Air Hockey. Механика как в «Змейке»: наклоняешься и собираешь шарики. Есть режим 1-на-1 в реальном времени. Бесплатно 2–4 игры, остальные по подписке.
- **Управление:** гироскоп телефона в держателе. Наклоны и повороты доски корпусом во все стороны, камера не используется.
- **Источники:**
  - https://playstealth.com/products/core
  - https://apps.apple.com/us/app/stealth-fitness/id1360949647
  - https://melmagazine.com/en-us/story/stealth-core-trainer-plank-game
  - https://boingboing.net/2018/01/27/a-stealthy-trojan-horse-for-fi.html
  - https://reviewed.com/health/features/stealth-core-trainer-review
  - https://newatlas.com/stealth-core-training-app-game/46807/?amp=true

### 2.5. Японские аналоги: SourceNext «ゲーミングプランクボード» и ELECOM «プランクトレーニングマット»

- **SourceNext Gaming Plank Board:** телефон в держателе, приложение, игра идёт за счёт баланса тела в планке (сенсоры телефона). Дату выпуска уточнить не удалось (кончился лимит поиска).
- **ELECOM:** коврик с цифрами и бесплатное приложение ECLEAR SPORTS. Приложение говорит, куда ставить руки, — «тренировка как игра». Камеры нет.
- **Источники:**
  - https://www.sourcenext.com/product/2000001293/
  - https://update.grapee.jp/968418
  - https://shop.physiqueonline.jp/shopdetail/000000001279/ (Plankpad Pro в Японии)

### 2.6. «What Doing a Plank Feels Like», GMTK Game Jam 2026 (itch.io)

- **Платформа:** itch.io (джем-игра), автор Sobhan Azari.
- **Время:** 2026.
- **Геймплей:** «вытерпеть одну минуту планки». Ироничная игра о самом ощущении планки.
- **Управление:** не выяснено. Камера не упоминается, скорее всего клавиатура.
- **Источник:** https://itch.io/jam/gmtk-jam-2026/rate/4828975

### 2.7. Приложения, где камера проверяет планку (не игры, но та же технология)

Здесь нет «весёлой игры», но камера смотрит на тело в планке. Это ближайшие технические аналоги:

- **AI Plank Timer Home Workout** (Sliced Backhand Ltd, iOS, ID 6736621305, около 2024). Камера и AI-детекция тела проверяют позу; таймер стартует только в правильной планке и встаёт на паузу при потере формы. https://apps.apple.com/us/app/-/id6736621305
- **PlankIt — Plank Trainer** (iOS, ID 6753892360, около 2025). AI pose detection в реальном времени: прямая линия тела, провисание или подъём таза, положение плеч и шеи; 21-дневные челленджи. https://apps.apple.com/us/app/plankit-plank-trainer/id6753892360
- **Plank Workout & Fitness App** (iOS, ID 6469516494). Камера считает секунды планки, есть голосовой коуч и лидерборды. В отзыве 2025 года пишут, что таймер ошибается примерно на треть. https://apps.apple.com/us/app/plank-workout-fitness-app/id6469516494
- **Pose Detector – Plank Perfect** (Android). Pose detection на устройстве сама определяет вход в планку и выход из неё. https://apkcombo.com/pose-detector-plank-perfect/app.posedetector/
- **Arm «AI Plank Tutor»** (туториал для Android): камера, pose detector, локальная LLM и TTS, сравнение с эталонной позой. https://learn.arm.com/learning-paths/mobile-graphics-and-gaming/ai-plank-tutor/1-introduce-plank-tutor/

### 2.8. Общие камерные motion-игры (планки в них не нашлось)

- **Active Arcade** (iOS): full-body трекинг фронтальной камерой. https://apps.apple.com/ca/app/active-arcade/id1553158383
- **Motion Sport Games AR** (Android): управление через селфи-камеру. https://play.google.com/store/apps/details?id=com.motiongames&hl=en_US
- **Flappy Arms** (браузер, вебкамера, pose estimation плеч и кистей): https://67speedgames.com/flappy/
- **Nex Playground** (консоль с камерой, 2026 год, CES): https://www.businesswire.com/news/home/20260105396416/en/Nex-Playground-Showcases-Future-of-Active-Play-at-CES-and-an-Early-First-Look-at-its-2026-Product-Roadmap

## 3. Ложные совпадения (отброшены)

- **PLANK!** (Kwalee): тап-игра про мостик из доски, к упражнению не относится; удалена из Google Play 17.03.2026. https://www.kwalee.com/fun-games/plank
- **PLANK'D** (2011): игра про мем «planking» (лечь плашмя). https://toucharcade.com/games/plankd
- **Richie's Plank Experience** и **Bazigar**: VR-прогулка по доске над пропастью, не упражнение. https://store.steampowered.com/app/517160/Richies_Plank_Experience/
- **Plank** (Steam, кооп-строилка), **Roll The Plank**, **Plank Dash** (раннер с тапом), **PLANK.io**: не фитнес.
- **PlankHero**, **Plank Streak**, **Plank-tastic** и подобные: только таймеры или трекеры, без игры.
- **Wii Fit, Plank Challenge** (2007–2008): штраф за раскачивание на Balance Board, камеры нет. https://en.wikipedia.org/wiki/Wii_Fit

## 4. Что это значит для plank-run (кратко)

- Вероятный «эталон» из поста — Planki. Механика: игрок в планке, телефон на полу перед лицом, **управление наклонами и движениями головы** через фронтальную камеру, цель — ловить объекты, мета-прогрессия через XP, скины, лидерборд и стрики.
- Камерные трекеры планки (AI Plank Timer, PlankIt) показывают полезный паттерн **«игра или таймер идёт только при правильной форме»**: проверка линии плечи–таз–лодыжки, пауза при провисании.
- Аппаратные аналоги (Plankpad, Stealth) управляют игрой **наклоном корпуса влево и вправо**: уклонение от препятствий, «Змейка», дельтаплан. В версии с вебкамерой это переводится в смещение плеч или головы по X.
