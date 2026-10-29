# Источники ассетов v2

*Plank Run. Что лежит в `assets/3d/`, `assets/ui/` и `vendor/three/`, откуда это взято и на каких условиях (PLAN D34, `docs/plan/spec-visual-v2.md` §6). Скачано ассистентом 29.10.2026 по слову владельца («скачай бесплатные паки KayKit, Kenney UI Pack Adventure и Three.js 0.186.1»), через Chrome, архивы сверены по SHA-256.*

Всё ниже под CC0 или MIT, поэтому лежит в публичном репозитории. Подпись авторов не обязательна, страница «Авторы и лицензии» (Ф4) всё равно их назовёт. KayKit просит не перепродавать паки без изменений, мы их не продаём. Текст лицензии каждого пака лежит рядом с его файлами (`License.txt`, `LICENSE`).

| Пак | Версия | Откуда | Лицензия | Что взято | Где лежит |
|---|---|---|---|---|---|
| KayKit Adventurers | бесплатная 2.0, 22.10.2025 | https://kaylousberg.itch.io/kaykit-adventurers | CC0 | шесть героев `.glb` (Knight, Barbarian, Mage, Ranger, Rogue, Rogue_Hooded), без изменений | `assets/3d/kaykit-adventurers/` |
| KayKit Character Animations | 1.1, 10.12.2025 | https://kaylousberg.itch.io/kaykit-character-animations | CC0 | 14 клипов скелета Rig_Medium в одном файле `rig-medium-probe.glb` (список ниже) | `assets/3d/kaykit-animations/` |
| KayKit Forest Nature Pack | бесплатная 1.0, 29.04.2025 | https://kaylousberg.itch.io/kaykit-forest | CC0 | 26 моделей `.gltf` с `.bin` и общий атлас `forest_texture.png`, без изменений | `assets/3d/kaykit-forest/` |
| KayKit Skeletons | бесплатная 1.1, 22.10.2025 | https://kaylousberg.itch.io/kaykit-skeletons | CC0 | `Skeleton_Warrior.glb`, без изменений | `assets/3d/kaykit-skeletons/` |
| Kenney UI Pack Adventure | 1.1, 13.08.2024 | https://kenney.nl/assets/ui-pack-adventure | CC0 | пять SVG (панель, кнопка, лента, круг, звезда), без изменений | `assets/ui/kenney-ui-adventure/` |
| three.js | 0.186.1 | https://registry.npmjs.org/three/-/three-0.186.1.tgz | MIT | `build/three.module.js`, `build/three.core.js`, `GLTFLoader.js`, `BufferGeometryUtils.js`, `SkeletonUtils.js`, без изменений | `vendor/three/0.186.1/` |

Полные архивы в репозиторий не кладём. Если понадобится остальное содержимое пака, архив скачивается заново по ссылке, сумма ниже подтверждает, что это тот же файл.

```
abe48f4763fba0896bab486ee9e6d08ca6b5b3884b9601f235c8847ae94dc479  KayKit_Adventurers_2.0_FREE.zip        13 024 345 байт
65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f  KayKit_Character_Animations_1.1.zip    14 858 957 байт
2ee83e63bb7695f2d884ec27ddf6fce020789a452e7d5c5b0bbdfc4f6ea1fc8c  KayKit_Forest_Nature_Pack_1.0_FREE.zip  6 435 630 байт
21fbad59ee6cc1d7bed12d0e425acab8ebe564b8620bbc1d017aedb29dd8a3d2  KayKit_Skeletons_1.1_FREE.zip           8 177 445 байт
982e8ab66842509ee9214f9c2038e594cbe029f19d1dc177fecaad3b41a67ed3  kenney_ui-pack-adventure.zip              577 463 байт
8cd068708ea44f2c73c944b1cead2ba2f0d5c15c8fc194e5700f4e4f4a033fe7  three-0.186.1.tgz                      4 648 523 байт
```

Для `three-0.186.1.tgz` дополнительно совпала сумма из реестра npm, `sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==`.

## Анимации

Каждый файл `Rig_Medium_*.glb` пака весит 0,7-1,5 МБ и несёт 11-29 клипов и манекен. Телефону пришлось бы качать около 4 МБ ради десятка движений, поэтому нужные клипы собраны в один файл на 413 КБ. Скелет и имена костей те же, что у героев и скелетов, three.js привязывает дорожки анимации к костям по имени.

| Файл пака | Клипы |
|---|---|
| `Rig_Medium_General.glb` | Idle_A, Idle_B, Hit_A |
| `Rig_Medium_MovementBasic.glb` | Running_A |
| `Rig_Medium_MovementAdvanced.glb` | Dodge_Left, Dodge_Right |
| `Rig_Medium_Simulation.glb` | Cheering, Waving, Sit_Floor_Down, Sit_Floor_Idle, Sit_Floor_StandUp |
| `Rig_Medium_Special.glb` | Skeletons_Idle, Skeletons_Taunt, Skeletons_Awaken_Standing |

Собрать заново из распакованного архива (`RM` это папка `Animations/gltf/Rig_Medium` пака).

```bash
node tools/assets/extract-clips.mjs assets/3d/kaykit-animations/rig-medium-probe.glb "$RM/Rig_Medium_General.glb:Idle_A,Idle_B,Hit_A" "$RM/Rig_Medium_MovementBasic.glb:Running_A" "$RM/Rig_Medium_MovementAdvanced.glb:Dodge_Left,Dodge_Right" "$RM/Rig_Medium_Simulation.glb:Cheering,Waving,Sit_Floor_Down,Sit_Floor_Idle,Sit_Floor_StandUp" "$RM/Rig_Medium_Special.glb:Skeletons_Idle,Skeletons_Taunt,Skeletons_Awaken_Standing"
```

У клипов Dodge_Left и Dodge_Right проба при загрузке убирает сдвиг корня (полшага вбок), потому что героя между дорожками двигает код.

## Модели леса

Деревья Tree_1_A, Tree_1_B, Tree_2_A, Tree_2_B, Tree_3_A, Tree_3_B, Tree_4_A, Tree_4_B. Кусты Bush_1_C, Bush_2_B, Bush_3_B, Bush_4_C. Камни на дорожке Rock_1_D, Rock_1_E, Rock_2_C, Rock_3_E. Камешки Rock_2_A, Rock_2_B. Валуны Rock_1_J, Rock_1_K, Rock_2_E, Rock_3_K, Rock_3_M. Трава Grass_1_B, Grass_1_C, Grass_2_B. Все с суффиксом `_Color1`, у бесплатной версии он один.

## Чего в этих паках нет

Монет, сундуков и ключей нет ни в одном из пяти паков. В пробе вместо монет звезда Kenney, а модели монет, сундуков и ключей из KayKit Platformer Pack или Dungeon Remastered (spec-visual-v2 §6) качаются отдельным шагом со своим «да».
