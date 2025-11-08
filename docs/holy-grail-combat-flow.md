# Combat Flow Holy Grail

Tento dokument zachytáva rozhodnutia a smerovanie, ktorými sa musí riadiť celá combat/turn logika. Ber ho ako referenciu pri návrhu statusov, hookov a orchestrácie v `GameController`.

## Turn Phases (Makro)

1. **Upkeep** – resolve pasívnych statusov, tiky, prompt hráčovi na aktívne statusy viazané na začiatok ťahu.
2. **AttackRoll** – útočník deklaruje zámer, hádže, vykonáva rerolly, vyhodnocuje útočné statusy.
3. **DefenseRoll** – okno na pre-defense reakcie, následne obranný hod, výber komba a blokov.
4. **EndTurn** – zhrnutie výsledkov, aplikácia damage/reflect/heal, cleanup a prepnutie ťahu.

Každá fáza je pevná a engine medzi nimi prepína deterministicky. Žiadne statusy ani schopnosti nesmú meniť názvy fáz; namiesto toho môžu vložiť extra udalosti _v rámci_ príslušnej fázy.

## Reaction Micro-Hooks

Každá makrofáza sa skladá z jemných krokov, do ktorých je možné zaregistrovať statusy (aktívne aj pasívne). Hooky idú v tomto poradí:

- **Upkeep**: `OnUpkeepTick`
- **AttackRoll**: `OnAttackDeclare` → `PreAttackResolve` → `OffenseRoll` (vrátane až troch rerollov) → `PostAttackResolve`
- **Medzi Attack a Defense**: `PreDefenseStart` (napr. zamrazenie kocky)
- **DefenseRoll**: `BeforeDefenseRoll` → `AfterDefenseRoll` → `ReactiveAttackModifiers`
- **Damage Window**: `PreDamageCalc` → `PostDamageApply`
- **Turn Transition**: `PreTurnEnd` → `PostTurnEnd`

Standoff/initiative je len počiatočný hod, nie regulárna fáza. Po každom mikro-hooku môže engine ponúknuť hráčovi alebo AI možnosť zareagovať (ak má aktívny status registrovaný pre dané okno).

## Status System Guiding Rules

- **Polarity**: statusy sa delia na `positive status effect` (owner, pozitívne, buffy) a `negative status effect` (opponent, negatívne, debuffy). Statusy sa budu moct aj prenasat z hraca na hraca, takze owner sa moze menit, hrac/user musi mat moznost vediet prehodit jeho negativny status na opponenta ktory mu ho udelil a naopak.
- **Activation**: `active` (hráč/AI vedome spenduje a rozhoduje o množstve) vs. `passive` (automaticky sa spustí).
- **Timing/Window**: každý status deklaruje jeden alebo viac mikro-hookov, v ktorých sa môže spustiť (`attackRoll.pre`, `defenseRoll.after`, `preDamageCalc`, ...).
- **Behavior Registry**: status má `behaviorId`, ktoré mapuje na generický handler (napr. `bonus_block`, `bonus_damage`, `negate_incoming`, `custom_script`). Engine nepozná názvy schopností ako „Chi“ alebo „Evasive“ – všetko prebieha cez behavior kontrakt.
- **Creative Freedom**: ak status porušuje bežné pravidlá (napr. vracia fázu späť, mení počet rerollov), jeho behavior handler explicitne riadi, kam sa tok vráti alebo aký event vloží. Tým ostane jadro deterministické, ale statusy môžu pridávať „crazy“ efekty.

## Modularization Targets

`useDefenseActions.ts` nesmie byť monolit. Rozdeľujeme ho na:

1. **Shared helpers** – formátovanie názvov, merge spendov, správa pending spend queue.
2. **useDefenseResolution** – jediná funkcia, ktorá aplikuje výsledok útoku/obrany, loguje, posiela cue a plánuje AI follow-up.
3. **useAttackExecution** – hráčsky útok + spracovanie attack statusov.
4. **useAiDefenseResponse** – kompletná AI obranná pipeline, vrátane pre-defense reakcií.
5. **usePlayerDefenseController** – drží stav obranného rollu hráča a poskytuje handleri UI.
6. **usePreDefenseStatusAction** – generický systém pre statusy typu „pred obranným hodom“ (kedysi „evasive“).
7. **GameController Orchestrator** – finálny cieľ je, aby GameController bol jediný orchestrátor; hooky mu iba poskytujú funkcie.

Cieľ: výsledný `useDefenseActions` ≤ 500 riadkov, žiadne priame referencie na konkrétne status ID.

## Implementation Roadmap

1. **Status Schema Upgrade** – rozšíriť definíciu o polarity, activation, hook windows a behavior registráciu; odstrániť hardcoded ID.
2. **Behavior Handlers** – implementovať registry pre základné správania (bonus dmg/block, negate, reflect, script).
3. **Hook Decomposition** – postupne extrahovať vyššie uvedené hooky/moduly.
4. **GameController Alignment** – presunúť flow-control (setPhase, pendingAttack, cue scheduling) do centrálneho orchestrátora.
5. **Testing** – unit testy pre nové čisté funkcie + manálne scenáre (útok s viacerými statusmi, pre-defense reakcie, hráčska obrana).

Tento dokument udržiavaj aktuálny – pri každom zásadnom rozhodnutí o fázach, statusoch alebo orchestrácii sem doplň poznámky.\*\*\*
## Current Progress (Nov 2025)

- **Status Schema Upgrade**: `docs/status-definition-template.md` and `src/engine/status/defs.ts` now track polarity, activation mode, hook windows; hardcoded IDs are gone.
- **Behavior Registry**: `src/engine/status/behaviors/*` implements bonus pools, DOT, and pre-defense reactions mapped by `behaviorId`.
- **Hook Decomposition**: `useDefenseActions` has been split into `useAttackExecution`, `useDefenseResolution`, `useAiDefenseResponse`, `usePlayerDefenseController`, plus shared helpers.
- **GameController Alignment**: turn flow + cue scheduling live in `useGameFlow`/`GameController`; initiative follow-up for AI is fixed.
- **Testing**: new engine/hooks suites (`combat.integration.test.ts`, `statusSpends.test.ts`, `StatusFlagArchitecture.test.ts`) cover the runtime changes.
- **Timing Helper Adoption**: All battle UI + hooks call shared timer utilities; stray `setTimeout`/`setInterval` usage now lives in the centralized scheduler only.
- **Pre-defense Channel**: Reaction metadata + UI messaging now flow through `game/combat/preDefenseReactions.ts`, so both player + AI use the same descriptors.

## Upcoming Tasklist

- [x] Finish migrating every timing interaction to the central helper (no stray `setTimeout` usage) and expose transition metadata via context. _Done Nov 8 via `chore/timing-helper-updates`._
- [x] Complete the pre-defense status channel by moving legacy reactions into `preDefenseReactions.ts` and surfacing cues/UI copy. _Done Nov 8 via `chore/timing-helper-updates`._
- [x] Enable polarity-driven status transfer/cleanse flows so players can bounce negative stacks back to the source. _Done Nov 8 via `feat/polarity-transfer` (Purifying Flame)._
- [x] Unify defense resolution summaries with cue overlays (damage vs. block snapshot) and add regression tests. _Done Nov 8 via `feat/defense-summary-cues`._
- [ ] Pipe `resolveTurnStart` outputs (status ticks, prompts) into the cue timeline with proper durations.
- [ ] Establish a QA checklist: initiative AI win, chi spend, evasive defense plus full `vitest` run before merge.
