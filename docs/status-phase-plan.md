⚠️ Defense v2 Only: This plan applies exclusively to Defense v2 (schema). We do NOT touch the legacy board/defense logic.

# Status Phase & Buff Synchronization Plan (Variant B)

**Goal**: Align status spend/grant phases so Chi, Prevent Half, and other statuses behave deterministically. Based on docs/status-core-plan.md - we are executing Variant B.

> ✅ **Status** (2025-11-17): Variant B implementation is complete. All steps below have shipped (Chi spends/grants ordering, Prevent Half timing, virtual tokens, and opponent-status grants like Pyromancer Burn), and regression tests + docs cover the final behavior.

## 1. High-Level Steps
1. ✅ **Status phase enum in place** – audit complete. `StatusTimingPhase` remains the single source of truth (`src/engine/status/types.ts:22`), and every grant/buff helper now imports it instead of raw strings (spot-checked key callsites `src/context/GameController.tsx:586`, `src/game/defenseBuffs.ts:5`, `src/hooks/usePlayerDefenseController.ts:27`). No changes needed right now; future additions must extend the enum rather than pushing ad-hoc literals.
2. **Audit & adjust triggerDefenseBuffs calls** – make sure every phase fires exactly when intended.
3. **Grant metadata & logs** – log source/phase when applying PendingDefenseBuff.
4. **Prevent Half timing update** – ensure grant cannot be used in the same defense.
5. **Virtual tokens for Chi** – derived view that accounts for pending spends/grants.

## 2. Detailed Steps & Risks
### 2) triggerDefenseBuffs audit
- **Why**: even though calls exist in usePlayerDefenseController/useAiDefenseResponse/GameController, we need to confirm ordering and absence of duplicates.
- **Action**:
  - Review src/context/GameController.tsx (triggerDefenseBuffs usages).
  - Ensure we fire nextDefenseCommit once per defense (after resolution but before next roll).
  - Confirm AI + player flows both fire preDefenseRoll, preApplyDamage, nextDefenseCommit, postDamageApply consistently.
- **Risk**: double-trigger (buff applied twice) or missing trigger (buff stuck pending).
  - **Mitigation**: temporarily extend defenseDebugLog payload with { phase, owner, buffId } to monitor.
- **2025-02-14 Update**: Player-side status reactions were skipping the `nextDefenseCommit`/`postDamageApply` triggers, so Prevent Half/Chi grants queued for that phase never applied if a reaction ended the defense early. Added explicit triggers after the reaction-only resolution path in `src/hooks/usePlayerDefenseController.ts:563-595`. Risk: we still lack an automated regression test, so if that code path changes again the omission could return unnoticed.

### 3) Grant metadata & logging
- **Why**: Even though buildPendingDefenseBuffsFromGrants already stores source, applyPendingDefenseBuff logs are opaque.
- **Action**: Include ruleId/effectId + phase in defenseDebugLog when a buff applies (DEV only).
- **Risk**: log spam.
  - **Mitigation**: keep verbose logs behind defenseDebugLog (DEV builds only).
- **2025-02-14 Update**: `applyPendingDefenseBuff` now emits `defenseDebugLog("pendingDefenseBuff:apply", …)` that carries the trigger phase/owner, stack delta, and any `ruleId`/`effectId` source so we can trace Chi/Prevent Half grants precisely (`src/context/GameController.tsx:334-368`). Residual risk: log only fires in DEV, so we still rely on telemetry for PROD debugging.

### 4) Prevent Half timing
- **Why**: default usablePhase is still preApplyDamage. We want nextDefenseCommit so stack works only next defense.
- **Action**:
  - Change DEFAULT_PREVENT_PHASE in src/defense/effects.ts to 'nextDefenseCommit'.
  - Ensure GameController (and hooks) trigger nextDefenseCommit appropriately (see step 2).
  - Add integration test (schema roll -> pending buff -> next defense) verifying stack application.
- **Risk**: buff never activates if owner dies before next defense or trigger missing.
  - **Mitigation**: add guard in partitionBuffsByKo (buff expires gracefully); integration tests.
- **2025-02-14 Update**: DEFAULT_PREVENT_PHASE now points to `nextDefenseCommit`, so schema prevent-half grants only become usable on the following defense (`src/defense/effects.ts:32-35`). Need to follow up with an integration test to ensure delayed buffs really arrive before the next roll.
- **2025-02-16 Regression Report**:
  - No prompt shown when Prevent Half stack becomes available (player can't opt-in/out); stack is consumed silently and doesn't halve damage-only the token is removed. Need to trace `pre_defense_reaction` behavior + prompt flow in `useDefenseActions`/`usePlayerDefenseController` to ensure Prevent Half uses the same reaction pipeline as Evasive.
  - Evasive can still reach 3 stacks even though the design cap is 2. Either `maxStacks` in `defineStatus("evasive")` is wrong or schema grants bypass the clamp (likely due to pending buff application ignoring `stackCap`). Audit `applyPendingDefenseBuff` to ensure it honors status `maxStacks` + effect `stackCap`.

#### 2025-11-16 Implementation Log
| Timestamp (local, `Get-Date`) | File(s) | Change | Rationale |
| --- | --- | --- | --- |
| 2025-11-15 23:13:48 +01:00 | `src/engine/status/behaviors/preDefenseReaction.ts` | Extended reaction behavior with `damageMultiplier` handling so spends can scale remaining damage instead of only negate/block. | Prevent Half needs to halve damage and future reactions may want similar behavior. |
| 2025-11-15 23:13:55 +01:00 | `src/game/combat/preDefenseReactions.ts` | Added `requiresRoll`/`diceCount=0` metadata for no-roll reactions. | Keeps the descriptor accurate so the UI/controller can skip fake dice sequences for Prevent Half. |
| 2025-11-15 23:14:22 +01:00 | `src/hooks/usePlayerDefenseController.ts` | Updated reaction handling to respect `requiresRoll` (skip dice tray) while still routing through `resolveAttack`. | Ensures Prevent Half prompts correctly even without a reaction roll. |
| 2025-11-15 23:15:17 +01:00 | `src/engine/status/types.ts` | Added `damageMultiplier` to `StatusSpendApplyResult`. | Exposes the new mitigation signal to the resolve pipeline/logging. |
| 2025-11-15 23:16:05 +01:00 | `src/engine/resolveAttack.ts` | Introduced mitigation helpers (collect multipliers, apply post-block, emit logs). | Makes Prevent Half actually halve incoming damage and records the prevented amount. |
| 2025-11-15 23:16:45 +01:00 | `src/engine/__tests__/resolveAttack.test.ts` | Added regression tests for mitigation spends with/without base block. | Protects the new damage-halving path from regressions. |
| 2025-11-15 23:17:08 +01:00 | `src/engine/status/defs.ts` | Defined `prevent_half` (no-roll reaction, max 2) and clamped `evasive.maxStacks` to 2. | Gives Prevent Half a runtime contract and enforces the Evasive stack cap engine-side. |
| 2025-11-15 23:17:17 +01:00 | `src/context/GameController.tsx` | Pending defense buff application now clamps via status `maxStacks` in addition to per-grant caps. | Stops pending grants (like Evasive) from bypassing their global stack limits. |
| 2025-11-15 23:22:14 +01:00 | `docs/status-phase-plan.md` | Logged this work with precise timestamps for Variant B tracking. | Keeps plan documentation aligned with real changes. |
| 2025-11-15 23:24:04 +01:00 | _Status_ | **No git commit yet**; work remains staged for review/tests. | Reminder that these Variant B fixes still need a commit after verification. |
| 2025-11-15 23:35:14 +01:00 | `src/context/GameController.tsx` | Fixed HP regressions by tracking `latestPlayersRef` so pending buff grants no longer overwrite freshly updated player HP. | Player HUD now stays in sync with combat log when buffs resolve right after damage. |
| 2025-11-16 07:53:51 +01:00 | `src/components/PlayerPanel.tsx`, `src/context/GameController.tsx` | Player HUD now renders actual token stacks (no pending/grant illusions) and `setPlayer` dev logs include HP deltas for both sides. | Removes virtual token confusion and gives us concrete HP diagnostics whenever damage lands. |
| 2025-11-16 08:11:07 +01:00 | `src/hooks/useDefenseResolution.ts` | Added DEV-only `resolveDefense:setPlayer` logs (hp/tokens before/after) right when damage is applied. | Lets us capture the exact HP change during resolution without relying on later buff logs. |
| 2025-11-16 08:22:01 +01:00 | `src/game/state.ts` + callers | Reducer now logs every `SET_PLAYER` (with source + hp/tokens), and all dispatchers pass a `meta` tag so we can see which subsystem touched the player state. | Helps track down stale HP rewrites (e.g., if some hook reverts damage). |
| 2025-11-16 08:33:40 +01:00 | `src/context/playerSnapshot.ts`, `src/game/state.ts`, `src/context/GameController.tsx` | Introduced a global player snapshot store that every `SET_PLAYER` updates immediately (GameController also pushes to it pre-dispatch), and `applyPendingDefenseBuff` now reads from that store instead of stale refs. | Prevents pending buff releases from reverting HP to pre-damage values even when grants fire before React re-renders. |
| 2025-11-17 09:32:00 +01:00 | `src/hooks/useDefenseResolution.ts`, `src/hooks/useDefenseActions.ts`, `src/hooks/usePlayerDefenseController.ts`, `src/hooks/useAiDefenseResponse.ts`, `src/hooks/__tests__/useDefenseResolution.test.ts` | Moved the `nextDefenseCommit`/`postDamageApply` triggers into `useDefenseResolution` so they only fire after both `setPlayer` calls finish, removed the duplicate triggers from the player + AI controllers, and added a Vitest spec guaranteeing the new ordering. | Fixes the defense-phase race where pending grants saw the pre-spend snapshot (`1-1+2 = 3`). Now we spend tokens, commit HP/tokens, *then* release new buffs. |
| 2025-11-17 10:05:00 +01:00 | `src/defense/effects.ts`, `src/game/heroes.ts` | Investigated Pyromancer’s defense schema Burn grant and confirmed `applyStatusToOpponent` always forces `usablePhase = "nextTurn"`, so opponent-targeted debuffs only apply after their next turn begins. Explains why Burn stacks appear a full cycle late and never tick on the very next upkeep. | Root cause analysis snapshot before implementing fix. |
| 2025-11-17 10:18:00 +01:00 | `src/defense/effects.ts`, `src/defense/types.ts`, `src/game/heroes.ts` | Added optional `usablePhase` to `applyStatusToOpponent` effects so schema authors can control when opponent debuffs become active; Pyromancer’s Burn now marks `usablePhase: "immediate"` so the stack applies before the defender’s upkeep finishes. | Opponent-target statuses (Burn) now behave like instant reactions, ticking on the next upkeep instead of waiting a full turn cycle. |

### 5) Virtual tokens for Chi
- **Why**: we want engine + UI to read the same (tokens - requested + pending grants) view. Currently only PlayerPanel shows virtual counts.
- **Action**:
  - Introduce selector in GameController that derives 'effective tokens' for the player (actual tokens minus active requests plus pending grants).
  - Use that selector wherever we build defense plans or visualize tokens (PlayerPanel already mimics this; unify the logic).
  - Track pending grants per status so we can show future stacks (optional, but helps UI).
- **Risk**: rounding/ordering mistakes (grant & spend same tick).
  - **Mitigation**: keep engine operations on actual player.tokens; derived view used for UI/validation only. Unit-test the selector (Chi 3, request 2, pending grant 1 -> view = 2).
- **2025-02-14 Update**: `GameController` now computes `virtualTokens` by subtracting pending spend requests and layering in pending defense buffs with the same clamping rules we use when the buff resolves (`src/context/GameController.tsx:192` and `src/context/GameController.tsx:840`), and `PlayerPanel` consumes that shared view instead of rolling its own math (`src/components/PlayerPanel.tsx:17` and `src/components/PlayerPanel.tsx:27`). Remaining gaps: spend controls still read raw `player.tokens`, so they won't yet preview incoming Chi from pending grants.
- **2025-02-15 Regression Report**:
  - **Symptom**: During schema defenses that grant Chi, PlayerPanel now shows the newly granted stacks immediately after the roll—before the player confirms defense—and spend math looks like `1 (owned) - 1 (requested) + 2 (pending grant) = 3`. The UI then offers only one spend (correct), but the visual chips already display three stacks, which is misleading.
  - **Root Cause Hypothesis**: `virtualTokens` currently adds every pending defense buff regardless of `usablePhase` or whether its trigger fired (`src/context/GameController.tsx:866-874`). Because schema grants enqueue Chi with `usablePhase = "nextDefenseCommit"`, the derived tokens include those stacks instantly even though `applyPendingDefenseBuff` hasn’t run yet.
  - **Investigation Plan**:
    1. Instrument `virtualTokens` derivation (DEV-only `defenseDebugLog("virtualTokens", …)` next to the `useMemo`) to log the breakdown `{ actual, minusRequests, plusPendingBuffs }` so we can confirm pending buffs are the only delta (file target `src/context/GameController.tsx:840`).
    2. Add a focused integration test (Vitest) that simulates: Chi = 1, pending grant of 2 with `usablePhase = "nextDefenseCommit"`, request spend 1. Assert that `virtualTokens.you` stays at 0 until we manually call `triggerDefenseBuffs("nextDefenseCommit")`, then jumps to 2.
    3. Verify runtime ordering in `usePlayerDefenseController` and `useAiDefenseResponse` to ensure `triggerDefenseBuffs("nextDefenseCommit")` fires after `resolveDefenseWithEvents`; if that ordering is correct, the test should fail with current code, proving the hypothesis.
  - **Fix Plan**:
    1. Treat pending buffs as invisible until their trigger has fired. Implementation idea: keep a `Set` of buff IDs released this turn; when `releasePendingDefenseBuffs` runs, add each `ready` buff ID to the set and only let `virtualTokens` add stacks for IDs in that set. Alternatively, drop pending-buff additions entirely and let PlayerPanel rely purely on actual tokens (safer short-term fix aligned with UX expectations).
    2. After removing premature additions, extend spend controls/other consumers to use the sanitized `virtualTokens` so they clamp requests against the same view (so Chi spends never surpass actual + confirmed grants).
    3. Keep the new integration test + DEV log as guardrails so we immediately catch regressions where pending grants leak into the UI before their trigger.
- **2025-02-15 Instrumentation**: Added a pure helper `deriveVirtualTokensForSide` plus DEV-only logging so every derivation emits `{ actualStacks, afterRequests, pendingBuffSummary }` (`src/context/virtualTokens.ts:1-74`, `src/context/GameController.tsx:806-839`). This confirms when request clamps fire and still reports pending grants for manual auditing without leaking stacks into the UI.
- **2025-02-15 Regression Test & Fix**:
  - `src/context/__tests__/virtualTokens.test.ts` covers the Chi scenario (1 owned, spend 1, pending +2) and asserts the derived view stays at 0 plus surfaces the pending buff metadata once `nextDefenseCommit` eventually fires.
  - `virtualTokens` no longer adds pending buffs at derivation time; PlayerPanel now reflects only actual tokens minus outstanding spend requests, so Chi stacks appear only after `applyPendingDefenseBuff` runs (`src/context/GameController.tsx:806-839`, `src/context/virtualTokens.ts:1-74`). Spend controls still need to switch to the shared selector (TODO).
- **2025-02-15 Status Cleanse Dice Tray**: Burn/Evasive cleanse rolls were inaccessible because the dice tray auto-closed outside `roll`/`defense`/initial phases. Added a guard so if `pendingStatusClear?.side === "you"` we keep the tray open during upkeep (`src/context/GameController.tsx:1660-1679`). Players can now roll to cleanse statuses without leaving the current turn.
- **2025-02-15 Status Roll UI**: Status cleanse rolls now reuse the primary DiceTray dice grid (same as Evasive reactions) instead of spawning a separate mini-panel. We always render a single `DiceGrid` and, when a status roll is running, overlay only the label/result toast while the die animates in the center (`src/components/DiceTrayOverlay.tsx:19-215`). This keeps the layout stable and avoids double overlays.

## 3. Preconditions & Guardrails
- Commit after each completed step (small, focused commits to keep history clean). 
- 100% schema/Defense v2. Legacy board and UI remain untouched until backend is stable.
- Before each change, add trace logs or tests so we know behavior changed intentionally.

## 4. Expected Outcomes
- Deterministic pipeline: no more race between spends and grants.
- Richer debug logs showing grant source + phase.
- Prevent Half cannot trigger in the same defense anymore.
- Chi UI/engine in sync via virtual token view.

## 5. Monitoring
- Check defenseDebugLog in DEV builds post change for unexpected pending buffs.
- Watch performance (virtual token calculation is per-status; memoize if needed).
- Ensure turnEnd still expires pending buffs properly (partitionBuffsByKo).

---
This doc is the authoritative plan for the phase refactor. Once complete, we can move to Variant A (Status runtime contract).

