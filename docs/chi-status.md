⚠️ **Defense v2 Focus**: Tieto poznamky riesia iba schema-based obranu (defense-v2). Povodny defense board je len fallback rezim a uz ho neudrziavame.
🧱 **Status Architecture Reminder**: Kazdy status musi fungovat cez jednotnu schému 'definicia + spravanie + faza'. Spravne nastavenie defineStatus (behavior, spend, usable phases) + fazove triggre = bez potreby manualneho tuningu. Root cause hladame v jadre status pipeline.


# Chi Status: Plumbing Overview & Debug Notes

## 1. Definition & Runtime Behavior
- Declared in `src/engine/status/defs.ts` via `defineStatus({ id: "chi", ... })`.
- `behaviorId: "bonus_pool"` with `behaviorConfig`:
  - `attack.bonusDamagePerStack = 1`
  - `defense.bonusBlockPerStack = 1`
- `spend` metadata:
  - `costStacks: 1`
  - `allowedPhases: ["attackRoll", "defenseRoll"]`
  - `turnLimited: true` (ties into per-turn status budgets).
- Tokens live in `player.tokens` (plain object). `getStacks`/`setStacks` clamp values and apply `maxStacks: 6`.

## 2. Token Surfaces / UI
- `TokenChips` reads `player.tokens` and renders yellow dot row for `chi` (max 3 dots, but tooltip shows true count).
- `PlayerAbilityList` exposes spend controls (offense + defense). Those controls call `requestStatusSpend` / `undoStatusSpend`.
- `PlayerPanel` now feeds TokenChips a derived token map (`player.tokens` minus active spend requests) so the status row reflects requested spends immediately.
- Debug logging: `defenseDebugLog` statements exist in `GameController` (`adjustStatusRequest`, `defensePlan`, etc.) to trace Chi adjustments.

## 3. Status Budgets & Requests
- `GameController` keeps `attackStatusRequests` and `defenseStatusRequests` (records keyed by `StatusId`).
- `adjustStatusRequest` (GameController) enforces:
  - Ownership check: reads from `getStacks(tokenSource, statusId, 0)`.
  - Turn-limited cap: `turnStatusBudgets` created via `createEmptyTurnStatusBudgets()`; Chi has `turnLimited: true`, so budget shrinks via `consumeStatusBudget` when spends resolve.
  - Clamp logic: `nextValue` cannot exceed `Math.min(ownedStacks, budget)`.
- Derived data flows:
  - Spend controls mutate requests.
  - `usePlayerDefenseController` + `useDefenseActions` read `defenseStatusRequests` when constructing `defensePlan`/`resolveAttack`.

## 4. Spend Execution Pipeline
1. **Selection Phase**
   - `buildDefensePlan` (`src/game/combat/defensePipeline.ts`) iterates over `spendRequests` and calls `spendStatusMany` for each Chi request.
   - `spendStatusMany` (engine/status) repeatedly invokes `spendStatus`, generating `StatusSpendSummary` entries (logs show `bonusBlock += stacksSpent`).
   - Tokens returned from `spendStatusMany` replace `defender.tokens` inside the defense plan (so the actual tokens drop immediately prior to damage resolution).
2. **Resolution Phase**
   - `resolveAttack` consumes `defensePlan.defense.statusSpends` and aggregates them via `aggregateStatusSpendSummaries`.
   - `applyModifiers` (engine/status/runtime) respects `bonus_pool` behavior: as Chi stacks exist on tokens, they add `bonusBlock` (but once consumed, stacks vanish).
   - `consumeStatusBudget` is called per spend to reduce turn-limited allowance.
3. **Post-Defense**
   - `pendingDefenseSpendsRef` (useDefenseActions) resets to avoid double spending.
   - `defenseStatusRequests` cleared when defense resolves or pending attack resets.

## 5. Grants & Gains
- Chi can be granted via ability apply map (e.g., Monk defense board `PAIR_PAIR` apply { chi: 1 }) or schema effects (rule `monk_gain_chi_per_45`).
- Schema runtime splits grants into immediate vs pending. Pending ones become `PendingDefenseBuff` entries and are applied later via `applyPendingDefenseBuff` (which clamps to `stackCap` + status `maxStacks`).
- `applyDefenseTokens` in `src/game/engine.ts` handles deterministic apply maps (defense board abilities) and clamps Chi to `clampChi` (0..3) for board effects.
- Combat log records Chi deltas via `getStatusGainLines` -> `describeStatusGain` with tag `resource:Chi`.

## 6. Known Pain Points / Suspected Root Causes
- **UI vs Reality Drift**: prior to the PlayerPanel fix, TokenChips used raw `player.tokens`, so pending spends weren’t reflected visually, making it look like Chi wasn’t consumed.
- **Multi-source mutation**: Chi tokens can change in three places during a defense: schema immediate grants, defense board apply map, and status spends. Without a single derived view it’s easy to misread logs.
- **Budget clamp effects**: If `turnStatusBudgets` resets incorrectly (e.g., not refilled at turn start), `adjustStatusRequest` silently refuses increments (only visible through `defenseDebugLog` "blocked").
- **Pending Buff Application Order**: `applyPendingDefenseBuff` log is identical regardless of source, so it can appear as if Chi was “added back” even though it’s a delayed grant.
- **Telemetry vs Live Tokens**: Stats track `chiBlock`/`chiAttackSpend` but don’t confirm UI state, so duplicates or missing spends may go unnoticed.

## 7. Debug Checklist
1. Turn start › confirm `turnStatusBudgets` Chi entry matches owned stacks (inspect `GameController` debug logs).
2. When selecting Chi spend: watch for `defenseDebugLog("adjustStatusRequest:update")` and confirm `ownedStacks`/`limit` values.
3. On defense confirmation: `defenseDebugLog("defensePlan")` should show `bonusBlock = requested` and `defenderTokensAfter` without Chi.
4. After resolution: ensure any `setPlayer ... pendingDefenseBuff:apply` log re-adding Chi corresponds to actual grants (e.g., schema rule) and not a ghost reversion.
5. TokenChips now draw from adjusted token map, so UI should drop dots immediately; if not, inspect `applyRequest` in `PlayerPanel`.

## 8. Next Steps
- Instrument `applyPendingDefenseBuff` to include `source` metadata (rule ID) for clearer logs.
- Consider adding a "virtual spend" overlay to TokenChips (e.g., show remaining vs spent colors) for clarity.
- Investigate reported issue: Chi “gain before spend applies” may stem from pending grant triggered during same resolution; confirm order of `triggerDefenseBuffs("preApplyDamage")` vs `buildDefensePlan` to ensure we’re not re-stacking before spend tokens are read.



