# Status Spend Overhaul (November 2025)

## Overview

This iteration replaces the legacy chi stepper flow with a generic status‐spend pipeline that works for both attack and defense phases. The UI now operates through `requestStatusSpend` / `undoStatusSpend`, the controller persists those requests, and the engine/runtime execute them deterministically with a single source of truth.

```
PlayerActionPanel → GameController (requests) → useDefenseActions/useAiController → engine/status runtime → resolveAttack/applyAttack → combat log
```

## Player/Controller Flow

- `PlayerActionPanel.tsx` shows Spend/Undo buttons that call `requestStatusSpend` / `undoStatusSpend` for `"chi"` in the relevant phase. The buttons reflect the current requested stack counts rather than mutating tokens locally.
- `GameController.tsx` stores `attackStatusRequests` and `defenseStatusRequests` maps, clamps them to available stacks and turn budgets, and exposes clear/reset helpers. It also keeps `turnChiAvailable` in sync with token changes and consumes per-turn chi whenever spends commit.
- When attacks or defenses resolve (`useDefenseActions.ts`), the hooks translate request counts into actual `StatusSpendSummary` objects by running `spendStatus` in the runtime. Requests are cleared after resolution whichever path completes first (successful evasive, defense roll, or attack confirmation).

## Runtime & Engine Changes

- The status runtime short-circuits spends that would apply damage/block bonuses when the underlying base value is ≤ 0, mirroring UI gating at the engine level.
- `aggregateStatusSpendSummaries` now lives in `engine/status/types.ts` alongside `StatusSpendSummary`. An `aggregateSpendSummaries` helper can combine multiple summaries, deduplicate by status, and preserve logs.
- Defense data always uses `baseBlock` (renamed from `block`) to distinguish innate board value from bonus block supplied by spends.
- Manual evasive handling was removed from `applyAttack` / `resolveAttack`; all negation flows go through the spend summaries. Evasive spend logs include roll values.
- Pending attacks on state now retain `baseDamage` and `statusSpends` so any follow-up resolution can reconstruct current totals without recomputing stepper state.

## Logging & Visuals

- `buildAttackResolutionLines` lists the defense ability line, then `Spend: …` lines, then any status logs, before summarising damage and HP updates. Evasive success is fully represented by the spend log.
- `PlayerActionPanel` displays the configured chi caps and current request counts; AI defense summaries rely on the same aggregated totals.

## AI Integration

- `useAiController` builds the same status spend summaries when deciding to invest chi. It records the original `baseDamage`, adjusts ability damage with aggregated bonus damage, and stores the summary on `pendingAttack`.

## Testing & Determinism

- Added regression tests covering:
  - Chi defense spend rejection at `baseBlock <= 0`
  - Combining multiple spend summaries (`aggregateStatusSpendSummaries`)
  - Evasive success path through the runtime (tokens remain consistent)
  - RNG determinism to guarantee seeded dice animations stay reproducible (`src/engine/__tests__/rng.test.ts`)
- All Vitest suites pass (`npm test`).

