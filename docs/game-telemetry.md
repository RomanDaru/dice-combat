# Combat Telemetry & Stats Plan

This note describes how to capture post-game telemetry on three layers: game-level (`gameStats`), turn-level (`turnStats`), and roll-level (`rollStats`). The target is live counters for the UI plus an export bundle per finished match.

---

## Data Shapes

### `rollStats`
- Keys: `id`, `gameId`, `turnId`, `round`, `side`, `startedAt`, `endedAt`, `durationMs`.
- Dice: `diceBeforeHold`, `diceAfterHold`, `holdsUsed`, `combosAvailable` (`detectCombos`), `selectedCombo`.
- Derived: success / fail flag, `rerollIndex`, `attemptIndex` (0/1/2), `aiVsPlayer`.
- Sources: `onRoll` and `onToggleHold` inside `GameController` (`src/context/GameController.tsx:813`), plus timings from `useRollAnimator`.
- Extras: `firstRollHit` boolean, `decisionTimeToHold`, `missedDefenseRoll` flag for defensive dice that time out.

### `turnStats`
- Identity: `turnId`, `round`, `attackerSide`, `defenderSide`, hero ids, `abilityId` / `combo` or `pass`.
- Combat output: `totalDamageDealt`, `damageWithoutBlock`, `damageBlocked`, `damagePrevented` (negations), `counterDamage`, `maxDamageSingleTurn`.
- Phase splits: `phaseDamage.attack`, `.counter`, `.upkeepDot`, `.collateral` with `actualDamage = attack + counter + upkeepDot + collateral - blocked - prevented`.
- Expected vs actual: `expectedDamage` (combo baseline) and `actualDamage`; `abilityValueDelta = actual - expected`.
- Pick vs opportunity: increment `opportunityCount` for every ability surfaced by `detectCombos`; increment `pickCount` when chosen.
- Defense splits: `defenseAbilityId`, `defenseBlockVsAbility[abilityId]`, `defenseEfficacyPercent`.
- Status info: `statusApplied`, `statusExpired`, `statusStackAvg` (moving average based on `PlayerState.tokens` delta).
- Status lifetime sampling: `statusLifetimeTurns`, `%CapHits`, `%Cleanse`, `%Transfer`.
- RNG artifacts: `attackDice`, `defenseDice`, `combosTriggered` histogram.
- Timing: `turnStartedAt`, `turnEndedAt`, `avgTurnTime`.
- Decision timing: `rollEndToAbilitySelectMs`, `attackPromptToChoiceMs`, `defensePromptToChoiceMs`.
- Sources:
  - `useTurnController` (`src/hooks/useTurnController.ts:293`) for start/end timestamps and round increments (`src/hooks/useTurnController.ts:393`).
  - `useAttackExecution` (`src/hooks/useAttackExecution.ts:196`) for selected ability/combo and status spends.
  - `resolveAttack` (`src/engine/resolveAttack.ts:170`) for the damage/block/reflect summary and player snapshots before/after.
  - `useDefenseResolution` (`src/hooks/useDefenseResolution.ts:175-224`) for finalized events and FX payloads.
  - `useStatusManager` (`src/hooks/useStatusManager.ts:71`) for cleanse/transfer rolls that change stacks outside of attacks.

### `gameStats`
- Metadata: `gameId`, `seed`, `startedAt`, `endedAt`, `roundsPlayed`, `winner`, `HPRemainingWinner`, `HPRemainingLoser`, `firstPlayer`, `heroId`, `heroVersion` (map), `rulesVersion`, `schemaVersion`, `buildHash`, `sessionId`.
- Aggregations: totals and avg/median/stdev for `damagePerTurn`, `damagePerRound`, cumulative time (`tempo`).
- Tempo: `tempoSeconds`, `avgTurnTimeSec`, `roundsPerMinute`.
- Per-side metrics: `dprNet`, `dprNetBySide`, `atkEvBySide`, `defEvBySide`.
- Defense: `totalBlocked`, `totalPrevented`, `counterDamage`.
- Status: counts of `statusApplied`, `statusExpired`, mean stack depth.
- Status summary: `statusSummary.applied/expired`, `avgLifetimeTurns`, `capHits`.
- Integrity: `integrity.ok`, `recomputedHpYou`, `recomputedHpAi`, `hpDriftYou`, `hpDriftAi`, optional `log`.
- RNG: `combosTriggered` histogram, `maxDamageSingleTurn`.
- Long-term: `winRatePerHero` written to `localStorage` / IndexedDB for dashboards, `comebackIndex` (wins when HP < 20%), `roundWinProbability` curve.

---

## Instrumentation Plan

1. **Game lifecycle**
   - When `handleReset` runs (`src/context/GameController.tsx:870`), create a new `gameStats` record with hero ids and seed.
   - The effect that watches `players.you.hp` / `players.ai.hp` (`src/context/GameController.tsx:884-888`) finalizes the record, stores HP leftovers, and emits the finished payload.

2. **Tempo & rounds**
   - `startTurn` inside `useTurnController` (`src/hooks/useTurnController.ts:293`) marks `turnStartedAt` and captures the current round.
   - The same hook already logs `--- Kolo N ---` (`src/hooks/useTurnController.ts:393`); piggyback to increment `roundsPlayed`.
   - `TURN_END` events emitted from `resolveAttack` carry `durationMs`, which we can reuse to compute moving `avgTurnTime`.

3. **Rolls & combos**
   - `onRoll` / `onToggleHold` (`src/context/GameController.tsx:813`) call `stats.recordRoll(...)` with dice snapshots and animation timings from `useRollAnimator`.
   - When `useAttackExecution` calls `logPlayerAttackStart` (`src/hooks/useAttackExecution.ts:196`), we know the combo, final damage, and any attack status spends. Use that moment to attach `combosTriggered` info to the pending `turnStats`.
   - AI mirrors are available through `logAiAttackRoll` inside `useCombatLog`.

4. **Damage summary**
   - `resolveAttack` already compares `PlayerState` before/after (`src/engine/resolveAttack.ts:123-168`). Extend the `summary` with `statusDiffs`, `baseDamage`, `baseBlock`, and metadata about negation sources.
   - `useDefenseResolution.resolveDefenseWithEvents` (`src/hooks/useDefenseResolution.ts:175-224`) receives the `summary` plus the combat context (attacker/defender labels). After updating player state, call `stats.recordTurn(resolution, context)` to save `damageDealt`, `blocked`, `reflected`, and the resulting HP snapshots.
   - Compute `expectedDamage` from ability definition, then store `actualDamage` from `summary.damageDealt`; the delta becomes the ability value KPI.

5. **Statuses outside attacks**
   - `useStatusManager.performStatusClearRoll` (`src/hooks/useStatusManager.ts:71-270`) knows how many stacks were consumed during cleanse/transfer; emit `statusExpired` events there.
   - Instrument `engine/status/runtime.ts` helpers (`tickStatuses`, `addStacks`, `setStacks`) with a lightweight `trackStacks(source, delta)` so ambient burns/regen also feed telemetry.
   - Track `lifetimeTurns` per status id by stamping `round` when applied and subtracting on expiration.

6. **Realtime counters**
   - Keep a `statsRef` inside `GameController` with rolling aggregates and a `currentTurn` snapshot; expose it through a `StatsContext` so panels can render live totals (e.g., "damage blocked this match").
   - Optionally dispatch `window.dispatchEvent(new CustomEvent("dc:stats", { detail }))` on every update for DevTools overlays or automated QA.
   - Buffer writes inside the context and flush on `TURN_END` to keep perf predictable; exports can use `navigator.sendBeacon` or a download blob.

---

## Metric Computation

| Metric | Source | Notes |
| --- | --- | --- |
| `totalDamageDealt`, `damagePerTurn`, `damagePerRound` | Sum/avg from `turnStats.summary.damageDealt` | Median/stdev calculated during post-game flush. |
| `damageBlocked`, `damagePrevented`, `counterDamage` | `summary.blocked`, `summary.negated`, `summary.reflected`, plus deltas between base and actual damage | Splitting blocked vs negated explains defensive value. |
| `tempo` (`roundsPlayed`, `avgTurnTime`) | `useTurnController` timestamps | Flag matches exceeding the 5–8 minute goal. |
| `statusApplied`, `statusExpired`, `statusStackAvg` | Token diffs in `resolveAttack`, `useStatusManager`, and `tickStatuses` | `statusStackAvg` is an arithmetic mean over all recorded snapshots. |
| `combosTriggered` | `effectiveAbility.combo` for player and AI | Store two histograms to validate RNG. |
| `HPRemaining*` | `players.*.hp` at game end | Goes directly into `gameStats`. |
| `maxDamageSingleTurn` | Max of `turnStats.damageDealt + counterDamage` | Catches burst spikes. |
| `winRatePerHero` | Aggregated from stored `gameStats` | Use hero id keys in local persistence. |
| `pickRate` / `opportunityRate` | Counters in `turnStats` | `pickRate = pickCount / opportunityCount`. |
| `abilityValueDelta` | `expectedDamage - actualDamage` | Reveals over/under performing combos. |
| `defenseEfficacy` | Blocked + prevented per defense ability vs incoming ability | Surfaces matchup trends. |
| `decisionTimeMs` | Timestamps around roll end and ability confirmation | Spot UX slowdowns. |
| `statusLifetimeTurns` | Apply/expire rounds | Plot distributions and cap hits. |
| `comebackIndex` | HP snapshot at victory | `1` when winner HP < 20% and was previously behind. |

---

## Minimum Extra Signals

- **Pick-rate vs opportunity-rate**: log every surfaced offensive ability (opportunity) and mark the one chosen. High ratios (>0.6) highlight auto-picks; low ratios (<0.2) flag dead content.
- **Expected vs actual damage**: store combo baseline before modifiers and compare to real damage post defense/status to quantify ability strength.
- **First-roll hit rate / rerolls / holds**: record whether a combo exists after the first roll, number of rerolls per turn, and holds used for UX difficulty.
- **Defense efficacy**: per defensive ability, track blocked, prevented, reflect amounts segmented by incoming combo id.
- **Status lifetime distribution**: track rounds alive, % hitting cap, % cleansed/transfer to measure stickiness.
- **Decision timing**: timestamps between roll end and ability selection, and between defense prompt and finalized choice.
- **Comeback index**: record HP percentages at win time plus round-by-round win probability estimate.
- **Build metadata**: include `heroVersion`, `rulesVersion`, `schemaVersion`, `buildHash`, and `sessionId` (instead of user id) for reproducibility/pseudonymization.
- **Integrity check**: after export, replay the recorded turns to recompute HP; flag mismatches in the payload.

---

## Schema & Implementation Notes

- All payloads carry IDs, timestamps, hero metadata, and the RNG `seed`.
- Prefer enums/ids over free-form strings for `combo`, `status`, `side`, and `phase` to reduce log entropy.
- Add `attemptIndex` to roll stats to distinguish first/second/third rolls.
- Buffer telemetry inside `StatsContext`; flush on `TURN_END` or when the game ends.
- Export via `navigator.sendBeacon` (if online) and as a JSON download; both use the same schema.
- Store `sessionId` (pseudonymized) to correlate matches without revealing user identity.
- Include `integrity.ok` boolean plus optional `integrityLog` describing any replay mismatch.

---

## Dashboard KPIs

- `DPR_net = (damageDealt - blocked - prevented) / turns`.
- `ATK_EV` / `DEF_EV` per hero and mirror matchup.
- `AbilityValue = avg(actualDamage - expectedDamage)`; rank abilities by this delta.
- `PickRate / OpportunityRate` thresholds: >0.6 = auto-pick, <0.2 = underused.
- `Match tempo`: rounds per minute (goal 6–9 rounds).
- `Status impact`: average damage added/removed by each status per application.
- `Comeback rate`: % of wins achieved below 20% HP.
- Surface top 3 abilities per match by value delta and pick rate inside the summary overlay.

---

## Edge Cases

- Rematches, forfeits, disconnects, or manual restarts should log `resultType` (`win`, `loss`, `draw`, `forfeit`, `disconnect`).
- Track whether a defense roll opportunity existed but the player skipped (`missedDefenseRoll`) versus no defense ability available.
- Ensure schema handles double knockouts and mid-turn resets.
- Always include `startTurnId` / `endTurnId` even when the game aborts early.

---

## Implementation Task List

### Schema & Infrastructure
- [x] Define `StatsSchema` interfaces (game/turn/roll) with enums, `schemaVersion`, hero/rules/build metadata, `sessionId`, `integrity` block.
- [x] Implement `useStatsTracker` (context + reducer) with buffering + `flushTurn()` on `TURN_END`.
- [x] Expose tracker via `StatsProvider` around `GameController`; ensure persistence hook writes to memory + optional `localStorage`.
- [ ] Add integrity replay helper that replays `turnStats` and sets `integrity.ok` + `integrityLog`.

### Data Capture Hooks
- [x] Instrument `onRoll` (player) to log `rollStats` (attempt index, first-roll hit, holds, combos available); extend to toggles/defense rolls.
- [x] Track opportunity vs pick counts inside `useAttackExecution`/AI flow and store expected damage from combo definitions (StatsTurn entries via `useDefenseActions`).
- [x] Extend `resolveAttack` summary with `baseDamage`, `actualDamage`, `statusDiffs`, `defenseAbilityId`, etc.
- [x] Capture decision timings (`rollEnd→abilitySelect`, `defensePrompt→choice`) inside `GameController` / `useDefenseActions`.
- [x] Log status lifetime events (`apply`, `expire`, `cleanse`, `transfer`) via `useStatusManager` + summary snapshots.
- [x] Record defense efficacy per ability: blocked/prevented/reflect grouped by incoming combo.

### Aggregation & Export
- [x] Compute KPIs (`DPR_net`, `AbilityValue`, pick/opportunity ratios, comeback index, status impact) when flushing `gameStats`.
- [x] Build summary overlay (top abilities, DPR_net, tempo) using `useStats()` data.
- [x] Add export UI (JSON download + optional `sendBeacon`) with seed + metadata in payload.
- [x] Include pseudonymized `sessionId`, handle rematch/forfeit/disconnect result types, and ensure retention of `startTurnId/endTurnId`.

---

## Output Options

1. **Realtime overlay (dev/debug)**
   - React inspector bound to `useStats()` renders running totals without waiting for export.

2. **Per-game export**
   - When a game ends (`players.*.hp <= 0`), build a blob:
     ```jsonc
     {
       "gameStats": { ... },
       "turnStats": [ ... ],
       "rollStats": [ ... ]
     }
     ```
   - Provide an "Export" button that calls `URL.createObjectURL(new Blob(...))` to download `.json` or `.csv`.

3. **Persistence & aggregates**
   - Append each `gameStats` payload to `localStorage["dc.stats"]` or IndexedDB. On the home screen, show aggregated numbers (win rate per hero, average damage, etc.).
   - Optionally send the payload via `navigator.sendBeacon` for remote dashboards.

4. **Log hook**
   - `useCombatLog` can push compact `Stats:` lines after every turn while the dedicated UI is under construction.

---

## Next Steps

1. Implement `useStatsTracker` + `StatsContext`.
2. Add schema metadata fields (heroVersion, rulesVersion, schemaVersion, buildHash, sessionId).
3. Extend `AttackResolution.summary` with status deltas, expected damage, and combo metadata.
4. Wire pick/opportunity counters, decision timing, and status lifetime tracking inside `GameController`, `useTurnController`, `useDefenseResolution`, and `useStatusManager`.
5. Add a basic JSON export button plus DevTools overlay plus integrity replay check.

This setup keeps gameplay untouched while giving QA and designers the telemetry they asked for after every match.
