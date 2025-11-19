# Spark System – MVP Design (Core Logic & Comeback Mechanic)

> Draft design for integrating Spark as a shared, tug‑of‑war resource into the existing Dice Combat engine/game layers. Scope: core resource model + comeback gain condition; spending/UX comes later.

## 1. Goals & Scope

- Zaviesť Spark ako **centrálny shared resource**:
  - Max 3 Sparky v hre (globálny pool).
  - Každý hráč drží 0–3 Sparky; `you.sparks + ai.sparks ≤ 3`.
- Implementovať **tug‑of‑war** mechaniku:
  - Ak Spark získavaš a v banke nie je voľný, kradneš ho súperovi.
  - MVP: „bully steal“ je povolený aj keď už vedieš.
- Implementovať **comeback Spark**:
  - Hráč, ktorý v predchádzajúcom ťahu utrpel damage a v svojom ťahu „whiffne“ (vyčerpá všetky rerolly a skončí bez komba), získa 1 Spark.
- Udržať **deterministickú, testovateľnú** Spark logiku:
  - Pure funkcie, žiadne UI/event side‑effects.
  - Jednotná integračná vrstva cez `GameState`/reducer.

Out of scope (pre tento dokument):

- Detailné pravidlá, ako Spark míňať na manipuláciu kociek.
- Hero‑špecifické Spark questy a status‑based Spark efekty.
- Finálna prezentácia Sparku v UI (vizuály, animácie).

## 2. Dátový model & invarianty

### 2.1 PlayerState a flags

Rozšírime `PlayerState` tak, aby niesol Sparky a jednoduchý flag pre comeback logiku:

```ts
// src/game/types.ts

export type PlayerFlags = {
  tookDamageLastTurn?: boolean;
};

export type PlayerState = {
  hero: Hero;
  hp: number;
  tokens: Tokens;
  sparks: number;        // 0–3
  flags?: PlayerFlags;   // meta o poslednom kole, ďalej rozšíriteľné
};
```

Inicializácia:

- `createPlayer(hero)` v `src/game/state.ts` nastaví:

```ts
function createPlayer(hero: Hero): PlayerState {
  return {
    hero,
    hp: hero.maxHp,
    tokens: cloneTokens(EMPTY_TOKENS),
    sparks: 0,
    flags: {},
  };
}
```

### 2.2 Globálny Spark pool

Nebudujeme samostatné pole „banky“ v `GameState`. Banku vždy dopočítame z invariantov:

```ts
bank = MAX_SPARKS_IN_GAME - (players.you.sparks + players.ai.sparks);
```

Konštanty:

```ts
// src/game/spark.ts (navrhované)

export const MAX_SPARKS_IN_GAME = 3;
export const MAX_SPARKS_PER_PLAYER = 3;
export const ALLOW_BULLY_STEAL = true; // MVP tuning switch
```

Helper:

```ts
export const getSparkBank = (you: number, ai: number): number =>
  Math.max(0, MAX_SPARKS_IN_GAME - (you + ai));
```

## 3. Pure Spark engine (deterministická logika)

Navrhujeme nový modul v game vrstve:

- `src/game/spark.ts` – core logika pre zisk/minutie Sparku, bez UI a bez priamej práce s `GameState`.

### 3.1 API

```ts
import type { Side } from "./types";

export type SparkResult = {
  nextYou: number;
  nextAi: number;
  gained: number;  // koľko reálne pribudlo volajúcej strane
  stolen: boolean; // či sa pri zisku aspoň raz kradlo súperovi
  spent?: number;  // pri mínus amount – koľko Sparkov sa reálne minulo
};

export function calculateSparkChange(
  currentYou: number,
  currentAi: number,
  side: Side,
  amount: number
): SparkResult;
```

### 3.2 Semantika `calculateSparkChange`

Vstupy:

- `currentYou`, `currentAi` – aktuálne Sparky oboch strán.
- `side` – stránka, ktorá žiada operáciu (`"you"` alebo `"ai"`).
- `amount`:
  - `> 0` – pokus získať `amount` Sparkov.
  - `<= 0` – pokus minúť `|amount|` Sparkov.

Pseudo‑implementácia:

```ts
export function calculateSparkChange(
  currentYou: number,
  currentAi: number,
  side: Side,
  amount: number
): SparkResult {
  let mySparks = side === "you" ? currentYou : currentAi;
  let enemySparks = side === "you" ? currentAi : currentYou;
  let actualGained = 0;
  let actualSpent = 0;
  let wasStolen = false;

  if (amount > 0) {
    for (let i = 0; i < amount; i += 1) {
      const bank = MAX_SPARKS_IN_GAME - (mySparks + enemySparks);
      if (mySparks >= MAX_SPARKS_PER_PLAYER) break;

      if (bank > 0) {
        mySparks += 1;
        actualGained += 1;
      } else if (enemySparks > 0) {
        if (ALLOW_BULLY_STEAL || mySparks <= enemySparks) {
          enemySparks -= 1;
          mySparks += 1;
          actualGained += 1;
          wasStolen = true;
        }
      }
    }
  } else if (amount < 0) {
    const cost = Math.abs(amount);
    const canSpend = Math.min(mySparks, cost);
    mySparks -= canSpend;
    actualSpent = canSpend;
  }

  return {
    nextYou: side === "you" ? mySparks : enemySparks,
    nextAi: side === "you" ? enemySparks : mySparks,
    gained: actualGained,
    stolen: wasStolen,
    spent: actualSpent,
  };
}
```

Vlastnosti:

- Deterministické (žiadny RNG, žiadne externé závislosti).
- Udržuje invariant `you + ai ≤ MAX_SPARKS_IN_GAME`.
- Použiteľné pre:
  - comeback Spark,
  - hero passívy,
  - statusy/defense efekty,
  - budúce „spend Spark“ ability.

## 4. Integrácia do GameState a reduceru

### 4.1 GameAction rozšírenia

V `src/game/state.ts` rozšírime typ `GameAction` o Spark‑špecifické udalosti:

```ts
export type GameAction =
  | { type: "GAIN_SPARK"; side: Side; amount: number; reason?: string }
  | { type: "SPEND_SPARK"; side: Side; amount: number; reason?: string }
  // ... existujúce akcie ...
```

MVP konvencie:

- `GAIN_SPARK.amount` – kladný integer (typicky 1).
- `SPEND_SPARK.amount` – kladný integer (koľko chceme minúť).
- `reason` – ľubovoľný string na debug / logy:
  - `"comeback"`, `"ability:Pyromancer:5OAK"`, `"debug"` atď.

### 4.2 Reducer logika

V `gameReducer` pridáme nové case:

#### `GAIN_SPARK`

- Načíta `youSparks`, `aiSparks` z `state.players`.
- Zavolá `calculateSparkChange`.
- Vráti nový `GameState` s upravenými `players.you.sparks`, `players.ai.sparks`.
- (Voliteľne) zapíše log cez existujúci `PUSH_LOG`:

Príklady logov:

- Hráč:
  - `"Spark: Pyromancer gains 1 Spark (pool: 2/3)."`
  - Pri krádeži: `"Spark: Pyromancer steals 1 Spark from Shadow Monk!"`
- AI:
  - `"[AI] Spark: Shadow Monk gains 1 Spark (pool: 1/3)."`

Banku vieme v logu dopočítať cez helper `getSparkBank`.

#### `SPEND_SPARK`

- Použije `calculateSparkChange` s `amount = -action.amount`.
- Aktualizuje `players[side].sparks` podľa výsledku.
- `result.spent` môže slúžiť na log:
  - Ak `spent === 0`, možno log `Spark: not enough to spend.` (alebo žiadny log pre menej šumu).

### 4.3 Invarianty

Reducer by mal:

- nikdy nepripustiť, aby `sparks` klesli pod 0,
- nikdy nepresiahnuť `MAX_SPARKS_PER_PLAYER`,
- nikdy nedovoliť, aby súčet Sparkov prekročil `MAX_SPARKS_IN_GAME`
  (všetko zaklopené v `calculateSparkChange`).

## 5. Flag „tookDamageLastTurn“

Cieľ: mať spoľahlivý signál, že:

> „Tento hráč bol v **predchádzajúcom ťahu súpera zasiahnutý útokom** (HP damage).“

Comeback Spark potom „číta“ tento flag pri konci vlastného whiff kola.

### 5.1 Nastavenie flagu pri útoku

Najlepšie miesto: `src/engine/resolveAttack.ts`, kde máme:

- `damageDealt` – HP damage na obrancu,
- `reflectDealt` – damage na útočníka.

Strategie:

- Pri výpočte `nextAttacker` / `nextDefender` po `applyAttack`:
  - Ak `damageDealt > 0` → nastaviť (merge‑núť) `flags.tookDamageLastTurn = true` na `nextDefender`.
  - Pri `reflectDealt > 0` by sme teoreticky mohli flag nastaviť aj útočníkovi, ale pre MVP comeback chceme riešiť primárne „hlavný hit“. Otvorené na tuning.

Následne:

- `useDefenseResolution` (`src/hooks/useDefenseResolution.ts`) už robí:

  ```ts
  setPlayer(attackerSide, resolution.updatedAttacker);
  setPlayer(defenderSide, resolution.updatedDefender);
  ```

- Ak flag nastavíme už v `resolveAttack`, hook nemusí pridávať extra logiku – iba uloží nový `PlayerState` aj s flagmi.

### 5.2 Čistenie flagu na konci vlastného ťahu

Chceme:

- Flag sa nastaví v **súperovom útočnom ťahu**, keď dostanem damage.
- Zostane true počas **celého môjho nasledujúceho ťahu**.
- Po skončení môjho ťahu (či už s útokom alebo whiff passom) sa resetuje na false.

Najcentrálnejší bod: spracovanie `TURN_END` eventu v `useGameFlow`:

- `src/hooks/useTurnController.ts`, `send(event: GameFlowEvent)` – case `"TURN_END"`:

  - Máme `event.next` → kto ide na ťah ďalej.
  - Hráč, ktorému ťah práve skončil:

    ```ts
    const justEnded: Side = event.next === "you" ? "ai" : "you";
    ```

- Návrh:

  - Pred plánovaním `startTurn(event.next, afterReady)`:

    ```ts
    dispatch({ type: "CLEAR_DAMAGE_FLAG", side: justEnded });
    ```

  - Reducer `CLEAR_DAMAGE_FLAG`:

    - načíta `players[side]`,
    - ak sú flags, vráti nového hráča s `flags.tookDamageLastTurn = false`.

Tým pádom:

- `tookDamageLastTurn` je true len medzi „dostal som hit“ a „koniec môjho nasledujúceho ťahu“.
- Comeback Spark sa môže spoľahnúť, že „true“ znamená čerstvý, ešte nezúžitkovaný comeback stav.

## 6. Comeback Spark – spúšťacia logika

Z PRD a návrhu:

> Ak hráč v predchádzajúcom kole utrpel HP damage, a v aktuálnom kole:
> – vyčerpá všetky rerolly (`rollsLeft === 0`),  
> – nenašiel žiadne combo (končí cez „End Turn“),  
> dostane 1 Spark.

Chceme to spraviť:

- symetricky pre hráča aj AI,
- deterministicky (len podľa `GameState`),
- s čo najtenším UI hookom.

### 6.1 Helper `maybeGrantComebackSpark`

Navrhovaný helper v `src/game/spark.ts`:

```ts
export type ComebackCheckResult = {
  shouldGrant: boolean;
  side: Side;
};

export function shouldGrantComebackSpark(
  state: GameState,
  side: Side
): boolean;
```

MVP logika:

- Overiť, že:
  - `state.players[side].flags?.tookDamageLastTurn === true`.
  - Hráč práve končí whiff ťah:
    - `state.turn === side`.
    - `state.phase === "roll"` (stále v útočnej fáze).
    - `state.rollsLeft === 0`.
    - Žiadny dostupný offensive combo:
      - pre hráča použijeme rovnakú logiku ako `hasAttackOptions` v `PlayerAbilityList` (t.j. `readyForActing` žiadny `true`).
      - pre AI je whiff definovaný vlastným flow (viď nižšie).
    - Žiadne prebiehajúce roll animácie:
      - `!state.rolling.some(Boolean)`.
    - Žiadny blokujúci status (`statusActive` v controlleri/`GameData`).

Funkcia samotná je pure – iba číta `GameState` a vracia boolean.

Samotný zisk prebehne cez `dispatch({ type: "GAIN_SPARK", ... })`.

### 6.2 Hráčsky flow – `onEndTurnNoAttack`

V `src/context/GameController.tsx` už máme:

```ts
const onEndTurnNoAttack = useCallback(() => {
  if (turn !== "you" || rolling.some(Boolean)) return;
  const heroName = players.you.hero.name;
  const resolution = resolvePassTurn({
    side: "you",
    message: `[Turn] ${heroName} ends the turn.`,
  });
  applyTurnEndResolution(resolution, { blankLineBefore: true });
}, [applyTurnEndResolution, players.you.hero.name, rolling, turn]);
```

Navrhovaná úprava:

1. Pred `resolvePassTurn`:

   - Použiť `latestState.current` (už existuje v GameController).
   - Overiť `shouldGrantComebackSpark(latestState.current, "you")`.
   - Ak áno:

     ```ts
     dispatch({
       type: "GAIN_SPARK",
       side: "you",
       amount: 1,
       reason: "comeback",
     });
     dispatch({
       type: "PUSH_LOG",
       entry: "Spark gain: Comeback (no combo after damage).",
     });
     ```

2. Potom vykonať `resolvePassTurn` + `applyTurnEndResolution` ako dnes.

3. `CLEAR_DAMAGE_FLAG` sa vykoná pri spracovaní `TURN_END` (viď sekcia 5.2), takže comeback stav sa nevie zneužiť viackrát po sebe.

### 6.3 AI flow – `onAiNoCombo`

AI whiff je už dnes explicitne signalizovaný v `src/context/GameController.tsx`:

```ts
useAiController({
  // ...
  onAiNoCombo: () => {
    applyTurnEndResolution(
      resolvePassTurn({
        side: "ai",
        durationMs: AI_PASS_EVENT_DURATION_MS,
      })
    );
  },
  // ...
});
```

Rozšírenie:

1. Pred `applyTurnEndResolution`:

   - Prečítať `latestState.current`.
   - Overiť `shouldGrantComebackSpark(latestState.current, "ai")`.
   - Ak áno:

     ```ts
     dispatch({
       type: "GAIN_SPARK",
       side: "ai",
       amount: 1,
       reason: "comeback",
     });
     dispatch({
       type: "PUSH_LOG",
       entry: "[AI] Spark gain: Comeback (no combo after damage).",
     });
     ```

2. Potom vykonať `resolvePassTurn` a turn flow ako dnes.

Týmto je comeback mechanika symetrická a dobre simulovateľná (sim môže volať rovnakú logiku bez UI).

## 7. Budúce rozšírenia (mimo okamžitého MVP)

Tento dokument rieši „jadro“ Sparku. Ďalšie kroky:

### 7.1 Spend Spark – manipulácia s kockami

Podľa PRD:

- 1 Spark → reroll vlastnej kocky.
- 2 Sparky → reroll súperovej kocky.
- 3 Sparky → otočenie vlastnej kocky na ľubovoľnú hodnotu (mini‑ult).

Návrh smerovania:

- Implementovať ako **aktívne ability** v `GameController` / `useActiveAbilities`, nie ako ad‑hoc tlačidlá.
- Každý „Spark spend“:
  - skontroluje `PlayerState.sparks`,
  - ak stačí → `dispatch({ type: "SPEND_SPARK", ... })` + vhodná manipulácia s dice v `useDiceAnimator` / `useRollAnimator`.

### 7.2 Ďalšie zdroje Sparku

- Hero‑špecifické „Spark questy“:
  - Napr. Shadow Monk získa Spark pri konkrétnej kombinácii kociek.
  - Implementované v kombinácii:
    - `src/game/combos.ts` + hero definície v `heroes.ts`,
    - následné `GAIN_SPARK` pri triggri.
- Statusy / defense schema efekty:
  - Napr. špeciálny defense rule „na 3×6 ukradni 1 Spark“.
  - Opäť cez `GAIN_SPARK` s `reason: "defenseRule:..."`.

### 7.3 UI & prezentácia

- Zobrazenie Sparku:
  - lane medzi hrdinami, tokeny pri portrétoch, alebo bar v strede stola.
  - Dizajn by mal podporovať PRD:
    - „Spark mení osud zápasu“, „Spark swing“, clutch momenty.
- Cues:
  - nový `Cue` typ napr. `kind: "sparkSwing"`, ktorý sa posiela pri výraznej zmene (krádež, prechod z 0→3 atď.).

### 7.4 Telemetria

V `StatsContext` / `stats/tracker`:

- Po zavedení Spark logiky má zmysel trackovať:
  - počet Sparkov získaných/minutých per match,
  - koľko comeback Sparkov bolo udelených a či viedli k výhre,
  - koreláciu medzi Spark lead a winrate.

## 8. QA scenáre (čo by malo fungovať po implementácii)

Niekoľko konkrétnych scenárov, ktoré by mali pokrývať MVP:

1. **Základný zisk z banky**
   - Start: `you.sparks = 0`, `ai.sparks = 0`.
   - `GAIN_SPARK(you, 1)` → `you=1, ai=0`, bank=2.
   - Dvakrát zopakovať → `you=3, ai=0`, bank=0.

2. **Bully steal**
   - Start: `you=2`, `ai=1` (bank=0).
   - `GAIN_SPARK(you, 1)` → `you=3`, `ai=0`, bank=0, `stolen=true`.

3. **Spend + bank obnova**
   - Start: `you=2`, `ai=1` (bank=0).
   - `SPEND_SPARK(you, 1)` → `you=1`, `ai=1`, bank=1.

4. **Comeback Spark pre hráča**
   - Kolo N: AI útočí, `damageDealt > 0` na hráča → `players.you.flags.tookDamageLastTurn = true`.
   - Kolo N+1:
     - Hráč hodí, vyčerpá všetky rerolly (`rollsLeft=0`).
     - Žiadne ready combo, klikne „End Turn“.
     - Pred `resolvePassTurn` → `shouldGrantComebackSpark` je true:
       - `GAIN_SPARK(you, 1)` + log „Spark gain: Comeback (no combo after damage).“
     - Po `TURN_END` → `CLEAR_DAMAGE_FLAG` pre hráča.

5. **Comeback Spark pre AI**
   - Kolo N: hráč útočí, `damageDealt > 0` na AI → `players.ai.flags.tookDamageLastTurn = true`.
   - Kolo N+1:
     - AI prebehne tri roll kroky, nenašlo combo → `onAiNoCombo`.
     - `shouldGrantComebackSpark(state, "ai")` je true:
       - `GAIN_SPARK(ai, 1)` + AI log.
     - `resolvePassTurn` ukončí AI ťah, flag sa resetne.

Tento dokument má slúžiť ako referenčný rámec pre implementáciu Spark systému v MVP rozsahu – od typov, cez čistú logiku až po integračné body v game/flow vrstve. Po implementácii by sme mali doplniť stručný task log (napr. `docs/tasks-YYYY-MM-DD.md`) s detailmi, čo bolo zmenené a aké tuning otázky ostávajú otvorené. 

