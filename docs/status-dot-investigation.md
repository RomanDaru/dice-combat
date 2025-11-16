# Status DOT Investigation (Burn Regression)

**Context**: Game export `DC_ShadowMonk_Pyromancer_151125_225419.json` (Shadow Monk vs Pyromancer, 2025-11-15) shows that Pyromancer applied Burn via `Pyromancer:4OAK`, but the defender sometimes never saw the token and/or the upkeep tick failed to fire. Integrity section confirms HP drift (`you +1`, `ai +7`), so DOT effects are currently bypassing both logging and sometimes gameplay.

## Observed Symptoms
1. **Missing Burn token**: During live play, Burn sometimes appeared a full turn late (token shown only after confirm defense) or not at all, even though turnStats show `statusApplied: { burn: 1 }` on Pyromancer’s attack (`turn_mi0sqvel_bb09l4`).
2. **No upkeep tick**: Even when Burn appeared visually, the subsequent upkeep didn’t trigger the damage. Export contains no `phaseDamage.upkeepDot` entries, and HP drift shows 7 damage dealt “outside” turns.
3. **Delayed grant at KO**: `defenseBuffs.expired` lists Burn pending with `usablePhase: "nextTurn"` created on the KO turn (`turn_mi0tpzzt_r2t7uq`), then expiring due to opponent KO. That means the grant was still pending when the match ended – so players can never see it.

## Hypotheses
1. **Grant phase mismatch** – Burn is queued as `nextTurn`, but the trigger (`triggerDefenseBuffs("nextTurn")`) may fire before we enqueue the buff or after the round already ends, leaving it pending. Need to confirm the ordering inside `usePlayerDefenseController` → `queuePendingDefenseGrants` vs `releasePendingDefenseBuffs` at the end of a defense.
2. **Upkeep trigger missing** – `consumeUpkeepDamage` or `applyStatusTicks` might ignore statuses that arrived via pending defense buffs (grant came in after `turnStart` trigger). Check `startTurn` flow in `GameController` → `handleTurnStartStats` (lines ~660) to see whether we fire `triggerDefenseBuffs("nextTurn")` before or after we compute upkeep/status ticks.
3. **Telemetry gap** – even when damage applies, we aren’t writing it to `turnStats.phaseDamage.upkeepDot`, so exports look like invisible heals. Need to instrument `consumeUpkeepDamage` (which returns the DOT amount) and feed it into `prepareTurnSnapshot` + `resolveDefenseWithEvents` stats payload.

## Next Steps
1. **Trace pending burn lifecycle**
   - Add DEV logs around `queuePendingDefenseGrants` for Pyromancer’s schema to confirm when Burn is enqueued and which phase it targets.
   - Instrument `releasePendingDefenseBuffs` for `nextTurn` to list buff IDs released per turn and which ones remain pending after each trigger.
2. **Verify turn start ordering**
   - Audit `handleTurnStartStats` (`src/context/GameController.tsx:660+`) to ensure `triggerDefenseBuffs("nextTurn")` runs before we calculate upkeep damage. If not, reorder so pending DOT grants land before upkeep processing.
3. **Add DOT telemetry**
   - Pipe the output of `consumeUpkeepDamage`/`resolveStatusTicks` into `turnStats.phaseDamage.upkeepDot` and integrate it into `gameStats.integrity` recomputation to eliminate future drifts.
4. **Replication scenario**
   - Build a deterministic test (Vitest or harness) where Pyromancer applies Burn and we advance turns manually, verifying the token shows up immediately and upkeep reduces HP exactly once per stack.

This document tracks DOT-specific issues to keep `docs/status-phase-plan.md` focused on phase/spend alignment. Once we confirm Burn’s lifecycle, we can extend the same fixes to bleed/poison statuses.
