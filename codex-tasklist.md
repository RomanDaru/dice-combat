# `codex-tasklist.md`

> Stručný tasklist. Detailné zásady ostávajú v `codex-guidelines.md`.

## Sprint LITE (90 min) — Minimal realistický plán

> Cieľ: zvýšiť hrateľnosť a rýchlosť iterácie bez veľkých refaktorov. Tri malé PR, každé zvládnuteľné samostatne.

### PR‑L1: `rng.ts` + nahradenie hodov kociek

- **Súbory:** `src/engine/rng.ts` (nový), úpravy tam, kde sa hádže kocka.
- **Úlohy:**
  1. Vytvor `rng.ts`:

     ```ts
     export type Rng = () => number;
     export function makeRng(seed: number): Rng {
       let t = seed >>> 0;
       return () => {
         t += 0x6d2b79f5;
         let r = Math.imul(t ^ (t >>> 15), 1 | t);
         r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
         return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
       };
     }
     ```
  2. V engine logike injektuj `rng: Rng`; default v UI môže byť `makeRng(Date.now())`, no do `GameState` pridaj `seed` (ulož pri save/load, fallback na `Date.now()` pri nulovom save).
  3. Nahraď `Math.random()` v logike hodov (`src/game/combos.ts`, `src/hooks/useDiceAnimator.ts`, `src/screens/BattleScreen.tsx`) za použitie `rng`. UI-only efekty môžu zostať na `Math.random`, ale skontroluj sa `git grep "Math.random"`.
- **Akceptácia:** s rovnakým seedom prebehne súboj identicky; `git grep Math.random` ukazuje iba UI efekty (žiadne engine výpočty).

### PR‑L2: Mini „engine ostrovček“ — vyseknúť iba `resolveAttack`

- **Súbory:** `src/engine/resolveAttack.ts` (nový), drobné adaptácie importov.
- **Úlohy:**
  1. Presuň existujúcu funkciu výpočtu výsledku útoku do `src/engine/resolveAttack.ts` (bez React importov).
  2. Navrhni podpis:

     ```ts
     import type { Rng } from "./rng";
     export function resolveAttack(
       state: GameState,
       decision: AttackDecision,
       rng: Rng
     ): { nextState: GameState; events: Event[] };
     ```

     (aspoň minimálna štruktúra `events` pre budúce rozšírenie).
  3. V React adaptéri (GameController) iba zavolaj engine funkciu a aplikuj výsledok; žiadne priame mutácie.
- **Akceptácia:** `resolveAttack.ts` neimportuje React/TSX; flow funguje bez vizuálnych zmien; tests upravené na nový podpis.

### PR‑L3: Jasný „impact“ pri aplikácii dmg/štítu

- **Súbory:** komponenty s animáciou zásahu (`BattleScreen`, resp. dedikovaný anim hook).
- **Úlohy:**
  1. Pri úspešnom `resolveAttack` spusti krátky „pop“ (scale 1 → 1.08 → 1, ~120 ms) a haptiku (ak zariadenie podporuje, inak fallback).
  2. Zvýrazni posledný riadok combat logu (napr. invert farby alebo rámik na 1 s): `You hit 4, Blocked 2 → 2 dmg`.
  3. Počas impactu dočasne deaktivuj akčné UI prvky (ghost/opacity), aby bolo jasné, že beží rozlíšenie.
- **Akceptácia:** hráč vizuálne/hapticky cíti dopad; posledný log je krátko zvýraznený; akcie sú na ~150 ms nedostupné, potom sa vrátia.

### Kontrolný zoznam po sprinte LITE

- [ ] `src/engine/rng.ts` existuje; `GameState` a save systém nesú `seed`.
- [ ] Kocky používajú injektovaný `rng`; `git grep "Math.random"` vracia len UI efekty.
- [ ] `src/engine/resolveAttack.ts` je čistá funkcia a vracia `{ nextState, events }`.
- [ ] Impact animácia + haptický fallback + highlight combat logu fungujú.
- [ ] Hrateľný loop je čitateľnejší bez veľkých refaktorov a je pripravený na ďalšiu modularizáciu.
