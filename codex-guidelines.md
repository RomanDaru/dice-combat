# `codex-guidelines.md`

> Praktické pokyny pre Codex AI Agenta pri práci na projekte **dice-combat**. Cieľ: 2D mobilná hra (portrait), krátke sessiony, plynulé UI, čisté oddelenie jadra a prezentácie.

## Ciele a obmedzenia

- **Primárna platforma:** mobil (Android/iOS), s web buildom na rýchle testy.
- **Výkon:** 60 fps na mid/low-end; minimalizovať layout thrash, alokácie a reflow.
- **Ergonómia:** dotyk, veľké hitboxy, haptika, krátke animácie (220–350 ms), `prefers-reduced-motion` rešpektovať.
- **Čitateľnosť:** deterministické replaye (seedované RNG), event-driven architektúra, auditovateľný combat log.

## Architektúra

- **Layering:**

  - `engine/` – _čistá_ doména (TS bez React/DOM/Phaser). Tu sú pravidlá, RNG, resolver, FSM, typy, testy.
  - `ui/` – rendering, vstupy, animácie, zvuk/haptika. Odoberá udalosti z engine.
  - `app/` – bootstrap, DI, servisné adaptéry (Storage, Haptics, Analytics).

- **Event-driven:** engine publikuje `Event[]` (napr. `attack_started`, `dice_locked`, `damage_applied`). UI ich mapuje na animácie a zvuky; engine **nepozná** UI.
- **Deterministické RNG:** modul `rng(seed)` injektovaný do všetkých výpočtov; seed uložený v save → reprodukovateľné testy a bugy.
- **Dátovo riadené pravidlá:** abilities/efekty v JSON/TS schéme (ID, timing, targeting, modifikátory, podmienky). Logika generická, dáta špecifické.
- **FSM:** jasné stavy boja (`Roll → Reroll → Target → Resolve → End`). Prechodové guardy – bez side-efektov mimo engine.

## Kódové štandardy (TypeScript)

- `strict` mode, žiadne `any`; vždy explicitné typy na hraniciach modulov.
- Pure funkcie v engine; vedľajšie efekty len v UI/app.
- Immutabilita stavov (structural sharing), žiadne skryté mutácie.
- Funkčné jednotky ≤ 40 riadkov, súbor ≤ 300 riadkov (orientačne).
- Názvoslovie: `IEvent`, `Decision`, `Ability`, `Resolver`, `GameState`.
- Lint: ESLint + Prettier (konflikt-pravidlá vyriešené), husky pre pre-commit.

## Testovanie

- **Unit (Vitest):** engine 100% kritických ciest (damage calc, reroll, shield/reflect, timingy `onRoll/onResolve`).
- **Golden tests:** pevné seedy → stabilné repleje.
- **Property-based (voliteľne):** fast-check pre hranové hodnoty rollov.
- **Snapshoty logu:** `combatLog` výstup sa musí zhodovať s očakávaním.

## Animácie a UX

- **FLIP** metodika: raz zmerať bbox, transform-only (`transform`, `opacity`), `will-change`.
- **Pooling** vizuálnych prvkov (DOM/Phaser) namiesto alokácie každý efekt.
- **Stagger** 40–60 ms pri viacerých ikonách; „impact“ event ~80–120 ms pred koncom letu (haptika + SFX).
- `pointer-events: none` pre overlaye, aby neblokovali UI.
- Rešpektovať `prefers-reduced-motion` (skrátiť alebo preskočiť animácie).

## Výkon a assets

- Atlas/spritesheety, kompresia (webp/avif pre web, png-quant pre mobil atlas), lazy loading tam, kde to dáva zmysel.
- Žiadne `top/left` animácie, len transformy; batch čítaní/zápisov (`rAF`).
- Limit simultánnych tweens; debug režim s metrikami (fps, alokácie, počet spriteov).

## Mobilný zabalenie

- Capacitor (Android/iOS), pluginy: Haptics, Storage, (neskôr) In-App Purchases.
- Testovať 3 pomery strán (18:9, 19.5:9, 20:9), low/mid/high tier zariadenia.

## Observabilita a logovanie

- `combatLog` v engine (stručné, deterministické), UI nadstavba (formatovanie a farby).
- Jednoduchá analytika (nateraz lokálne – súbory/konzola, bez PII).

## Bezpečnosť a licencia

- Neprebierať GPL kód (Talishar) – len koncepty. V projekte mať `LICENSE` a `CREDITS`.

---
