# Plank Run: визуальная разработка — арт-библия и производственный план

*Версия 1.0, 19.10.2026, к производству. Основа: `docs/research/visual-ai.md` (его факты главнее), `design.md`, `verify-frontend-design.md`, `docs/plan/spec-product-progression.md`, `spec-rhythm-music.md`, `spec-frontend-design.md` §6 (токены — источник правды), код и снимки прототипа. Пять веб-поисков 19.10.2026 уточнили метку Gemini, лимиты AI Pro, прозрачность в ChatGPT и теги Gemini TTS.*

## 0. Решения коротко

1. **Три источника.**
   - **Код:** всё, что светится, движется и считается.
   - **SVG ассистента:** Искра, иконки, значки, карта, схемы камеры и техники, логотип, иконка приложения.
   - **ИИ-растр, который владелец генерирует вручную** (Gemini app с Nano Banana Pro, ChatGPT): фоны миров, тайлы карты, боссы, иллюстрации, промо.
2. **ИИ не делает** текст в картинках, канон Искры, иконки, логотип и схемы техники.
3. **$0 на API.** До 20–30 генераций в день (лимит Nano Banana Pro в AI Pro — около 100, под нагрузкой меньше). Одна серия — один чат.
4. **Прозрачность** (§6.2): плотное — пара «белый, затем тот же кадр на чёрном» и матирование разницей; свечения — на чёрном, альфа из яркости. Слово «transparent» в Gemini даёт шахматку.
5. **Канон C1–C6** прикладывается к каждому запросу. C1 (палитра) и C4 (Искра) делает ассистент.
6. **Метка Gemini.** С 14.08.2026 есть переключатель Settings → Media watermark (не везде; где метку требует закон, его нет). Сами метку не вырезаем; если она есть — полноэкранное делаем в ChatGPT.
7. **Голос** — бесплатный Gemini TTS: 2 голоса × ~150 клипов, AAC `.m4a`. Ритмические и UI-звуки — код или WAV.
8. **Производительность.** Никакого `shadowBlur` в кадре: атлас свечений рисуется из токенов при загрузке. Фон мира ≤ 250 КБ, атлас ≤ 2048².

## 1. Арт-библия

### 1.1 Столпы и настроение

1. **Свет в темноте.** Ночь и немного светящихся объектов: видно с пола, экономно на OLED, узнаваемо.
2. **Ты — Искра.** Курсор и маскот — одно существо.
3. **Тёплый тренер, не надзиратель.** Мягкие формы, никакой вины.
4. **Один главный объект.** Не понятно за 0,5 с с 1,5 м — переделываем.

Настроение: ночной, уютный, светящийся, игривый, сосредоточенный. Чего избегаем: киберпанк-грязь, агрессия, «качалка», фотореализм, глянцевый 3D, детсад, хоррор.

### 1.2 Палитра

База — токены `spec-frontend-design.md` §6.2: bg #0B0D17, surface #161A33, text #F2F4FF, brand #7C6CFF, ok #5EF2C2, warn #FFB547, bad #FF5D7A, info #4CC9FF, coin #FFD25E. Новые группы `art.*` и `game.*` добавляем в `tokens.json`, потому что цвета в коде игр запрещены.

| Токен | Hex | Роль |
|---|---|---|
| `art.night-0…4` | #060818, #0A1230, #0E1638, #14243A, #1B1F45 | небо сверху вниз |
| `art.hill-far`, `hill-near`, `grass` | #0B1630, #081022, #06101C | силуэты |
| `art.moon`, `art.rim` | #E8EEFF, #A397FF | луна, контровой свет |
| `game.firefly`, `gold`, `moonfly` | #D8FF6A, #FFD25E, #A8E1FF | светлячки |
| `game.hazard` | #FF7A45 | опасности (не `bad`) |
| `game.shield` | #4CC9FF | щит, «замри» |
| `game.ghost` | #A3A9D1 @45%, пунктир | призраки, соперник |
| `game.care` | #A397FF | Искра сочувствует |
| `judge.perfect/great/good/miss` | #FFD25E, #5EF2C2, #4CC9FF, #A3A9D1 | оценки «Пульса» |

**Правка:** в `design.md` «Идеально» было цианом; берём вариант ритм-спецификации (§5.7) и обновляем `judge.*`.

| Мир / игра | Фон | Силуэты | Акценты |
|---|---|---|---|
| W1 Поляна (Светлячки) | #060818→#14243A | #0B1630, #081022 | #D8FF6A, #FFD25E, #A8E1FF |
| W2 Неоновый тоннель | #0B0D17→#1B1F45 | #161A33 | #7C6CFF, #5EF2C2, #FFD25E |
| W3 Океан | #07101C→#0B1A2E | #0A2233 | #4CC9FF, #5EF2C2 |
| W4 Космос (Звездопад) | #070914 | #1E2347 | туманность #3A2A7A и #1B4E5E, #FFD25E |
| W5 Вулкан | #120A14→#2A0F1C | #1C0E18 | лава #E8552B, угли #FF8A3D |
| W6 Сияние (Высота) | #071120→#0E2340 | #1C2A44 | #5EF2C2, #7C6CFF, #A8E1FF |
| Пульс | #0B0D17 | дорожки #161A33, линии #2E3566 | нота #A397FF, рельс #5EF2C2, дуга #4CC9FF, золотая #FFD25E |
| Канат | #12152A→#2B1F4A | канат #E8D5B0 | ты — скин, соперник — `ghost` |
| Статуя | #0B0D17 | Страж #3A3F66 | «Иди» мятный, «Замри!» фиолетовый, «Заметил» янтарный |

**Зарезервированные цвета.** Янтарный и коралловый в игровом поле означают только состояние техники. Опасность — это `hazard` плюс угловатая форма. Лава и угли живут только в дальних слоях.

### 1.3 Свет, форма, линия, фактура

- **Свет.** Холодная луна сверху слева (10–11 часов), блик на Искре там же, как у шара в `tunnel.js`. Луну в `fireflies.js` переносим в левый верх, под линию HUD. Контровой свет `art.rim` — по верхним кромкам. Тёплый свет излучают только объекты. Теней нет, под Искрой — световое пятно.
- **Свечение:** ядро r (белое → цвет), ореол 2r при 45%, ореол 5r при 12%, аддитивно. Без лучей-звёзд.
- **Форма:** круг и суперэллипс — игрок, друзья, награды; углы и треугольники — опасность и ▲; окружение — мягкие холмы без контуров.
- **Линия:** в иллюстрациях контуров нет; иконки — метрики Phosphor Bold, круглые концы; схемы — 3–5 px при ширине 360; в игре край — это свечение.
- **Фактура:** плоско. Только в фонах зерно 1–2% против полос градиента.

### 1.4 Движение

- Длительности `--dur-1/2/3` (120/220/420 мс), пружины UI `400 30`, Искра `260 14`.
- Сжатие и растяжение — только Искра и награды.
- Опасность предупреждает за 1,5–2 с. Отклик на событие ≤ 100 мс. Тряска ≤ 6 px, ≤ 250 мс, не чаще раза в секунду.
- Параллакс: 0,05 / 0,15 / 0,35 / 1. Idle-петли ≥ 2 с, амплитуда ≤ 3%.
- Вспышки — через `FlashLimiter`, ≤ 3 в секунду.
- Частиц одновременно: A 300, B 150, C 50.
- Reduced motion убирает тряску, параллакс, частицы и конфетти; смысловые смены состояний остаются.

### 1.5 Читаемость на расстоянии

Метод `design.md` §2: телефон 0,165 мм на px, ноутбук 0,20 мм. Числа — телефон / ноутбук, CSS px, умножаются на `--view-scale`.

| Класс | Угол | 0,7 м | 1,5 м | 3 м |
|---|---|---|---|---|
| Игрок, Искра (диаметр) | 1,0° | 74 / 61 | 159 / 131 | 317 / 262 |
| Опасность | 0,75° | 56 / 46 | 119 / 98 | 238 / 196 |
| Награда, нота | 0,55° | 41 / 34 | 87 / 72 | 175 / 144 |
| Знак ● ▲ ✕ | 0,6° | 44 / 37 | 95 / 79 | 190 / 157 |
| Зазор | 0,3° | 22 / 18 | 48 / 39 | 95 / 79 |
| Линия | 0,1° | 7 / 6 | 16 / 13 | 32 / 26 |
| Подпись, x-высота | 0,2° | 28 / 23 | 60 / 49 | 120 / 99 |

На 3 м видны только главная цифра, полоса состояния и крупные силуэты; остальное говорит голос.

CI-скрипт `legibility.mjs` проверяет снимки `/_dev/gallery`:
- **Прищур:** кадр уменьшается в 4 раза и размывается; игрок и опасности должны остаться пятнами с контрастом ≥ 3:1.
- **Тихий центр:** светлота фона в игровой зоне ≤ 0,04, разброс ≤ 0,03.

### 1.6 Состояния

| Состояние | Цвет | Знак | Слово | Звук | Где |
|---|---|---|---|---|---|
| ok | #5EF2C2 | ● | «Техника в порядке» | «динь» | StatusBand, ореол Искры |
| warn | #FFB547 | ▲ | «Таз выше» и т. п. | 440→330 Гц + голос | ореол янтарный, брови домиком |
| broken | #FF5D7A | ✕ | 2–4 слова | голос | тонировка 20%, кольцо 4 с, Искра «стоп» |
| lost | #A3A9D1 | ◌ | «Не вижу тебя» | голос | Искра ищет глазами |

При дейтеранопии ok и warn сливаются (1,25:1), поэтому знак обязателен везде.

### 1.7 Можно и нельзя

| Можно | Нельзя |
|---|---|
| Тёмный тихий центр фона | Детали и блики за траекторией игрока |
| Свечение из атласа | `shadowBlur` и `filter` в каждом кадре |
| Текст шрифтом поверх | Текст, запечённый в ИИ-картинку |
| Круглые награды, угловатые опасности | Угловатые награды |
| Искра из канонического SVG | ИИ-Искра в продукте |
| Нейтральный манекен в схемах | «Идеальные» фитнес-тела, бренды одежды |
| Сочувствие после боли | Грусть и вина за пропуск |
| Сказочные боссы | Хоррор, кровь |
| Мотивы, проверенные друзьями из RU и UZ | Флаги, религия, политика |
| Хохолок из трёх круглых лопастей | Четырёхлучевая «искра», как у логотипа Gemini |

## 2. Маскот «Искра»

### 2.1 Бриф

Светлячок-огонёк, который держит планку вместе с игроком: тёплая, любопытная, честная, немного озорная. Не стыдит никогда. Пол и возраст не считываются. Работает от 24 px (фавикон) до 512 px (итоги). Голоса: «Мягкий», «Бодрый», «Минимум слов».

### 2.2 Построение (SVG, viewBox 0 0 128 128)

| Часть | Геометрия | Цвет |
|---|---|---|
| Ореолы | круги r 60 и r 46 | цвет состояния (в покое — скин), 12% и 45% → 0 |
| Тело | круг (64, 68), r 36, фокус градиента (52, 56) | #FFFFFF → светлый тон скина (#C9FFEC) → скин (#5EF2C2) |
| Хохолок | три округлые лопасти 20×18 над телом | светлый тон скина |
| Глаза | эллипсы 5×8,5 в (52, 66) и (76, 66), блик r 2 | #0B0D17 |
| Рот, брови | дуга 10 в (64, 80), штрихи 2,5 px | #0B0D17 |
| Румянец | эллипсы 7×4 под глазами | #FFB3C7 @35% |
| Искорки-ладошки | капли r 5 в (24, 76) и (104, 76) | светлый тон скина |

Рук и ног нет, жесты делают искорки. Ниже 32 px остаются тело, глаза и бугорок хохолка. Якоря аксессуаров: `head-top` (64, 30), `eyes` (64, 66), `back`, `trail` (64, 104). Развороты: анфас, 3/4, профиль, спина (Тоннель, Титан), сверху (карта); лист разворотов — это C4.

### 2.3 Состояния (`mood`)

Расширяем перечисление `spec-frontend-design.md` §6.6; `sad` заменяем на `care`, потому что Искра не грустит из-за пропусков.

| `mood` | Когда | Лицо | Тело, искорки | Свечение |
|---|---|---|---|---|
| `idle` | меню | моргание раз в 2–6 с | дыхание 4 с | скин |
| `look` | «Вижу тебя!» | зрачки следят за лицом | наклон к цели | скин |
| `happy` | поймала, ответ анкеты | «^ ^», улыбка, румянец | подскок 0,9/1,1 | +20% |
| `cheer` | подбадривает | глаза широко, рот «о» | искорки вверх | скин |
| `proud` | ★, новый рубеж | прищур, брови вверх | «грудь вперёд» | золотой блик |
| `worry` | warn | брови домиком | сжатие 0,95 | янтарь + ▲ |
| `stop` | broken | глаза широко | искорка вперёд — «стоп» | коралл + ✕ |
| `tired` | флаг усталости | полуприкрыты, капля | сплющена | 70% |
| `breathe` | отдых | закрыты | масштаб за кольцом 4+4 с | пульс |
| `point` | показывает | взгляд на цель | искорка-стрелка, 8 направлений | скин |
| `celebrate` | цель, босс | «^ ^», улыбка | прыжок, оборот, 12 искр | вспышка |
| `wow` | новый предмет | круглые, «о» | подскок | скин |
| `care` | после «Болит» | мягкие, брови чуть вверх | искорка у «сердца» | #A397FF |
| `sleep` | день отдыха | дуги вниз | шире, дыхание 6 с, круглые «z» | 40% |

Переходы — пружиной за 220 мс; при reduced motion позы меняются без движения.

### 2.4 Кастомизация

Слоты: скин тела (без янтарных и коралловых оттенков — они заняты состояниями); голова (шапка, корона, наушники, допа); лицо (очки); спина (рюкзак, шарф); шлейф (искры, звёзды, ноты, снежинки); аура в меню; анимация победы; скины банки, шара и курсора.

Аксессуар ≤ 1,5 КБ и читается на 48 px. При warn и broken ореол всегда цвета состояния. Цены 60/150/300 ◆.

### 2.5 Анимации и сборка

Анимации: моргание, дыхание, взгляд, подскок на узел, сжатие при поимке, смена настроения, праздник, «стоп», засыпание, указание, сундук, вход и выход.

Сборка:
- `iskra.geom.json` → `<Iskra mood size skin />` (SVG + Motion) и `drawIskra(ctx, state)` для canvas;
- в играх — атлас OffscreenCanvas при загрузке (3 размера × настроения);
- Rive (v2) — за тем же интерфейсом `mood`, входы `mood`, `form`, `lookX/Y`, `skin`;
- ИИ — только мудборды P05 и P06.

### 2.6 Искра в играх

| Где | Как |
|---|---|
| Светлячки | Свет банки: глаза сквозь стекло, смотрит на ближайшего светлячка; банка полна — `celebrate` |
| Тоннель | Шар со спины, хохолок и шлейф; на «почти задел» оглядывается; в режиме по оси y — профиль |
| Пульс | Курсор, r = 0,35 дорожки; на ×4 — золотое кольцо «В ударе» |
| Звездопад | Вбирает звёзды; на «замри» — пузырь щита |
| Титан | Внизу со спины; пока техника чистая, луч бьёт в босса |
| Высота | Профиль, искорки-крылья |
| Канат | Две Искры (ты и призрак) тянут канат |
| Статуя | Крадётся подскоками; «Замри!» — зажмурилась, иней по контуру |
| Метаэкраны | Сидит на узле карты, ведёт онбординг, празднует на итогах, служит аватаром и героем карточек |

## 3. Игры

**Общее.**
- **Слои:** L0 небо (код) → L1 дальний (ИИ) → L2 средний (ИИ или код) → L3 поле (код) → L4 эффекты (аддитивно) → L5 HUD (DOM).
- Край 12 px свободен для StatusBand.
- **Фон мира общий для всех игр мира:** тема мира = подпалитра + дальний слой + тип частиц. Так 8 игр × 6 миров не дают 48 наборов.
- **HUD** — DOM оболочки: главная цифра с кольцом сверху, игра отдаёт ≤ 2 показателей и не рисует под ними.
- **Покадровых спрайт-листов нет:** ИИ-кадры «плывут», поэтому анимация — код и твины, единственный риг — cutout боссов.
- **Уровень C:** без свечений и частиц, фон 1280 px.

**3.1 Светлячки (M1, Canvas).**
- Фон W1 (P07, P08), трава и звёзды кодом.
- Светлячок: появление 0,4 с → блуждание → уход (мигает ≤ 3 Гц последние 1,5 с) → пойман (12–24 частицы) или улетел.
- Банка заполняется светом 0→15, при полной — вспышка.
- Модификаторы: «Ночь золотых» (тёплое небо), «Ветер» (листья), «Пары» (нить), «Тихая поляна».
- Скины банки P26 (атлас WebP 1024²); сезоны меняют частицы и оттенок. Остальное — код.

**3.2 Тоннель (M1, Canvas).**
- За точкой схода — P09, остальное кодом.
- Ворота: покой (`brand`), приближение (ярче), пройдены (мятная вспышка), удар (коралл, тряска), плывущие (шевроны), двойные.
- Монеты — из атласа свечений; темы — 6 палитр миров.

**3.3 Пульс (M2, PixiJS).**
- Сцена P16; сильная доля — кольцо у горизонта; линия удара на 78%.
- Ноты: нота ≥ 0,7 дорожки (скруглённый квадрат), рельс («Держишь!»), дуга с тиками, золотая (звезда в круге), передышка.
- Состояния: подлёт, в окне, оценка, пропущена (40%), призрачная после паузы. Цвет кодирует тип ноты, а не дорожку.
- Оценки ≥ 42 px цветами `judge.*`.
- Обложки: у прямых артистов свои, у CC-треков процедурные. ИИ-обложки выглядели бы работой артиста, их не делаем.

**3.4 Звездопад (M2, Canvas).**
- Фон W4 (P12, планеты P13).
- Звёзды ловим, метеоры P27 обходим; щит — циановый пузырь с кольцом заряда.
- Предупреждение за 2 с: дорожка янтарная 25% и ▲. В туториале метеоров нет.

**3.5 Титан (PixiJS; миры 1–4 — M2, 5–6 — M4).**
- Шесть боссов: Филин-Тень, Тоннельный Червь, Кракен, Метеорный Голем, Огненный Вулкан, Полярный Дракон.
- Путь: концепт P19–P24 → детали P25 → доводка → cutout-риг.
- Состояния: покой, телеграф, атака, урон (вспышка 80 мс), оглушение, поражение.
- Телеграф — зона `hazard` 30% со штриховкой и ▲, заполнение 2 с; безопасная зона — мятный контур.
- Здоровье — золотая полоса у босса, не в HUD. Атлас ≤ 2048² (уровень C — 1024²).

**3.6 Высота (M4).** Фон W6 (P15), сияние колышется кодом. Ворота — световые столбы #A8E1FF со скруглёнными шапками.

**3.7 Канат (M3).** Канат с золотым маркером, соперник — язык призрака, окна «рывка» — мятное кольцо, сходящееся к Искре. Время удержания не показываем.

**3.8 Статуя (M4, экран в 3 м).**
- Крупный двоичный сигнал:
  - «Иди» — Страж спиной, мятная полоса, ▶ ≥ 190 px;
  - «Замри!» — фиолетовое поле, глаза Стража, ✋ ≥ 300 px;
  - «Заметил» — янтарный ▲. Коралл не берём: это не ошибка техники.
- Путь к сундуку — толстая полоса. Страж — SVG, 3 состояния. Главное — голос.

**3.9 «Интервал Искры».** Кольцо времени, пиктограмма упражнения (ONB-EXR), счётчик, Искра в `cheer`.

## 4. UI-арт

### 4.1 Иконки

База — Phosphor Bold (Fill для активного): 24/32 px в меню, 48+ в сессии, SVG-спрайт ≤ 15 КБ. Своих (★) около 25 из ~60, по метрикам Phosphor.

| Группа | Иконки |
|---|---|
| Навигация | `map`, `games`, `music`, `me`, `friends`, `settings` |
| Сессия | `play`, `pause`, `finish`, `recalibrate`, `voice(-off)`, `sound(-off)`, `breath`★, `pain` «Болит»★ |
| Камера | `cam-front`★, `cam-side`★, `cam-off`, `light` «свет спереди»★, `space` «свободно»★ |
| Состояние | `st-ok` ●★, `st-warn` ▲★, `st-bad` ✕★, `st-lost` ◌★ |
| Прогресс | `star`, `gem` ◆★, `chest`★, `boss`★, `rest` привал★, `recovery`, `streak`, `freeze`, `pause-life`, `level-up`, `trophy` |
| Социальное | `clap` «Хлопок Искры»★, `fire`, `keep-going`★, `ghost`, `challenge`, `invite`, `qr`, `share` |
| Техника | `plank-knee`★, `plank-forearm`★, `plank-straight`★, зоны `wrist`★, `shoulder`★, `back`★, `neck`★ |
| Система | `on-device` «на устройстве»★, `offline`, `download`, `install`, `cc`, `language`, `theme`, `less-motion`, `large-mode`, `bpm`★ |

### 4.2 Значки достижений (22, M2)

Круглая медаль 128, кольцо 6 px `brand-text`, мотив со свечением. Состояния: заблокирован (силуэт #2E3566 и замок), получен, новый (блик 600 мс).

| Значок | Мотив | Значок | Мотив |
|---|---|---|---|
| Первая искра | огонёк из точки | Первая неделя | неделя с галочкой |
| Полная банка | банка с роем | Четыре недели | 4 огонька |
| Лунный коллекционер | полумесяц, 3 камня | Привычка | 10 огоньков дугой |
| Тысяча огоньков | спираль точек | Новый рубеж | ступени A–F |
| Игольное ушко | шар в узких воротах | Было — стало | стрелка вверх |
| Ни царапины | шар со щитом | Умный отдых | листок и луна |
| В ударе | нота ×4 | Возвращение | тропа к огоньку |
| Победитель Титана | маска с трещиной | Призрак позади | Искра обгоняет пунктирную |
| Охотник на титанов | 6 масок | Дуэлянт | канат, две искры |
| Ровная линия | ватерпас | Командная игра | 3 огонька в круге |
| Каменное спокойствие | замёрзшая искра | Мастер мира | 3 звезды над холмом |

### 4.3 Карта мира

- **Путь** — вертикальная S-дорожка в SVG: пройденное — мятные точки, будущее — пунктир #2E3566.
- **Узлы:** обычный 72 px; текущий 96 px с Искрой; мини-босс (узлы 5 и 10) 88 px, форма щита; Титан (узел 15) 120 px с портретом; сундук (30 ★); привал; неделя восстановления.
- **Состояния узла:** закрыт, доступен, текущий (пульс 2 с), пройден (0–3 ★), босс побеждён.
- **Фон** — тайл биома (P17, P18, далее по шаблону) и 6–8 SVG-предметов на мир, расставленных по сиду; переход между мирами — градиент 600 px. Название мира — HTML-текст. Тема карты из сундука — другая палитра тайла.

### 4.4 Онбординг: камера и техника (SVG ассистента, без ИИ)

- **ONB-CAM-front:** вид сбоку; телефон на полу в 50–80 см перед руками экраном к человеку, подпёрт книгой под 60–75°, луч к лицу.
- **ONB-CAM-side:** устройство в 2–3 м сбоку на высоте 40–60 см, рамка кадра охватывает всё тело. Размеры подписываются в HTML.
- **Чек-лист:** свет спереди, звук, свободное место, коврик не скользит.
- **ONB-POSE:** верная планка на предплечьях (локти под плечами, мятный пунктир голова–пятки, шея нейтральна). Ошибки — коралловый участок с ✕: провис таза, «домик», задранная голова, локти впереди, колени на полу. Плюс верные варианты: колени, наклонная, прямые руки, боковые.
- **ONB-EXR** — 14 пиктограмм: К, П, В, БК, Б, касания, подъём ноги, скалолаз, «пила», RKC, три опоры, длинный рычаг, наклонная, дыхание. **ONB-SIL** — силуэт для превью камеры.

**Манекен:** капсулы, голова-круг без лица, заливка #A3A9D1, без признаков пола. Позы рендерим стендом синтетической камеры (`test/`, three.js), обводим вручную и сверяем углы; модели стенда в продукт не попадают.

### 4.5 Пустые состояния и итоги

- **Пустые состояния:** нет истории — Искра `point` на «Играть»; день отдыха — P31 и `sleep`; нет друзей — P30 и `wow`; нет треков — `look`; офлайн, запрет камеры, нет поддержки — P32 и `care`; загрузка модели — Искра «несёт» прогресс.
- **Итоги:** главная цифра, три звезды с шагом 300 мс под пентатонику, Искра `celebrate`, подложка P33. Конфетти процедурное, ≤ 120 частиц за 2,5 с, при reduced motion его нет. После босса — key art P34.

### 4.6 Иконка, сплэш, фавикон, знак

- **Иконка:** лицо Искры на #0B0D17 с мятным ореолом, всё значимое — в центральном круге 80%. `app_icons.mjs` из одного мастер-SVG делает `icon-192/512` (any), `icon-512-maskable`, `icon-512-mono` (`monochrome`: белый силуэт с вырезанными глазами), `apple-touch-icon` 180 без прозрачности, `favicon.svg` (тёмный и светлый через `prefers-color-scheme`) и `favicon.ico` 16/32/48; позже для TWA — иконку Play 512 и feature graphic 1024×500.
- **Сплэш:** Android — из манифеста (`background_color #0B0D17`); iOS — `apple-touch-startup-image` по размерам экранов (Искра 160 px и знак).
- **Знак «Plank Run»** — Unbounded в кривых (OFL разрешает логотипы), градиент mint→violet, латиница во всех локалях.

### 4.7 Карточки для соцсетей

- **OG 1200×630:** фон P36, знак, Искра и заголовок для 5 страниц.
- **Карточка результата** рисуется на устройстве (canvas → PNG → Web Share), 1080×1350 и 1080×1920. На ней: Искра в скине игрока, игра, ★, очки в секунду, доля чистой техники, серия недель, «Планка дня #N».
- **Не показываем:** анкету, фото, уровень формы. Время удержания по умолчанию выключено, чтобы не провоцировать гонку «кто дольше».

## 5. Мастер-инвентарь

**Кто:** А — ассистент; В→А — владелец генерирует, ассистент обрабатывает. **Вехи** — по продуктовой спецификации §10. Строки сгруппированы; в `prompts.yaml` и манифесте ID уточняются (BG-W3, GM-TI-W1, EMP-02), MS-00 — мудборды без ассета.

| ID | Ассет | Где | Тип | Источник | Размеры, состояния | Веха | Кто |
|---|---|---|---|---|---|---|---|
| BR-01/02 | Знак, мастер иконки | шапка, манифест | SVG | рука | 1024 | M1 | А |
| BR-03/04 | Иконки PWA, фавикон; сплэши iOS | манифест | PNG, ICO, SVG | скрипт | any, maskable, mono, 180, 16–48 | M1 / M3 | А |
| CN-01…06 | Канон C1–C6 | референсы | PNG | C1, C4 — А; остальные P01–P04 | 2K | M1 | В→А |
| MS-01/02 | Искра: SVG, JSON, атлас | везде | SVG, код | рука | 14 настроений, 5 разворотов | M1 | А |
| MS-03/04 | Аксессуары, шлейфы, скины | магазин | SVG, код | рука (идеи P06) | 10 + 3 / +34 | M1 / M2 | А |
| BG-W1, W2 | Фоны Поляны, Тоннеля | игры, карта | AVIF, WebP | P07–P09 | 2560 → 1920/1280 | M1 | В→А |
| BG-W3, W4, PL | Океан, Космос, планеты, сцены «Пульса» | миры 3–4 | AVIF, атлас | P10–P13, P16 | 1920 | M2 | В→А |
| BG-W5/W6 | Вулкан, Сияние | миры 5–6 | AVIF | P14, P15 | 1920 | M4 | В→А |
| GM-GLOW, FF, TN | Свечения, светлячки, банка, ворота, темы | M1-игры | код, SVG | А | 3 типа × 5 состояний; 6 тем | M1 | А |
| GM-FF-JARS | Скины банки ×4 | магазин | WebP-атлас | P26 | 256² | M1–M2 | В→А |
| GM-PL, SF | Ноты, обложки; метеоры, бонусы | Пульс, Звездопад | Pixi, код, атлас | А; P27, P28 | ≤ 2048² | M2 | А, В→А |
| GM-TI | Титаны и эффекты | Титан, карта | атлас (cutout), код | P19–P25 | 6 состояний | M2 (1–4), M4 (5–6) | В→А |
| GM-RP, HT, ST | Канат; Высота; Страж, сундук | игры, карта | код, SVG | рука | Страж 3 состояния | M3 / M4 | А |
| UI-ICO, STATE | Иконки, ● ▲ ✕ ◌ | меню, HUD | SVG-спрайт | Phosphor + рука | ~35 + ~25 | M1 / M2–M3 | А |
| UI-BDG | 22 значка | профиль | SVG | рука | 3 состояния | M2 | А |
| MAP | Узлы, путь, реквизит; тайлы биомов | карта | SVG; AVIF | рука; P17, P18 | 7 типов × 5 состояний; 1080×1920 | M1 / M2 / M4 | А, В→А |
| ONB-CAM, POSE, SIL | Схемы камеры, техники, силуэт | онбординг, пауза | SVG | рука по 3D | 2 + 11 + 2 | M1 | А |
| ONB-EXR | Пиктограммы упражнений | интервал, план | SVG | рука | 5 / +9 | M1 / M2 | А |
| ONB-ILL, EMP | Приветствие; пустые состояния | онбординг, разные | AVIF + SVG | P29–P32 + Искра | 9:16, 4:3 | M1 / M3 | В→А |
| RES | Звёзды, конфетти, подложка, победы | итоги | код, WebP, AVIF | P33, P34 | 1024², 1920×1080 | M1 / M2 | А, В→А |
| SHR | OG статичные; карточка результата | ссылки, шеринг | PNG; canvas | P36; код | 1200×630; 1080×1350 | M1 / M2 | В→А, А |
| PRM | Промо-фоны, скриншоты, трейлер | соцсети, TWA | PNG, MP4 | P35, P37, V01 + запись | §9 | M3 | В→А |
| VO | Голос RU (ядро, игры); UZ, EN | сессия | m4a | Gemini TTS | ~150 × 2 голоса | M1 / M2 / M3 | А (В слушает) |
| SFX | Ядро; ритм-киты | всё | zzfx; WAV | код; свои записи, CC0 | ~25; ≤ 150 КБ | M1 / M2 | А |

## 6. Библиотека промптов

### 6.1 Схема `art/prompts.yaml`

Запись: `id`, `asset`, `title_ru`, `milestone`, `first_week`, `tools` (первый — основной), `aspect`, `chatgpt_size`, `background` (`scene` / `black` / `white` / `pair`), `refs` (C1–C6 или `Pxx*`), `variants`, `subject`, `vars`, `extras`, `notes_ru`, `post` (шаги §7.3), готовые `prompt_gemini` и `prompt_chatgpt`, `followup_gemini` (второй ход пары), `status`, `results[]` (файл, sha256, инструмент, модель, дата, чат, выбран). Вверху файла — `blocks`, `canon_refs`, `banned_terms` и описание схемы.

### 6.2 Сборка и базовый блок

```
Gemini:  PREFIX + REFS + STYLE_CORE + Subject + extras + BG + "Aspect ratio …" + QUALITY + AVOID  [пара: FOLLOWUP_BLACK]
ChatGPT: PREFIX + формат + REFS + STYLE_CORE + COLOR + Subject + extras + (BG | TRANSPARENT) + LITERAL + AVOID
```

**STYLE_CORE:**

> Stylized 2D game art for a calm night-time fitness game. Flat, vector-like shapes with soft smooth gradients, no outlines, rounded friendly forms, large clear silhouettes and very little fine detail. Palette: deep navy and indigo night tones (#0B0D17, #12152A, #161A33, #1E2347, #2E3566) with glowing accents only in mint #5EF2C2, violet #7C6CFF, soft lavender #A397FF, warm gold #FFD25E, sky cyan #4CC9FF and firefly lime #D8FF6A. Lighting: cool moonlight from the upper left with a thin lavender rim light on silhouette edges; warm light comes only from glowing objects. Every glow is a bright core with two soft round halos. Mood: cozy, quiet, hopeful, playful, readable from two meters away on a small screen.

**AVOID** (отдельного поля для негатива нет ни там, ни там):

> Avoid: any text, letters, numbers or symbols; logos and brand marks; watermarks and signatures; UI elements, frames, borders or card shapes; checkerboard transparency patterns; photorealism; glossy 3D plastic render; lens flares and four-pointed sparkle stars; heavy noise, film grain or paper texture; harsh black outlines; people, human faces and human hands.

**Gemini (Nano Banana Pro)** лучше держит персонажа и правки в чате, поэтому он основной для пар, деталей боссов и серий. Формат пишем словами, прикладываем 3–4 референса (C1 всегда). После лимита Pro приложение тихо переходит на обычный Nano Banana — это надо отметить.

**ChatGPT** тянет в тёплое (лечит `COLOR`), буквален (`LITERAL`) и при правке перерисовывает кадр целиком, так что пары часто не совпадают. Альфа в интерфейсе ненадёжна (бывает запечённая шахматка), запасной вариант — #FF00FF. Лучший выбор для полноэкранного промо.

**Фон:** `black` — свечения; `pair` — плотное и стекло; `white` — концепты; `scene` — сцены.

### 6.3 Консистентность

1. **Канон C1–C6** — в `art/canon/`, хэши — в `prompts.yaml`. C1 и C4 рендерятся из токенов и SVG, поэтому они точные.
2. **3–4 референса на запрос** (C1 + сцена мира + стиль); больше шести размывает стиль.
3. **Один чат — одна серия** («PR · W1 слои»): первый ход — полный промпт, дальше «Same style and references. Next: …». После 8–10 ходов или при дрейфе — новый чат с лучшим кадром в референсах.
4. **Сидов в приложениях нет.** Воспроизводимость = промпт + хэши референсов + модель + дата + чат (`results[]`).
5. **Если ΔE2000 к токенам > 8 на крупных площадях**, кадр отклоняем, даже если `palette_snap` его выправляет.

### 6.4 Промпты (38)

Карточка: ID, название, веха, инструменты (★ — основной; G — Gemini, C — ChatGPT), формат, фон, референсы, число вариантов; ниже `Subject` и заметка. Ассет и полные тексты под оба инструмента — в `art/prompts.yaml`.

**P01** Канон: поляна · M1, нед. 1 · G★/C · 21:9 · сцена · C1 · ×2  
> Calm night meadow from ground level: sky gradient #060818 to #14243A, small pale moon with a soft halo upper left, a few faint stars, two layers of soft navy hills, tall grass silhouettes along the bottom, a dozen tiny lime fireflies near the grass.  
> *Канон C2: выбрать лучший из трёх.*

**P02** Канон: тоннель · M1, нед. 1 · G★/C · 16:9 · сцена · C1 · ×2  
> Neon tunnel in one-point perspective, seen from behind and slightly above, receding to a softly glowing vanishing point in the upper middle; dark violet floor and walls with thin glowing #7C6CFF edge and cross lines; faint city glow at the vanishing point. No sun disk, no palm trees.  
> *Канон C3; сетку в игре рисует код.*

**P03** Канон: предметы · M1, нед. 1 · G★/C · 1:1 · чёрный фон · C1, C2 · ×2  
> Sheet of six pickups in a 3x2 grid: lime firefly (glowing dot, two tiny wings), gold firefly, pale-blue moon firefly, faceted lavender-cyan moonstone gem, round gold coin with an embossed ring, gold five-pointed star with rounded tips. Each glows softly.  
> *Канон C5; альфа по яркости.*

**P04** Канон: иллюстрация · M1, нед. 1 · G★/C · 4:3 · сцена · C1, C2 · ×2  
> Cozy flat illustration of a small living room at night, low side angle: an exercise mat, a smartphone standing on the floor propped against a book at the front end of the mat, screen glowing mint and violet, a window with the moon, a houseplant. No person. Dark empty space on the left.  
> *Канон C6; телефон экраном к коврику.*

**P05** Искра: мудборд эмоций · M1, нед. 1 · G★/C · 1:1 · белый фон · C4 · ×1  
> Expression sheet for the attached glowing round spark mascot, 3x3 grid: happy, proud, cheering with two tiny floating sparks as hands, worried, tired but determined, sleeping, celebrating, pointing with a spark, curious. The body stays a perfect circle.  
> *Только идеи; канон — SVG (MS-01).*

**P06** Искра: идеи аксессуаров · M1 · G★/C · 1:1 · белый фон · C4 · ×1  
> Accessory sheet sized for the attached round mascot, 12 items in a 4x3 grid, no body: knitted beanie, tiny crown, sweatband, headphones, round sunglasses, bandana, flower wreath, bubble space helmet, embroidered skullcap (doppi), chef hat, scarf, small backpack.  
> *Идеи для SVG; допу показать друзьям из UZ.*

**P07** Поляна: дальний слой · M1, нед. 1 · G★/C · 21:9 · сцена · C1, C2 · ×2  
> Far layer of the 'Firefly Meadow' world: night sky gradient, low pale moon with a halo upper left, distant soft hills and a faint tree line, a few dim stars, no foreground. Bottom 30% plain dark navy #0B1630 for nearer layers.  
> *Параллакс 0,05; шов чинит скрипт.*

**P08** Поляна: средний слой · M1, нед. 1 · G★/C · 21:9 · пара белый→чёрный · C1, C2 · ×2  
> Middle layer of the same meadow: a horizontal strip of rolling hill silhouettes with a few round-topped trees and bushes, flat navy #0B1630 with a thin lavender #A397FF rim light on top edges, only in the bottom 40%; the rest is background.  
> *Пара: белый, затем тот же кадр на чёрном.*

**P09** Тоннель: дальний план · M1, нед. 1 · G★/C · 16:9 · сцена · C1, C3 · ×2  
> Far layer of the 'Neon Tunnel' world: distant night city skyline centered on the horizon, soft violet and mint window glows, a gentle radial glow behind it where the tunnel vanishing point will be, dark navy sky, simple blocky buildings, no signs.  
> *Видна верхняя треть, за точкой схода.*

**P10** Океан: дальний слой · M2 · G★/C · 16:9 · сцена · C1, C2 · ×2  
> Far layer of the 'Ocean' world: deep underwater, soft light shafts from the surface at the top, teal-navy gradient #0B1A2E to #07101C, distant rock and kelp silhouettes, tiny cyan plankton dots.  
> *Лучи не через центр.*

**P11** Океан: средний слой · M2 · G★/C · 21:9 · пара белый→чёрный · C1, C2 · ×2  
> Middle strip for the ocean world: rounded coral, kelp and rock silhouettes in the bottom 40%, flat dark teal #0A2233 with a cyan #4CC9FF rim light on top edges.  
> *Пара, как P08.*

**P12** Космос: дальний слой · M2 · G★/C · 16:9 · сцена · C1, C3 · ×2  
> Far layer of the 'Cosmos' world: deep space, a soft violet and teal nebula across the top third, sparse small round stars, the rest near-black navy, no planets.  
> *Фон мира 4 и «Звездопада».*

**P13** Космос: планеты · M2 · G★/C · 1:1 · чёрный фон · C1, C5 · ×2  
> Four stylized planets in a 2x2 grid: small ringed lavender planet, mint planet with soft cloud bands, tiny gold moon with shallow craters, dark violet planet with a thin glowing rim. Flat shading, lit from the upper left.  
> *Режется на 4 спрайта.*

**P14** Вулкан: дальний слой · M4 · G★/C · 16:9 · сцена · C1, C2 · ×2  
> Far layer of the 'Volcano' world: night sky with a dark plum haze, distant rounded volcano silhouettes with faint deep-orange glows at the tops, a few drifting embers; warm light only from lava. Not scary.  
> *Лава #E8552B, не цвета состояний.*

**P15** Сияние: дальний слой · M4 · G★/C · 16:9 · сцена · C1, C2 · ×2  
> Far layer of the 'Northern Lights' world: soft mint and violet aurora ribbons across the upper half, snowy rounded mountains in dark blue-grey on the horizon, a few stars. Silent and gentle.  
> *Фон мира 6 и «Высоты».*

**P16** Пульс: сцена ×4 · M2 · G★/C · 16:9 · сцена · C1, C3 · ×1  
> Abstract rhythm-game background, mood {mood}: dark stage-like space, soft horizon at 60% height, gentle concentric light rings and faint distant vertical light bars, accents {colors}. The central vertical band for note lanes stays dark and empty.  
> *4 прогона по vars; пульс делает код.*

**P17** Карта: тайл «Поляна» · M1, нед. 1 · G★/C · 9:16 · сцена · C1, C2 · ×2  
> Vertical map tile for the 'Firefly Meadow' world, seen from above at a gentle angle: dark grassy meadow, patches of lighter moss, two small ponds, round bushes, tiny mushrooms, scattered fireflies. No path, road or markers.  
> *Путь и узлы — SVG поверх.*

**P18** Карта: тайл «Тоннель» · M1, нед. 1 · G★/C · 9:16 · сцена · C1, C3 · ×2  
> Vertical map tile for the 'Neon Tunnel' world seen from above: night city district of dark violet blocks and rounded rooftops, thin glowing violet and mint lines along streets, tiny lit windows. No path, no signs.  
> *Шаблон для миров 3–6.*

**P19** Титан: Филин-Тень · M2 · G★/C · 16:9 · белый фон · C1, C2 · ×2  
> Boss concept 'Shadow Owl': a huge round owl of dark indigo night shadow, big glowing violet eyes, soft layered feathers, wings casting long shadows left and right. Impressive but friendly, never scary, fine for children. Three poses side by side: idle, attack telegraph, dizzy defeated.  
> *Затем P25 — детали для рига.*

**P20** Титан: Тоннельный Червь · M2 · G★/C · 16:9 · белый фон · C1, C3 · ×2  
> Boss concept 'Tunnel Worm': a long worm of glowing violet ring segments with a round stubborn-cute face, coiling out of a neon tunnel mouth; in the telegraph pose it squeezes the tunnel narrower. Impressive but friendly, never scary, fine for children. Three poses side by side: idle, attack telegraph, dizzy defeated.  
> *Атака сужает проход.*

**P21** Титан: Кракен · M2 · G★/C · 16:9 · белый фон · C1, C2 · ×2  
> Boss concept 'Kraken': a big round deep-teal octopus with large curious eyes and cyan glowing spots; in the telegraph pose tentacles rise from the left and right edges, the center stays clear. Impressive but friendly, never scary, fine for children. Three poses side by side: idle, attack telegraph, dizzy defeated.  
> *Центр безопасен.*

**P22** Титан: Метеорный Голем · M2 · G★/C · 16:9 · белый фон · C1, C5 · ×2  
> Boss concept 'Meteor Golem': a chunky friendly giant of floating rounded space rocks with glowing gold cracks and small bright eyes; telegraph lifts rocks overhead; defeated crumbles into floating pebbles. Impressive but friendly, never scary, fine for children. Three poses side by side: idle, attack telegraph, dizzy defeated.  
> *Щит рисует код.*

**P23** Титан: Огненный Вулкан · M4 · G★/C · 16:9 · белый фон · C1, C2 · ×2  
> Boss concept 'Fire Volcano': a living volcano with a grumpy cartoon face in the rock and a glowing deep-orange lava crown; telegraph rumbles with rising lava; defeated cools down and dozes. Impressive but friendly, never scary, fine for children. Three poses side by side: idle, attack telegraph, dizzy defeated.  
> *Лава в бит — кодом.*

**P24** Титан: Полярный Дракон · M4 · G★/C · 16:9 · белый фон · C1, C2 · ×2  
> Boss concept 'Polar Dragon': an elegant long dragon of ice crystals and aurora light, mint and violet glowing mane, big gentle-stern eyes; telegraph inhales frost; defeated curls up asleep. Impressive but friendly, never scary, fine for children. Three poses side by side: idle, attack telegraph, dizzy defeated.  
> *Не похож на известных драконов.*

**P25** Титан: детали для рига · M2 · G · 1:1 · пара белый→чёрный · P19* · ×2  
> Parts sheet of the approved boss from the attached image for cutout animation: body, head, left and right wing, left and right eye, closed eyelid, beak, two feet; each part complete, including normally hidden areas; same style and scale.  
> *Шаблон: заменить список деталей. Только Gemini.*

**P26** Светлячки: скины банки · M1, нед. 1 · G★/C · 1:1 · пара белый→чёрный · C1, C5 · ×2  
> Four collectible firefly jars side by side, empty, front view: clear glass jar with a wooden lid, round clay jug with a painted stripe, paper lantern, small brass lantern with glass panes. Glass slightly tinted and see-through; soft cool highlight upper left.  
> *Стекло полупрозрачное — только пара.*

**P27** Звездопад: метеоры · M2 · G★/C · 1:1 · чёрный фон · C1, C5 · ×2  
> Six falling meteors in a 3x2 grid: chunky dark rocks with angular but slightly rounded corners, glowing orange #FF7A45 cracks, a short fiery trail pointing straight up, different sizes, same lighting.  
> *Опасность: угловатая и оранжевая.*

**P28** Звездопад: бонусы · M2 · G★/C · 1:1 · чёрный фон · C1, C5 · ×2  
> Star-catching pickups in a 3x2 grid: rounded five-pointed gold star in three sizes, cyan shield orb with a soft hexagon pattern, lavender moonstone gem, small cyan comet. Soft glow, flat shading.  
> *Для уровня A; на C — процедурно.*

**P29** Онбординг: приветствие · M1, нед. 1 · G★/C · 9:16 · сцена · C1, C2, C6 · ×2  
> Portrait onboarding illustration: calm night meadow under a big sky; in the lower third a plain soft glowing circle of light hovers above the grass (no face, placeholder for the mascot), fireflies rising around it; upper half is dark empty sky.  
> *Искру кладёт ассистент; заголовок — шрифтом.*

**P30** Пусто: нет друзей · M3 · G★/C · 4:3 · сцена · C1, C6 · ×2  
> Empty-state illustration: two small empty exercise mats side by side on a hill under the stars, a faint path leading to them, a few fireflies waiting. Hopeful, not sad; lots of dark negative space.  
> *«Друзья скоро будут здесь».*

**P31** Пусто: день отдыха · M1, нед. 1 · G★/C · 4:3 · сцена · C1, C2, C6 · ×2  
> Rest-day empty state: a tiny tent and small campfire on a quiet night meadow, a steaming mug, moon and stars, warm firelight on the grass; a clear spot beside the fire for the mascot, no character drawn.  
> *Искра (sleep) у костра.*

**P32** Пусто: офлайн, камера · M1, нед. 1 · G★/C · 4:3 · сцена · C1, C6 · ×2  
> Empty-state illustration: a night window with the moon, curtain half closed, a smartphone with a dark screen on the windowsill, a soft round cushion nearby. Calm, not alarming.  
> *Офлайн, запрет камеры, нет поддержки.*

**P33** Итоги: подложка · M1 · G★/C · 1:1 · чёрный фон · C1 · ×2  
> Celebration backdrop: soft radial burst of light rays in mint, violet and gold from the center, gentle concentric glow rings, a few floating round light dots; the center bright but empty for the mascot and a number. No confetti.  
> *Аддитивно, альфа не нужна.*

**P34** Победа над Титаном · M2 · G★/C · 16:9 · сцена · C1, C2, P19* · ×2  
> Victory backdrop after defeating the {boss} in the {world} world: the landscape at dawn with the sky brightening, the defeated boss resting peacefully in the background, a clear spot in the foreground center for the mascot.  
> *По одному на мир; концепт босса в refs.*

**P35** Промо: главный фон · M3 · C★/G · 16:9 · сцена · C1, C6 · ×2  
> Wide promo background: dark living room at floor level at night, an exercise mat leading to a smartphone propped on the floor, its screen casting a mint-violet glow, a few fireflies drifting out of the screen. No person; dark area on the right for a headline.  
> *ChatGPT первым; скриншот — в экран.*

**P36** OG: фон · M1 · C★/G · 1.91:1 · сцена · C1, C2 · ×2  
> Very wide social preview background: deep navy night gradient, a soft trail of glowing fireflies and a mint light streak flowing left to right, low hills at the bottom; the left 55% dark and empty for the title.  
> *Текст и Искру кладёт ассистент.*

**P37** Промо: фоны скриншотов · M3 · C★/G · 9:16 · сцена · C1 · ×3  
> Vertical background for store screenshots: abstract soft night gradient in {palette} with one gentle curved light ribbon and very low detail; the middle 70% stays calm for a phone mockup.  
> *3 палитры из vars.*

**V01** Трейлер: ИИ-вставка · M3 · G · 16:9 · сцена · C2 · ×2  
> 4-second video: a small glowing mint light orb flies low over a dark night meadow, fireflies rise from the grass and follow it, smooth tracking camera, soft moonlight from the upper left, flat stylized 2D animation look.  
> *Veo; квоты не проверены; это не Искра.*

### 6.5 Чек-лист приёмки

1. Нет текста, логотипов, подписей и водяных знаков (видимая метка Gemini допустима только в мудбордах).
2. ΔE2000 ≤ 8, нет тёплого сдвига.
3. Свет сверху слева, контровой свет лавандовый, нет лучей-звёзд.
4. Прищур пройден; у фонов тихий центр.
5. Пары: сдвиг ≤ 1 px, IoU масок ≥ 0,98; у PNG из ChatGPT реальная альфа.
6. Тайлы бесшовны на двух периодах.
7. Анатомия и логика: парные глаза, телефон экраном к коврику.
8. Нет сходства с чужими персонажами и брендами (обратный поиск).
9. Нет флагов, религии, политики; мотивы проверены друзьями.
10. Разрешение ≥ мастер-размера, нет артефактов.
11. Совпадает с каноном на контактном листе.
12. Происхождение записано.

## 7. Пайплайн и репозиторий

### 7.1 Структура и именование

```
art/README.md  prompts.yaml  manifest.json
art/canon/                C1–C6 + sha256
art/inbox/<prompt-id>/    входящие (только в ветке art-inbox)
art/selects/<asset-id>/   отобранные оригиналы, уменьшенные до мастер-размера
art/source/               мастер-SVG, правленые PSD/Krita
art/processed/<asset-id>/ после альфы, палитры, швов
art/atlases/              JSON-Hash + WebP
art/contact-sheets/       листы для отбора
scripts/art/              скрипты
assets/                   раздаётся приложением (позже apps/web/public/assets)
```

Сырые PNG по 2–6 МБ в `main` не попадают. Ветку `art-inbox` периодически удаляем, оригиналы с C2PA уходят в ежемесячный zip релиза `art-raw-YYYY-MM`.

**Имена:** `<группа>-<предмет>-<вариант>-<состояние>@<масштаб>.<ext>`, латиница, kebab-case: `bg-w1-meadow-far@1x.avif`, `ui-icon-gem.svg`, `vo-ru-soft-form-sag-02.m4a`. Входящие: `P08__gemini__1__white.png`, `P08__gemini__1__black.png`.

### 7.2 Как владелец отправляет

1. **Вложения в чат** — основной путь. Скачивать в полном размере, без скриншотов. Подписать: «P07 gemini 1–2, P08 пара».
2. **GitHub:** ветка `art-inbox`, «Add file → Upload files» в `art/inbox/P07/`.
3. **Папка Google Drive** «Plank Run · art inbox» — если в сессии подключён Drive-коннектор.

Дальше ассистент сам переименует файлы и пришлёт контактный лист на отбор.

### 7.3 Скрипты (`scripts/art/`)

| Скрипт | Назначение |
|---|---|
| `ingest.py` | имена, sha256, контактный лист, запись манифеста (Pillow) |
| `matte_pair.py` | выравнивание пары (фазовая корреляция), `α = 1 − mean(W−B)/255`, `rgb = B/α`; отказ при сдвиге > 1 px |
| `glow_alpha.py` | `α = max(R,G,B)` для аддитивных спрайтов |
| `key_alpha.py`, `alpha_check.py` | пурпурный ключ; проверка реальной альфы и шахматки |
| `palette_snap.py` | k-means → ближайший токен в OKLab, отчёт ΔE2000 |
| `slice_grid.py` | нарезка листов, обрезка, пивоты |
| `tile_seam.py`, `dither.py` | бесшовность (кросс-фейд 64–128 px); зерно против полос |
| `vectorize.sh` | квантование до 6–12 цветов → vtracer (MIT) → svgo; > 40 КБ — остаётся AVIF |
| `encode.mjs` | sharp: AVIF q≈50, WebP q≈80, PNG, 1×/2×, бюджеты |
| `pack_atlas.mjs` | @assetpack/core или free-tex-packer-core: JSON-Hash, отступ 2 px, экструзия 1 px, ≤ 2048² + копия ½ для уровня C |
| `build_icons.mjs`, `app_icons.mjs`, `og_cards.mjs` | спрайт и React-иконки; иконки манифеста, сплэши, ico; статичные OG (resvg) |
| `legibility.mjs`, `budget_check.mjs` | прищур и тихий центр; вес и память, падение CI |
| `lint_prompts.py`, `tts_render.mjs` | проверка промптов; голос (§8.1) |

### 7.4 Манифест

```json
{ "id": "BG-W1", "version": 2, "status": "approved",
  "files": [{ "path": "assets/bg/w1/meadow-far@1x.avif", "bytes": 84213, "sha256": "…", "w": 1920, "h": 823 }],
  "source": { "kind": "ai", "tool": "gemini-app", "model_label": "Nano Banana Pro", "date": "2026-10-21",
              "prompt_id": "P07", "chat": "PR · W1 слои", "refs": ["C1:…", "C2:…"],
              "raw": [{ "archive": "art-raw-2026-10.zip", "file": "P07__gemini__2.png", "sha256": "…" }] },
  "selection": "2 из 4, выбрал владелец", "human_edits": ["кроп 21:9", "палитра 10 цветов", "луна перерисована", "шов 96 px"],
  "ai_generated": true, "visible_watermark": "none", "license_basis": "Gemini Apps terms", "approved_at": "2026-10-22" }
```

У SVG ассистента `"kind": "hand"`; если ИИ давал только идеи — `"inspiration": ["P06"]`.

### 7.5 Бюджеты и версии

| Что | Бюджет |
|---|---|
| Арт первого экрана (знак, Искра, спрайт иконок) | ≤ 60 КБ gzip |
| Фон мира (дальний и средний, 1920 и 1280) | ≤ 250 КБ, слой ≤ 120 КБ |
| Арт игры Canvas / Pixi сверх фона | ≤ 150 / 600 КБ |
| Атлас | ≤ 2048² (16 МиБ RGBA), на уровне C ≤ 1024² |
| Декодированная графика игры | A/B ≤ 48 МБ, C ≤ 24 МБ |
| Иконка / аксессуар / значок / пустое состояние | ≤ 2 / 1,5 / 4 КБ / 40 КБ SVG или 80 КБ AVIF |
| Голос RU, один голос | ≤ 1,2 МБ, ленивая загрузка |

Пример, Титан: фон 8,3 МБ + атлас босса 16,8 МБ + эффекты 4,2 МБ ≈ 29 МБ. Фоны декодируем под экран, 2× — только при DPR ≥ 1,5.

**Версии.** Арт-библия — semver в заголовке; смена канона — мажорная версия и статус `needs-review` у затронутых ассетов. У ассета целая `version`, файлы в сборке называются по хэшу, утверждённый арт получает метку `art-YYYY.MM.DD`.

## 8. Аудио-артефакты

### 8.1 Голос тренера

- **Модель:** `gemini-3.1-flash-tts-preview`, запасная `gemini-2.5-flash-preview-tts`; free tier, русский проверен.
- **Голоса:** из 30 готовых пробуем Kore (твёрдый), Puck (бодрый), Sulafat, Achird, Vindemiatrix, Leda. Владелец выбирает «Мягкий» и «Бодрый»; «Минимум слов» — подмножество «Мягкого».
- **Стиль:** английский стилевой промпт («Warm, calm coach, short phrases») и теги `[short pause]` (≈ 250 мс). Всегда «ё», числа словами, ударения проверяем на слух.
- **Приватность:** входы free tier может читать Google, поэтому в TTS нет имён и данных пользователей.
- **Обработка:** PCM 24 кГц → обрезка тишины → `loudnorm` в 2 прохода до −16 LUFS, пик −1,5 dBTP → фейды 3 мс → AAC-LC `.m4a`, моно, 40 кбит/с (Ogg в Safari зависит от версии ОС).
- **Манифест голоса:** ключ, текст-субтитр, длительность, `onsetMs`, хэш. Лимиты free tier неизвестны, скрипт докачивает понемногу.
- **Проигрывание:** варианты без повторов; в планке ≤ 4 слов и ≤ 2,5 с; музыка под голосом −9 дБ.

### 8.2 Реплики (RU)

Ни для Искры, ни для игрока родовых форм нет: «Вижу тебя!», «Остановиться — это правильно». Тон: техника — твёрдо и коротко; дыхание и отдых — спокойно; похвала — бодро; безопасность — мягко и серьёзно. «/» разделяет разные реплики, «·» — варианты одной.

| Ключ | Реплики |
|---|---|
| `setup`, `calib` | Займи планку лицом к экрану / Займи планку боком к камере / Встань на четвереньки и посмотри на экран / Вижу тебя! · Есть, вижу / Замри на секунду / Мне темно, включи свет спереди / Отойди на шаг, мне не видно ног / Отлично. Держи! · Поехали! |
| `count`, `time` | Три / Два / Один / Старт! / Последний раунд / Ещё десять секунд / Стоп! Отдых / Пятнадцать секунд / Тридцать секунд / Половина позади |
| `form` (спереди) | Смотри на экран · Глаза на экран / Вернись на место · Чуть назад, в центр / Тебя не видно, вернись в кадр / Подойди ближе к камере |
| `form` (сбоку) | Подними таз · Таз выше, живот подтяни / Опусти таз · Тело в одну линию / Выпрями ноги / Обопрись на предплечья / Вернись в планку |
| `form.ok`, `form.end`, `tired` | Вот так! · Отлично, держим / Подход закончен, отдыхай / Ещё пять секунд — и отдых · Держись, почти всё |
| `breath`, `rest` | Дыши ровно · Не задерживай дыхание / Вдох… / Выдох… / Отдых, можно на колени · Передышка, дыши глубоко / Через пять секунд продолжаем / Дальше — Светлячки (×8 игр) |
| `praise` | Отлично! · Так держать! · Ровно как струна · Чистая техника! · Ты в ударе! |
| игры | Золотой! / Лунный светлячок! / Банка полная! Плюс десять / На волоске! / Ни царапины! / Держишь! / В ударе! / Метеор слева! · справа! / Замри — щит! / Атака слева! · справа! / Замри — копим суперудар! / Титан повержен! / Выше! / Ниже! / Рывок! / Тяни! / Иди! / Замри! / Заметил! Шаг назад / Сокровище! |
| `ti.intro` | Это Филин-Тень. Держи технику — и он ослабнет (×6 боссов) |
| `iv` | Смена стороны / Касание левой · правой / Подъём ноги: правая · левая / Боковая на правом локте · на левом |
| `test` | Дыши, не задерживай дыхание / Провисание таза я не вижу — держи живот подтянутым / Хватит! Дальше не нужно — результат отличный |
| `end`, `safe` | Цель выполнена! / На сегодня всё, отличная работа / Как было? Ответь на экране / На сегодня хватит, мышцы растут в отдыхе / Если больно — остановись / Остановиться — это правильно / Посмотри на экран, там важное |
| `meta` | Привет! Я Искра / Сдвинь корпус влево — банка поедет за тобой / Первая звезда! / С возвращением! Начнём чуть легче |

Около 150 клипов на голос. «Минимум слов» = `form`, `count`, `breath`, `safe`, `test`. UZ и EN (M3) переводит и слушает носитель; узбекский — латиница с U+02BB. Запасной голос — Silero `v5_cis_base` (`uzb_saida`, MIT).

### 8.3 Звуки

| Группа | Токены | Источник |
|---|---|---|
| UI, состояния, отсчёт | `ui.tap`, `ui.confirm`, `ui.dwell-fill`, `state.ok` 1046 Гц, `state.warn` 440→330, `count.tick`/`go` | zzfx (MIT), процедурно |
| Светлячки, Тоннель | `game.catch` (пентатоника по комбо), `ff.gold`, `ff.jar-full`, `game.coin`, `game.pass`, `game.hit` | процедурно |
| Пульс | киты «клэп», «шейкер», «блик» без высоты тона, `pl.rail-tick` | WAV: свои записи телефоном или CC0 |
| Звездопад, Титан, Статуя, Канат | `sf.warn` (свист 2 с), `sf.shield`, `ti.telegraph`, `ti.hit`, `ti.defeat`, `st.turn` (гонг), `st.freeze`, `rp.tug` | jfxr/Bfxr (звуки наши), CC0 |
| Мета | `goal.reached`, `star.earn`, `chest.open`, `achievement`, `map.hop`, `breath.in/out`, щебет Искры | процедурно, jfxr |

Freesound — только ручная загрузка CC0, без API: его API бесплатен лишь для некоммерческого использования. Kenney — проверяем лицензию по пакету. ElevenLabs не берём. Лицензия каждого файла — в манифесте. Ритм и UI храним в WAV 24 кГц: задержка декодера AAC сдвигает атаку. Шины `music`, `sfx`, `voice`; SFX нормируем по пику −3 dBFS.

### 8.4 Музыка

Музыка — по ритм-спецификации. От арта: сцены P16, процедурные обложки, значки лицензий, строка атрибуции на итогах и визуальная калибровка «совмести вспышку со щелчком» (≤ 3 вспышек в секунду).

## 9. Промо

**Скриншоты** — 8 кадров через Playwright с `demo`-провайдером: Светлячки; Тоннель «на волоске»; рельс «Пульса»; атака Титана; ▲ «Таз выше»; карта; итоги; камера «Видео не покидает телефон». Размеры 1290×2796, 1080×1920, 2560×1600, рамка устройства нейтральная, подпись ≤ 5 слов, фоны P37.

**Трейлер 30 с** (1080×1920 и 1920×1080):

| Время | Кадр | Титр, звук |
|---|---|---|
| 0–3 с | Загорается огонёк (опц. V01), знак | «динь» |
| 3–7 с | Человек кладёт телефон и встаёт в планку | «Держи планку — играй телом» |
| 7–13 с | Сплит: «Светлячки» и сдвиг корпуса | бит |
| 13–18 с | Тоннель → рельсы «Пульса» | «Корпус — это джойстик» |
| 18–22 с | Титан теряет здоровье | «Держишь — значит бьёшь» |
| 22–25 с | ▲ «Таз выше» → ● | «Видео не покидает телефон» |
| 25–28 с | Звёзды, Искра празднует | арпеджио |
| 28–30 с | Знак, «Бесплатно в браузере», QR | — |

Человек в кадре — только совершеннолетний с письменным согласием. Музыка — трек с правом на промо (Direct-v1) или CC0. ИИ-вставки абстрактные, без людей и «отзывов».

**Карточки результата** — §4.7. Ссылка-вызов (M3) получает серверное OG-превью: игра, сид, Искра вызывающего.

## 10. Право и происхождение

1. **Авторство.** Канон рисуется вручную; у ИИ-ассетов в манифесте записаны отбор и правки, сырьё хранится. В США одних промптов мало (Copyright Office 2025; certiorari по *Thaler v. Perlmutter* отклонён 02.03.2026), в РФ автор — только человек (ст. 1228, 1257 ГК).
2. **Стиль.** Никаких живых художников, студий, франшиз и «in the style of» (проверяет `lint_prompts.py`). Боссов и Искру прогоняем через обратный поиск картинок.
3. **Знаки.** Без чужих логотипов и узнаваемых форм (логотип Gemini, спортивные бренды, красный крест). До запуска проверяем «Plank Run» и «Искра» в ФИПС и WIPO.
4. **Водяные знаки.** Видимую метку убирает только официальный переключатель. SynthID остаётся в пикселях; `sharp` срезает C2PA, поэтому оригиналы храним в архиве.
5. **EU AI Act, ст. 50** (с 02.08.2026). Маркировка по 50(2) — обязанность провайдеров. У нас, deployer, обязанность касается только дипфейков, стилизованная графика к ним не относится. Добровольно пишем в «О проекте»: «часть графики создана с ИИ, голос тренера синтезирован». Реалистичных ИИ-людей нет.
6. **Шрифты и иконки.** Unbounded и Onest — OFL-1.1 (лицензия в сборке, отдельно не продаём). Phosphor и Tabler — MIT, Lucide — ISC; всё на странице «Лицензии».
7. **Инструменты.** ChatGPT: выход принадлежит пользователю. Gemini Apps: коммерция разрешена по вторичным источникам, условия перечитать до запуска. Не используем Recraft Free, FLUX dev и klein 9B, Silero `v5_x_ru`.
8. **Приватность.** Фото людей и кадры камеры в генераторы не загружаем.

## 11. Вехи, роли, первая неделя

| Веха | Визуал и аудио |
|---|---|
| **M1** | канон; Искра (14 настроений, атлас), 10 аксессуаров; ~35 иконок и знаки состояний; знак, иконки PWA, OG; фоны W1–W2; рестайл «Светлячков» и «Тоннеля»; скины банки; карта W1–W2; схемы камеры и техники, 5 пиктограмм; пустые состояния; итоги; голос RU (ядро); SFX |
| **M2** | «Пульс», «Звездопад», Титаны 1–4; фоны и карта W3–W4; 22 значка; карточка результата; +9 пиктограмм, +20 аксессуаров; игровые реплики |
| **M3** | «Канат», язык призраков, реакции; «нет друзей»; аватары семейного режима; сплэши iOS; голос UZ/EN; скриншоты, трейлер, TWA |
| **M4** | «Статуя» (сигналы для 3 м), «Высота»; W5–W6: фоны, карта, Титаны; схемы режима двух устройств |

**Владелец:** генерирует и отправляет оригиналы, утверждает канон, выбирает голоса, снимает живые кадры с согласиями, показывает мотивы друзьям. **Ассистент:** промпты, SVG, скрипты, обработка, интеграция, голос и звуки, манифест, лицензии, проверки.

**Первая неделя.** До 30 генераций в день, не больше 3 попыток на промпт — дальше ассистент правит промпт.

| День | Что сделать | Картинок |
|---|---|---|
| 0 | Gemini: Settings → Media watermark — выключить, если есть, и сообщить. Канал отправки по умолчанию — вложения | — |
| 1 | Получить C1 и C4 от ассистента. Чат «PR · канон»: **P01** и **P02** — Gemini ×2, ChatGPT ×1 | 6 |
| 2 | **P03** (Gemini ×2), **P04** (Gemini ×2, ChatGPT ×1). Утвердить C2, C3, C5, C6 | 5 |
| 3 | Чат «PR · W1 слои» (C1 + C2): **P07** ×2, **P08** пара ×2; чат «PR · W2»: **P09** ×2 | 8 |
| 4 | **P17**, **P18**, **P29** — по 2 | 6 |
| 5 | **P31**, **P32** — по 2. Послушать 6 голосов, выбрать два | 4 |
| 6 | **P26** пара ×2; по желанию **P05** и отзыв на лист эмоций Искры | 4–5 |
| 7 | Посмотреть сборку с новой «Поляной», «Тоннелем», картой и онбордингом и отметить, что переделать | — |

**Как отправлять:** оригинал через «Скачать», с подписью «P08 gemini пара 1». Если Gemini ушёл с Pro на обычный Nano Banana — напиши об этом.

## Источники

- Внутренние: `docs/research/*`, `docs/plan/*`, код прототипа.
- Метка Gemini: [TechRadar](https://techradar.com/ai-platforms-assistants/gemini/gemini-now-lets-you-turn-off-the-visible-watermark-on-your-ai-creations-heres-how-to-do-it-and-how-your-content-is-still-flagged-as-ai), [PCWorld](https://pcworld.com/article/3213409/google-now-lets-you-nix-visible-gemini-image-watermarks.html), [BGR](https://bgr.com/2031723/nano-banana-pro-google-gemini-3-image-generator/).
- Лимиты AI Pro: [Google Support](https://support.google.com/gemini/answer/16275805?hl=en-GB), [zenken](https://ai.zenken.co.jp/en/post/gemini-image-guide/).
- Прозрачность в ChatGPT: [форум OpenAI](https://community.openai.com/t/having-trouble-getting-transparent-backgrounds-in-chatgpt-images/1380143), [APIYI](https://docs.apiyi.com/en/live/2026-08/gpt-image-2-transparent-background).
- Gemini 3.1 Flash TTS: [Google Blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-tts), [Replicate](https://replicate.com/google/gemini-3.1-flash-tts/readme).
