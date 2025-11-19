⚠️ **Defense v2 Focus**: Tento plan plati len pre defense-v2 (schema) a stary board uz neriesime.
🧱 **Status Architecture Reminder**: Kazdy status ma fungovat cez 'definicia + spravanie + faza' + pripadne unique hooks. Ciel je opravovat jadro status pipeline, nie manualne ladit kazdy status.


# Prevent Half Status - Current Wiring & Implementation Plan

## Damage Calculation Expectations
- Raw incoming damage (ex: 20) najprv prejde cez **flat/base block** z defense schema (napr. pravidlo „Block 1 na každom 1/2/3“). Po odčítaní (napr. 3) ostane 17.
- Ak má hráč stack `prevent_half`, promptne ho, či chce stack použiť. Ak áno, damage po blocku sa delí dvomi a zaokrúhli nahor: `ceil(17 / 2) = 9`, výsledné poškodenie = `17 - 9 = 8`.
- Prevent Half stack limit = 2 (všetky ďalšie granty sa stratia). V jednom kole sa spotrebuje max 1 stack, aj keď ich hráč drží viac.
- Stack získaný v aktuálnom defense kole nie je použiteľný okamžite – platí až od najbližšej ďalšej obrany (grant musí prejsť pending buff pipeline).
- Pipeline (požadovaný stav): flat block -> (voliteľný rozhodovací krok pre preventHalf) -> zvyšná damage pokračuje do ďalších modifierov/reflectov.

## 1. Current State (as of build 2025-11-15)
### Definition
- Not registered via `defineStatus` (no entry in `src/engine/status/defs.ts`).
- Only reference is constant `PREVENT_HALF_STATUS_ID = "prevent_half"` inside `src/defense/effects.ts`.
- No `behaviorId`, `spend`, or `onModify` logic exists, so runtime treats it as inert token metadata.

### How It’s Granted
1. **Defense Schema Effects**
   - Schema rule (e.g., `monk_prevent_on_6` in `src/game/heroes.ts`) specifies `effects: [{ type: "preventHalf", stacks: 1 }]`.
   - `executeDefenseEffects` › `applyPreventHalf` creates a `DefenseStatusGrant` with:
     - `status: "prevent_half"`
     - `target`: default `self`
     - `stacks`: `effect.stacks` (default 1)
     - `usablePhase`: `effect.usablePhase ?? "preApplyDamage"`
     - `expires`/`carryOverOnKO` passed through if configured.
2. **Grant Routing**
   - Schema runtime splits grants into immediate vs pending (`resolveDefenseSchemaRoll`). Prevent Half always ends up in `pendingStatusGrants` because `usablePhase` ? `immediate`.
   - `queuePendingDefenseGrants` stores them in `pendingDefenseBuffs` (GameState).
   - `triggerDefenseBuffs` is invoked across lifecycle phases (`preDefenseRoll`, `preApplyDamage`, `nextDefenseCommit`, etc.). When phase matches grant’s `usablePhase`, `applyPendingDefenseBuff` adds stacks to `player.tokens` and logs `[Status Ready] … gains prevent_half`.

### Visualization & Telemetry
- `TokenChips` includes config for `prevent_half` (yellow badge with multiplier) so tokens appear once buff applies.
- Combat log `getStatusGainLines` detects deltas in `prevent_half` and prints `gains <<status:Prevent Half>>` lines.
- Stats (`useDefenseActions` › `buildDefenseTelemetryDelta`) count occurrences where summary diffs show prevent-half stacks.

### Functional Gap
- Because there’s no status definition, neither `applyModifiers` nor `resolveAttack` consume the stacks › they don’t reduce damage. Buff merely shows up in tokens/logs, giving false sense of mitigation.
- `usablePhase` default = `preApplyDamage`, so grant applies during same defense, contradicting design (“usable from next defense only”).

## 2. Target Behavior
> Prevent Half should always be awarded during a defense resolution but only *activate on the next defense roll*, halving incoming damage once and then burning one stack.

## 3. Implementation Steps
1. **Status Definition**
   - Introduce `defineStatus({ id: "prevent_half", name: "Prevent Half", activation: "passive", windows: ["defense:beforeRoll", "damage:preApply"], maxStacks: desired cap })`.
   - Implement `onModify` to detect `phase === "defense"` (from `StatusModifyContext`). If `baseDamage` exists and stacks > 0:
     - Compute `reducedDamage = Math.floor(ctx.baseDamage / 2)` (or `ceil`, per balance).
     - Return `{ baseDamage: reducedDamage, log: "Prevent Half triggers …" }` and decrement stacks via `setStacks` outside `onModify` (likely in `applyModifiers` by extending logic to handle consume-on-modify statuses).
   - Alternatively, add explicit hook in `resolveAttack` before `applyAttack` to check `getStacks(tokens, "prevent_half")`, reduce `baseDamage`, and `setStacks` to remove one.

2. **Grant Timing Adjustment**
   - Update `DEFAULT_PREVENT_PHASE` to `"nextDefenseCommit"` (or create new phase). Ensure `triggerDefenseBuffs("nextDefenseCommit", owner)` fires *after* the current defense resolves but *before* the next selection.
   - Modify `applyPreventHalf` to set `usablePhase` to this new phase (unless explicitly overridden in schema JSON).
   - Verify `GameController`’s `releasePendingDefenseBuffs` knows how to match this phase (the helper already compares `buff.usablePhase === trigger.phase`).

3. **Consumption Logic**
   - Decide where to subtract stacks:
     - Option A: extend `applyModifiers` to allow statuses to mutate `stacks` as part of `onModify` result (requires careful refactor).
     - Option B: handle in `resolveAttack` before `applyAttack`: read `prevent_half` count, if >0 reduce `baseDamage`/`modifiedBaseDamage`, call `setStacks` with `count - 1`, and log event.
   - Ensure consumption happens once per incoming attack, regardless of how many stacks exist.

4. **Logging & UX**
   - Add explicit log when Prevent Half triggers (either via `onModify` log or manual log injection in `resolveAttack`).
   - Update schema panel / HowToPlay description to clarify “applies to next defense only”.

5. **Testing**
   - Unit tests verifying:
     - Grant appears as pending buff and only applies after `triggerDefenseBuffs("nextDefenseCommit")`.
     - Damage reduction occurs exactly once per stack and stacks decrement appropriately.
     - Interaction with other modifiers (Chi, Evasive) remains stable.

## 4. Risks & Watchouts
- **Phase Mismatch**: If `triggerDefenseBuffs("nextDefenseCommit")` isn’t called for AI or after certain transitions, stacks may never apply. Need to audit all paths entering defense.
- **Double-spend**: When `resolveAttack` manually decrements stacks, ensure pending grants can’t re-add stack during same resolution (ordering of `triggerDefenseBuffs("preApplyDamage")` vs. consumption matters).
- **UI Drift**: TokenChips now reflect adjusted counts (post-spend), so any asynchronous grant/consume must keep `player.tokens` accurate or UI misleads.
- **Balance**: Delaying effect reduces immediate survivability; confirm this matches intended design and adjust schema stack counts if necessary.
- **Shared Code Paths**: applyModifiers is used for both attack and defense modifiers. Adding prevent-half logic there mustn’t affect offensive states.

## 5. Open Questions
- Should Prevent Half halve *post-block* damage or the raw incoming damage? (Current plan assumes halving `baseDamage` pre-block; confirm with design.)
- What is the maximum number of stacks allowed concurrently (3 like Chi, or unlimited)?
- Do we need `turnLimited` budgets for Prevent Half, or is it purely grant-based?

---
Reference: derived from discussion on 2025-11-15 about deferring Prevent Half activation to future defenses.



