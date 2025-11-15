⚠️ Defense v2 Only: This plan applies exclusively to Defense v2 (schema). We do NOT touch the legacy board/defense logic.

# Status Phase & Buff Synchronization Plan (Variant B)

**Goal**: Align status spend/grant phases so Chi, Prevent Half, and other statuses behave deterministically. Based on docs/status-core-plan.md – we are executing Variant B.

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

### 5) Virtual tokens for Chi
- **Why**: we want engine + UI to read the same (tokens - requested + pending grants) view. Currently only PlayerPanel shows virtual counts.
- **Action**:
  - Introduce selector in GameController that derives 'effective tokens' for the player (actual tokens minus active requests plus pending grants).
  - Use that selector wherever we build defense plans or visualize tokens (PlayerPanel already mimics this; unify the logic).
  - Track pending grants per status so we can show future stacks (optional, but helps UI).
- **Risk**: rounding/ordering mistakes (grant & spend same tick).
  - **Mitigation**: keep engine operations on actual player.tokens; derived view used for UI/validation only. Unit-test the selector (Chi 3, request 2, pending grant 1 -> view = 2).
- **2025-02-14 Update**: `GameController` now computes `virtualTokens` by subtracting pending spend requests and layering in pending defense buffs with the same clamping rules we use when the buff resolves (`src/context/GameController.tsx:192` and `src/context/GameController.tsx:840`), and `PlayerPanel` consumes that shared view instead of rolling its own math (`src/components/PlayerPanel.tsx:17` and `src/components/PlayerPanel.tsx:27`). Remaining gaps: spend controls still read raw `player.tokens`, so they won't yet preview incoming Chi from pending grants.

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

