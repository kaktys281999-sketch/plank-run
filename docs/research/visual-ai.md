# Визуальная разработка с ИИ: инструменты, пайплайн, право

Дата: 19.10.2026. Трек: генерация изображений, векторизация, анимация, видео, аудио, право, воспроизводимый пайплайн для «Plank Run».

**Как собраны данные.** WebFetch не работает: DNS блокирует ai.google.dev, yandex.cloud и большинство других сайтов. Поэтому я опирался на первичные источники, которые всё же открываются:
- cookbook Gemini на GitHub (ноутбуки Nano Banana, Imagen, Veo, TTS);
- типы SDK `@google/genai` 2.30.0 и `openai` 7.39.0 из npm. В них есть ID моделей, параметры и даты отключения;
- README Silero и Piper;
- лицензии пакетов из npm и PyPI.

Координатор в тот же день проверил API живьём ключом владельца. Цены, ToS и судебные новости взяты из сводок веб-поиска, это вторичные источники. Где источники расходятся, я пишу «по агрегатору» или «не проверено». Формулы матирования я проверил на синтетических данных: ошибка альфы ≤0,003.

## 1. Коротко

- **Ограничение — бюджет $0 на API.** Free tier Gemini API для картинок возвращает `429 … limit: 0`, проверено на `gemini-3.1-flash-lite-image`. Подписка Google AI Pro покрывает приложение Gemini, а API не покрывает. Отсюда пайплайн: **владелец генерирует вручную** в приложении Gemini (Nano Banana Pro) и в ChatGPT по нашей библиотеке промптов. Файлы попадают к ассистенту через вложения или папку `art/inbox/`. **Ассистент делает всё остальное**: альфу, векторизацию, приведение к палитре, атлас, оптимизацию, манифест.
- **Неон выгоден для ИИ-пайплайна.** Свечение, частицы, тоннель и светлячков лучше оставить процедурными (Canvas/SVG). Они легче, резче, анимируются и юридически чисты. ИИ нужен для фонов, иллюстраций онбординга и пустых состояний, мудбордов маскота и промо.
- **Искра, иконки и иконка приложения — вектор, который пишет ассистент.** ИИ здесь только для поиска идей. Так получаем стиль из токенов, малый вес и явный человеческий вклад, что важно для авторского права.
- **Озвучка тренера бесплатна уже сейчас.** Gemini TTS работает на free tier и даёт русскую речь (PCM 24 кГц). Фразы рендерим заранее и кладём файлами.
- **Музыку для «Пульса» не берём из Suno или Udio** (подробно в `music-sources.md`).

## 2. Что проверено и что изменилось в 2026

| Факт | Статус | Источник |
|---|---|---|
| Модели картинок, которые API отдаёт по ключу владельца: `gemini-2.5-flash-image`, `gemini-3.1-flash-image(-preview)`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image(-preview)`, `nano-banana-pro-preview` | живой тест | координатор |
| В cookbook есть ещё `gemini-nano-banana-2.1`, но в списке для ключа её нет: возможно, раскатка | первичный | cookbook |
| Free tier: картинки и Lyria дают 429 (limit 0), TTS работает | живой тест | координатор |
| Cookbook называет Lite моделью «с free tier», живой тест это опровергает | расхождение | cookbook vs тест |
| Imagen объявлен устаревшим в Gemini API, Google советует Nano Banana | первичный | cookbook Imagen |
| Sora API: в SDK стоит «permanently shut down on September 24, 2026», то есть он уже закрыт | первичный | openai 7.39.0 |
| `gpt-image-1` уходит 23.10.2026, `gemini-2.5-flash-image` — 02.10.2026 (но ключ владельца её ещё видит) | по агрегаторам | см. Sources |
| Россия, по стороннему блогу, не входит в регионы Gemini API | не проверено | ai.google.dev/available_regions |

## 3. Генераторы изображений: сравнение

| Инструмент | Доступ для нас | Цена | Макс. размер | Альфа | Референсы и консистентность | Права |
|---|---|---|---|---|---|---|
| **Gemini app, Nano Banana Pro** | подписка AI Pro владельца, вручную | $0 сверх подписки | до 4K у Pro | нет | несколько вложений, многоходовое редактирование в одном чате | коммерческое использование, по вторичным источникам, разрешено. На Free и Pro ставится **видимая «искра»**, SynthID есть всегда |
| **Gemini API** (NB2 Lite / NB2 / 2.1 / Pro) | нужен биллинг | Lite $0,034 за 1K; NB2 $0,045 (512) – $0,151 (4K); 2.1 $0,034 за 1K; Pro $0,134 за 1–2K, $0,24 за 4K; Batch −50% *(агрегаторы)* | Lite 1K, NB2 и Pro до 4K; NB2 и Pro поддерживают соотношения от 1:8 до 8:1 | **нет**: `outputMimeType` «not supported in Gemini API» | до 14 изображений (6 в high fidelity), у Lite до 3 | Google не претендует на выход; SynthID |
| **OpenAI**: `gpt-image-2.5-flare` / `-sunburst` (09.2026), `gpt-image-2` | API закрыт сетевой политикой и платный; ChatGPT вручную | $30 за 1M выходных токенов; 1024² ≈ $0,006 (low), $0,053 (high), $0,21 (max) *(оценка)* | произвольный размер кратно 16, до 3840×2160, пропорции 1:3–3:1 | **да**, `background:"transparent"` (у gpt-image-2 — preview) | до 16 входных изображений, маска для inpainting | выход принадлежит пользователю (ToU) |
| **Midjourney V8.2** (по умолчанию с 24.07.2026) | только подписка, официального API нет | – | – | нет | `--sref`; omni-ref только в V7 (источники спорят) | на платных планах; иск Disney/Universal/WBD |
| **Recraft V4.1** | веб и API | Vector ≈$0,08, Pro Vector ≈$0,30, vectorize $0,01 (цены V3-эпохи); с 09.2026 кредиты | – | да | style sets | **на Free всё публично и принадлежит Recraft**, на платных планах полное владение |
| **Ideogram 3.x / 4.x** | веб и API | 3.0: $0,03 / $0,06 / $0,09; с character reference $0,10–0,20 | – | есть transparent-эндпоинт | character reference | платные планы |
| **Adobe Firefly** | подписка CC | – | – | да (в Photoshop) | style/structure ref | индемнити на enterprise-планах; **партнёрские модели исключены** (с 08.05.2026) |
| **FLUX.2** (BFL) | API или локально | pro $0,03 за первый MP; klein 4B $0,014 | – | нет | multi-ref (Kontext-линия) | **klein 4B — Apache-2.0**; klein 9B и dev — non-commercial без лицензии |
| **SD 3.5** | локально | – | – | через плагины | LoRA/IP-Adapter | Community License бесплатна при выручке <$1M |
| Krea, Leonardo | агрегаторы чужих моделей | кредиты | – | – | – | глубоко не исследовал |

**Вывод.** Для нас реальны два бесплатных канала: Gemini app (Nano Banana Pro) и ChatGPT. Если позже включить биллинг, лучший API — Gemini: он уже доступен из среды, а Lite и 2.1 стоят $0,034 за картинку, так что 300 картинок обойдутся примерно в $10.

## 4. Что чем делать (по типам ассетов)

| Тип | Основной путь | Альтернатива | Почему |
|---|---|---|---|
| (a) Маскот и character sheet | Ассистент рисует Искру в SVG: шар, глаза, 5 эмоций, три состояния свечения. Nano Banana Pro даёт мудборд и листы эмоций по референсам | ChatGPT, Midjourney `--sref` (только мудборд) | Вектор канонический и анимируется кодом; это решение уже принято в `design.md` |
| (b) Спрайты с альфой | Светящиеся объекты рисуем на **чёрном** и выводим аддитивно (`'lighter'` / `ADD`), альфа не нужна. Плотные объекты (банка, ворота) делаем в ChatGPT с прозрачным фоном или в Gemini парой «белый/чёрный фон» с последующим матированием | `rembg` (MIT, модели скачиваются с GitHub Releases, это работает) | Gemini альфу не отдаёт. rembg теряет полупрозрачное свечение |
| (c) Фоны и параллакс | Nano Banana Pro: каждый слой отдельно («небо», «дальние холмы», «трава-силуэт») в 21:9. Шов закрывает скрипт (кросс-фейд краёв) | API NB2: 4:1 и 8:1 для длинных полос | Слои на однотонном фоне легко матировать |
| (d) UI-иконки и бейджи | SVG от ассистента на сетке 24 px, с токенами цвета; база Lucide (ISC) или Phosphor/Tabler (MIT) | Recraft Vector, **только на платном плане** | Трассировка растра даёт грязные пути |
| (e) Онбординг и пустые состояния | Nano Banana Pro со style refs → плоский стиль → `vtracer` → `svgo`. Если стиль живописный, оставляем AVIF | ChatGPT | Стиль держится 3–6 канон-референсами |
| (f) Иконка приложения, стор, промо | Иконка — SVG от ассистента (maskable, безопасная зона 80%). Промо: фон из Nano Banana Pro или ChatGPT, реальный скриншот и **текст накладываем сами** (Unbounded) | – | Кириллицу в картинке не «запекаем» |
| (g) Промо-видео | Запись экрана с реальной игрой плюс короткие вставки Veo (Gemini app или Flow — квоты подписки не проверял) | Kling 3.0 ≈$0,08–0,11/с, Runway Gen-4.5 $0,12/с | Sora API закрыт. Честный геймплей убеждает лучше |

## 5. Альфа, векторизация, оптимизация, атласы

**Альфа без нейросетей** (проверено на синтетике):
- *Difference matting.* Одну и ту же картинку получаем на белом и на чёрном фоне (второй ход в том же чате: «тот же объект, фон #000000»). Тогда `α = 1 − mean(W − B)/255`, `color = B/α`. Ограничение: ИИ может сдвинуть пиксели между ходами. Проверяем выравнивание и отбрасываем пары с расхождением.
- *Luminance-alpha для свечения.* Берём `α = max(R,G,B)` и `color = rgb/α`. На чёрном фоне это точно, а в игре свечение всё равно рисуется аддитивно.
- *Chroma key.* Фон #00FF00 подходит только для объектов без зелёного. Мятный #5EF2C2 с ним конфликтует.

**Векторизация:**
- `vtracer` (MIT; есть в PyPI 0.6.15 и wasm) — основной вариант для цветных плоских иллюстраций.
- `potrace` (GPL-2.0) — для монохромных силуэтов. Запускаем только как CLI при сборке и не включаем в бандл.
- `imagetracerjs` (Unlicense) — работает в браузере.
- Recraft vectorize ($0,01) и Illustrator Image Trace — платные запасные варианты.

Перед трассировкой квантуем изображение к палитре токенов (6–12 цветов). Без этого SVG раздувается. После трассировки прогоняем `svgo` 4.1 (MIT) с точностью 1–2 знака.

**Растр.** `sharp` 0.35 (Apache-2.0) выдаёт AVIF (q≈50) + WebP + PNG-fallback и ресайзит под 1×/2×. Squoosh удобен для ручной проверки.

**Атласы:**
- `free-tex-packer-core` (MIT) или `@assetpack/core` 1.7 (MIT, официальный от PixiJS) — бесплатная замена TexturePacker.
- Формат — JSON-Hash в духе PixiJS: `frames{name:{frame,rotated,trimmed,spriteSourceSize,sourceSize}}`, `animations`, `meta{image,size,scale}`. Этот JSON читает и `Assets.load` в PixiJS 8.22, и наш собственный загрузчик для Canvas 2D.
- Атлас ≤2048² — так безопаснее на слабых Android.

**Figma.** Бесплатного плана хватает на доску стиля: токены, сетка иконок, раскладка промо, экспорт SVG. Это рабочий стол, а не источник правды: канон лежит в репозитории.

## 6. Анимация

| Инструмент | Лицензия и цена | Когда |
|---|---|---|
| SVG/CSS + **Motion 14** | MIT | UI, Искра v1: моргание, сжатие, цвет свечения |
| **GSAP 3.15** | бесплатно, но лицензия собственная («Standard no-charge»), не OSS | сложные таймлайны: интро, карта |
| **Rive** | рантаймы MIT; редактор бесплатен; **экспорт с 20.10.2025 только на платном плане** (Cadet $9/мес при оплате за год). Экспортированные файлы работают и после отмены подписки | Искра v2 со state machine, когда появится аниматор |
| **Lottie** | lottie-web 5.13 и dotlottie-web 0.81 — MIT | готовые праздничные анимации; у dotLottie тяжёлый wasm |
| **Spine** | Essential $69, Pro $369 (снимок страницы продажи); дистрибуция рантайма требует лицензии редактора; порог выручки $500k | только если будут скелетные персонажи. Нам не нужен |

**ИИ-помощники.** Видеомодели (Veo, Kling) умеют оживить кадр, а кадры потом можно нарезать в спрайт-лист. Но кадры «плывут» по форме и цвету. Годится для промо, не для игровых циклов. Генерировать спрайт-листы прямо в Gemini или ChatGPT ненадёжно: сетка и масштаб гуляют. Анимацию Искры пишем кодом.

## 7. Видео для промо

| Модель | Цена (агрегаторы) | Заметки |
|---|---|---|
| Veo 3.1 (`veo-3.1-generate-preview`, `-fast-`, `-lite-`) | Lite ≈$0,05/с, Fast ≈$0,10–0,15/с, Standard ≈$0,40/с; free tier нет | SynthID в каждом видео; в API только платно |
| Sora 2 | – | **API закрыт 24.09.2026** |
| Kling 3.0 | ≈$0,084 (720p) – $0,112 (1080p) за секунду | кредиты; оплата из РФ сложна |
| Runway Gen-4.5 | 12 кредитов/с = $0,12/с | возможен enterprise-гейт |

Трейлер на 30 с собираем из записи экрана (OBS или запись Chrome), живого человека в планке (только с письменным согласием) и 2–3 ИИ-вставок по 4 с. Это около $5 через API или $0 в рамках квот подписки.

## 8. Аудио

**SFX.** Сначала процедурные звуки: `zzfx` (MIT) — «динь», вспышки, промах, пара сотен байт кода. Дальше CC0-библиотеки. Звуки ElevenLabs допустимы на платном плане (условия SFX официально не перепроверены).

**Музыка для «Пульса»** (детали в `music-sources.md`):
- **Suno:** договор с WMG (11.2025), но спор с UMG и Sony продолжается; 18.09.2026 подан новый иск против моделей V6.
- **Udio:** договор с UMG, загрузки закрыты («walled garden»).
- **ElevenLabs Eleven Music:** на self-serve планах исключены «Studio Games». По агрегатору, инди-игра разрешена до $500k выручки за всё время; для студийных игр нужен Enterprise.
- **Lyria 3** на free tier не работает (429).

Вывод: библиотеку собираем из заказных и CC-треков, ИИ-музыку берём только у вендоров с лицензированным обучением и прямо разрешённым использованием в играх.

**Голос тренера (RU):**

| Вариант | Качество | Лицензия и цена | Вердикт |
|---|---|---|---|
| **Gemini TTS** (`gemini-3.1-flash-tts-preview`, `gemini-3.8-flash-tts`) | высокое, есть стиль через промпт | free tier работает (тест). Входные данные free tier Google может использовать для улучшения сервисов, поэтому подаём только публичные фразы | **Основной: пре-рендер** |
| ElevenLabs | высокое | платный, коммерческое использование на paid | запасной |
| OpenAI TTS | хорошее | API закрыт сетевой политикой | – |
| Google Cloud TTS, Yandex SpeechKit | хорошее | платно; страница тарифов Яндекса обновлена 07.07.2026, цифры не получил | Яндекс — если нужен РФ-вендор |
| **Silero** | хорошее, есть автоударения | `v5_x_ru` (aidar, baya, xenia…) — **CC BY-NC**, коммерция запрещена. `v5_cis_base` (голоса `ru_*`, есть и `uzb_saida`) — **MIT**, но ударения нужно ставить вручную | MIT-вариант пригоден офлайн |
| Piper | среднее | движок переехал в `piper1-gpl` (GPL-3.0), у каждого голоса своя лицензия | только как CLI для пре-рендера |
| Web Speech API | зависит от ОС | бесплатно | fallback (уже в прототипе) |

Пре-рендер: 150–300 фраз → WAV 24 кГц → Opus 32 кбит/с. Это примерно 3–6 КБ на фразу, кэшируется в SW.

## 9. Юридический чек-лист

1. **Охрана авторским правом.** В США человеческое авторство обязательно. Позиция Copyright Office (Part 2, 2025): одних промптов недостаточно, охраняются отбор, компоновка и существенная доработка. Верховный суд 02.03.2026 отказал в certiorari по *Thaler v. Perlmutter*. В РФ автор — только человек (ст. 1257, 1228 ГК), ИИ — инструмент, творческий вклад нужно доказать. Статус законопроекта № 1271570-8 не проверен. **Действие:** каноничные ассеты (Искра, иконки, лого) делаем вручную в SVG. Для ИИ-ассетов фиксируем в манифесте отбор и правки.
2. **ToS по инструментам:**
   - Recraft Free — ассеты принадлежат Recraft и публичны. Не используем.
   - FLUX klein 9B и dev — некоммерческие.
   - Adobe — индемнити не распространяется на партнёрские модели.
   - Midjourney — только платный план.
   - Silero `v5_x_ru` — NC.
   - ElevenLabs Music — оговорка про игры.
3. **EU AI Act, ст. 50** действует с 02.08.2026. Маркировка по 50(2) — обязанность провайдеров (Google и OpenAI ставят SynthID и C2PA). Для систем, выпущенных до этой даты, есть отсрочка до 02.12.2026. Code of Practice финализирован 10.06.2026. Мы — deployer. Обязательная пометка для нас касается **дипфейков** (реалистичные люди, места, события). Стилизованная игровая графика сюда не относится, а для явно художественных работ раскрытие допускается в мягкой форме. **Действие:** не делаем реалистичных «отзывов» и фальшивых людей в промо; на странице «О проекте» добровольно пишем, что часть графики сделана с ИИ.
4. **Водяные знаки.** SynthID живёт в пикселях и переживает обработку. C2PA-метаданные `sharp` срезает. Это допустимо, но оригиналы с метаданными храним в архиве. Видимую «искру» Gemini app намеренно не вырезаем. Полноэкранные фоны берём из источников без видимой метки (ChatGPT, API) или делаем процедурно. Есть ли в Gemini Apps Terms прямой запрет на удаление метки — нужно проверить.
5. **Стиль и персонажи.** В промптах нет имён живых художников, «Ghibli», «Pixar» и франшиз. OpenAI отказывает в стиле живых авторов, но разрешает «студийные стили»; для нас это всё равно риск. Против Midjourney идут иски Disney, Universal и WBD. Маскота и иконку проверяем обратным поиском изображений на сходство (совы Duolingo, шары-маскоты).
6. **Товарные знаки.** Перед публикацией в стор проверяем «Plank Run» и «Искра» по ФИПС/Роспатенту и WIPO Global Brand Database. Иконка не должна напоминать чужие бренды.
7. **Приватность.** Фото и видео пользователей и реальных людей в генераторы не загружаем. В Gemini app отключаем использование активности для обучения, если владельцу это важно.

## 10. Пайплайн консистентности

```
style-bible → canon refs → генерация (вручную) → inbox → курирование →
альфа/вектор/палитра → анимация (код) → экспорт/бюджет → манифест → git
```

1. **Style bible** (`art/style-bible.md` + `art/refs/canon/` из 3–6 PNG). Что в нём:
   - токены: #0B0D17, #5EF2C2, #7C6CFF, янтарный, коралловый;
   - правила свечения: ядро плюс 2 ореола, без бликов-звёзд;
   - формы: скруглённые, без контуров, плоские планы;
   - свет: лунный холодный сверху, тёплые акценты только у светлячков;
   - негатив-лист: фотореализм, текст, рамки, шахматка, водяные знаки.
2. **Библиотека промптов** `art/prompts.yaml`. Каждая запись содержит `id`, `asset`, `tool`, `model_label`, `aspect`, `refs:[sha256…]`, `prompt`, `negative`, `variants`. Промпт собирается шаблоном: `[STYLE_BLOCK] + [SUBJECT] + [BACKGROUND: solid #000000 | solid #FFFFFF] + [FRAMING: centered, 15% margin]`.
3. **Генерация.** Владелец работает в одном чате на серию и каждый раз прикладывает канон-референсы. Для пары под матирование вторым ходом просит «identical, background pure black».
4. **Inbox.** `art/inbox/<prompt-id>/<n>.png`. Ассистент считает sha256 и строит контакт-лист для отбора.
5. **Обработка** (скрипт `scripts/art/process.py`): альфа (difference, luminance или rembg), обрезка по альфе, квантование к палитре, при необходимости `vtracer` → `svgo`, затем `sharp` в AVIF, WebP и PNG.
6. **Анимация** — кодом (Canvas, Motion). Rive подключаем позже.
7. **Бюджеты:** фон-слой ≤120 КБ AVIF при ширине 1920; иконка ≤2 КБ SVG; атлас ≤2048²; графика одной игры ≤1 МБ; ленивая подгрузка.
8. **Манифест** `art/manifest.json` на каждый ассет: `{id, source_tool, model_label, date, prompt_id, refs, raw_sha256, human_edits, license_basis, ai_generated:true}`.

**Воспроизводимость.** В приложениях Gemini и ChatGPT нет сидов, и модель меняется без предупреждения. Поэтому «воспроизводимость» = исходник + точный промпт + хэши референсов + метка модели и дата. В API закрепляем снимок модели (`gpt-image-2-2026-04-21`). Сиды по-настоящему работают только локально (FLUX klein 4B, SD 3.5).

Сырые PNG весят много. Их храним вне основного дерева (Git LFS или релиз-архив), а в git кладём `selects/` и готовые ассеты.

## 11. Скрипты: Gemini API

**Картинки** — нужен биллинг; пригодится, если владелец его включит. Node 22, без SDK:

```js
// scripts/art/gen.mjs — node gen.mjs prompts.json
import fs from 'node:fs/promises'; import crypto from 'node:crypto';
const KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.1-flash-image';            // или gemini-3.1-flash-lite-image (дешевле, 1K)
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const b64 = async p => (await fs.readFile(p)).toString('base64');

async function gen({ id, prompt, refs = [], aspect = '1:1', size = '1K' }, n) {
  const parts = [{ text: prompt },
    ...await Promise.all(refs.map(async r => ({ inlineData: { mimeType: 'image/png', data: await b64(r) } })))];
  const res = await fetch(url, { method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: aspect, imageSize: size } } }) });   // '1K'|'2K'|'4K'; '512' — в Interactions API
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);    // 429 limit:0 = нет биллинга
  const img = (await res.json()).candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!img) throw new Error('no image (safety block?)');
  const buf = Buffer.from(img.inlineData.data, 'base64');
  const file = `art/inbox/${id}/${n}.png`;
  await fs.mkdir(`art/inbox/${id}`, { recursive: true }); await fs.writeFile(file, buf);
  return { id, file, model: MODEL, sha256: crypto.createHash('sha256').update(buf).digest('hex'), date: new Date().toISOString() };
}
const jobs = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const log = [];
for (const j of jobs) for (let n = 0; n < (j.variants ?? 2); n++) {
  try { log.push(await gen(j, n)); } catch (e) { console.error(j.id, e.message); }
  await new Promise(r => setTimeout(r, 1500));        // щадим RPM
}
await fs.appendFile('art/gen-log.jsonl', log.map(x => JSON.stringify(x)).join('\n') + '\n');
```

Альфу API не отдаёт. Для прозрачности делаем второй запрос: первый результат идёт в `parts` с текстом «same image, background pure #000000». Для больших пакетов есть Batch API (−50%, по агрегаторам).

**Голос** работает на free tier. Тот же эндпоинт с моделью `gemini-3.1-flash-tts-preview`, в теле `generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }`. В ответе `inlineData` — сырой PCM 16 бит, 24 кГц, моно. К нему нужен WAV-заголовок, затем `ffmpeg -c:a libopus -b:a 32k`. Текст фразы задаёт стиль: «Спокойно и ободряюще: Держи спину ровно!»

**Постобработка** (Python, без сети; формулы проверены):

```python
import numpy as np; from PIL import Image
def diff_matte(white_png, black_png):
    W = np.asarray(Image.open(white_png).convert('RGB'), float)
    B = np.asarray(Image.open(black_png).convert('RGB'), float)
    a = np.clip(1 - (W - B).mean(-1) / 255, 0, 1)
    rgb = np.clip(B / np.maximum(a[..., None], 1e-3), 0, 255)
    return Image.fromarray(np.dstack([rgb, a * 255]).astype('uint8'), 'RGBA')
def glow_alpha(black_png):                      # для аддитивных спрайтов свечения
    B = np.asarray(Image.open(black_png).convert('RGB'), float)
    a = B.max(-1) / 255
    rgb = np.clip(B / np.maximum(a[..., None], 1e-3), 0, 255)
    return Image.fromarray(np.dstack([rgb, a * 255]).astype('uint8'), 'RGBA')
# далее: vtracer.convert_image_to_svg_py(in, out, colormode='color', filter_speckle=4)
# и npx svgo; npx sharp-cli / sharp: .avif({quality:50}) .webp({quality:80})
```

## 12. Подводные камни

- **Модели меняются быстро.** За 2026 год закрыли Sora API и Imagen в Gemini API, уходят `gpt-image-1` и `gemini-2.5-flash-image`. Закрепляем метку модели в манифесте и не завязываем сборку на конкретный API.
- **«Прозрачный фон» в Gemini — ловушка.** Модель рисует серо-белую шахматку вместо альфы. В промпте всегда задаём однотонный фон, «transparent» не пишем.
- **Цвета дрейфуют.** Неон выходит «чуть не тем» мятным. Квантуем к токенам и проверяем ΔE.
- **Матирование пары ломается**, если второй ход сдвинул объект. Проверяем по маске и отбрасываем такие пары.
- **rembg съедает полупрозрачное свечение.** Для светящихся объектов используем аддитивный путь.
- **Кириллица в генерациях** бывает с ошибками. Текст накладываем шрифтом.
- **Трассировка живописи** даёт SVG на сотни КБ. Векторизуем только плоский стиль.
- **Лицензии.** Recraft Free, FLUX dev и klein 9B, Silero `v5_x_ru` и `potrace` в бандле — ловушки. Piper — GPL.
- **Регионы и оплата.** Gemini API, по стороннему блогу, недоступен в РФ; OpenAI — тоже. Подписка у владельца уже есть, API-биллинг не нужен.
- **Видимая метка Gemini app** на Free и Pro. Для полноэкранных изображений берём ChatGPT, процедурную графику или API.
- **Free tier TTS:** входные данные может читать Google. Подаём только публичные реплики тренера.
- **Ассистент не управляет Chrome владельца** из облака. Генерация остаётся ручной, автоматизировать можно только постобработку.
- **WebFetch в этой сессии был заблокирован**, поэтому цены взяты из вторичных сводок. Перед тратами сверяем с официальными страницами цен.

## Sources

Первичные (открыты в этой сессии):
- Gemini cookbook, Nano Banana: https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_Started_Nano_Banana.ipynb
- Cookbook Imagen (deprecated): https://raw.githubusercontent.com/google-gemini/cookbook/main/quickstarts/Get_started_imagen.ipynb ; Veo: https://raw.githubusercontent.com/google-gemini/cookbook/main/quickstarts/Get_started_Veo.ipynb ; TTS: https://raw.githubusercontent.com/google-gemini/cookbook/main/quickstarts/Get_started_TTS.ipynb
- `@google/genai` 2.30.0 (ImageConfig, ID моделей): https://registry.npmjs.org/@google/genai/-/genai-2.30.0.tgz
- `openai` 7.39.0 (модели GPT Image, background, size, закрытие Sora): https://registry.npmjs.org/openai/-/openai-7.39.0.tgz
- Silero: https://github.com/snakers4/silero-models ; Piper: https://github.com/OHF-Voice/piper1-gpl
- Лицензии пакетов: npm registry (svgo, sharp, free-tex-packer-core, @assetpack/core, pixi.js, potrace, imagetracerjs, lucide-static, @phosphor-icons/core, zzfx, motion, gsap, @rive-app/canvas-lite, @lottiefiles/dotlottie-web), PyPI (vtracer, rembg)

Вторичные (сводки веб-поиска):
- Цены Gemini: https://www.aifreeapi.com/en/posts/gemini-image-generation-api-pricing ; https://www.eesel.ai/blog/nano-banana-2-lite-pricing ; https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing ; https://apidog.com/blog/nano-banana-2-1/ ; https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image
- Регионы: https://ai.google.dev/available_regions
- OpenAI: https://developers.openai.com/api/docs/models/gpt-image-2.5-flare ; https://mlq.ai/news/openai-previews-native-transparent-backgrounds-for-gpt-image-2-api/ ; https://www.aifreeapi.com/en/posts/openai-image-generation-api-pricing
- Midjourney: https://apiframe.ai/models/midjourney ; https://blakecrosley.com/guides/midjourney
- Recraft: https://www.recraft.ai/docs/api-reference/endpoints ; https://openrouter.ai/recraft/recraft-v4.1-vector/pricing ; https://www.recraft.ai/docs/plans-and-billing/commercial-rights-and-ownership.md
- Ideogram: https://ideogram.ai/features/api-pricing
- Adobe: https://helpx.adobe.com/legal/product-descriptions/partner-model.html
- FLUX: https://invideo.io/blog/flux-ai-image-generator/ ; https://openrouter.ai/black-forest-labs/flux.2-pro
- Stability: https://stability.ai/license
- Матирование на белом и чёрном: https://replicate.com/jide/nano-banana-2-transparent
- Водяные знаки: https://www.aifreeapi.com/en/posts/nano-banana-pro-watermark-commercial-use ; https://searchenginejournal.com/google-lets-you-turn-off-visible-watermarks-in-gemini/586145
- Авторское право США: https://www.hklaw.com/en/insights/publications/2026/03/the-final-word-supreme-court-refuses-to-hear-case-on-ai-authorship ; https://www.finnegan.com/en/insights/ip-updates/supreme-court-declines-to-hear-thaler-v-perlmutter-leaving-human-authorship-requirement-intact.html
- EU AI Act ст. 50: https://www.paulweiss.com/insights/client-memos/eu-finalises-transparency-rules-for-ai-generated-content ; https://www.reedsmith.com/our-insights/blogs/viewpoints/102nbz0/transparency-obligations-for-ai-generated-content-the-code-of-practice-adequacy/ ; https://www.actuia.com/en/news/ai-act-obligations-in-force-and-delays-under-omnibus-2026-1744/
- РФ: https://zakon.ru/blog/2026/6/2/avtorskie_prava_na_kontent_sozdannyj_nejrosetyu_chto_vazhno_uchest ; https://pravo.ru/story/260252/ ; https://www.tks.ru/reviews/2026/08/05/0004/zakon-ob-ii-dorabotayut-dlya-zaschityi-avtorskogo-kontenta-pri-obuchenii-nejrosetej/
- Стиль и иски: https://fortune.com/2025/03/27/chatgpt-studio-ghibli-hayao-miyazaki-openai-altman-copyright-lawsuit ; https://siliconangle.com/2025/03/27/openais-viral-studio-ghibli-inspired-ai-art-comes-hailstorm-criticism/ ; https://graphicpolicy.com/2025/11/14/court-suggests-disney-v-midjourney-go-to-mediation/
- Музыка: https://www.digitalmusicnews.com/2026/04/09/suno-universal-music-lawsuit-settlement-impasse/ ; https://www.chartlex.com/blog/business/music-industry-ai-lawsuits-tracker-2026 ; https://elevenlabs.io/eleven-music-model-specific-terms ; https://elevenlabs.io/blog/eleven-music-now-available-in-the-api
- Yandex SpeechKit: https://yandex.cloud/ru-kz/docs/speechkit/pricing
- Видео: https://higgsfield.ai/blog/ai-video-api-pricing-vs-subscriptions ; https://tech-insider.org/runway-gen-4-5-api-setup-ai-video-2026/
- Анимация: https://rive.app/blog/rive-s-new-9-mo-plan ; https://rive.app/docs/runtimes ; https://esotericsoftware.com/spine-purchase ; https://raw.github.com/EsotericSoftware/spine-runtimes/master/LICENSE
